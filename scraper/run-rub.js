/**
 * Russia (RUB) 스크래퍼 — 10,000 RUB 기준
 * 실행: node --env-file=.env run-rub.js
 *
 * 지원 사업자: GME, GMoneyTrans, E9Pay
 * 수령 방식: Cash Payment, Card Payment
 *
 * Cash Payment: GME(Cash Payment), GMoneyTrans(Cash Pickup), E9Pay(코로나페이 캐시픽업)
 * Card Payment: GME(Card Payment), E9Pay(MIR/VISA카드)
 */
import { chromium } from 'playwright';
import { getRunHour, extractNumber, withRetry } from './lib/browser.js';
import { saveRates, logFailure } from './lib/supabase.js';
import { checkAlerts } from './lib/alerts.js';
import { loadFees, applyFeeOverrides, seedFees } from './lib/fees.js';

const COUNTRY = 'Russia';
const AMOUNT  = 10_000;

// ─── GME (API) ──────────────────────────────────────────────────────────────
// deliveryMethodCode: '1' = Cash Payment, '14' = Card Payment
async function scrapeGmeApi(deliveryMethodCode, deliveryMethodName) {
  const body = new URLSearchParams({
    method: 'GetExRate', pCurr: 'RUB', pCountryName: 'Russian Federation',
    collCurr: 'KRW', deliveryMethod: deliveryMethodCode, cAmt: '', pAmt: String(AMOUNT),
    cardOnline: 'false', calBy: 'P',
  }).toString();
  const res = await fetch('https://online.gmeremit.com/Default.aspx', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body, signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (data.errorCode !== '0') throw new Error(`GME API 오류: ${data.msg}`);
  const total = extractNumber(data.collAmt);
  const fee   = extractNumber(data.scCharge) ?? 0;
  if (!total) throw new Error('총 송금액 추출 실패');
  return { operator: 'GME', receiving_country: COUNTRY, receive_amount: AMOUNT,
    send_amount_krw: total - fee, service_fee: fee, total_sending_amount: total,
    delivery_method: deliveryMethodName };
}

// ─── GMoneyTrans (API — Cash Pickup only) ───────────────────────────────────
async function scrapeGmoneytrans() {
  const url = 'https://mapi.gmoneytrans.net/exratenew1/ajx_calcRate.asp'
    + `?receive_amount=${AMOUNT}`
    + '&payout_country=Russia'
    + '&total_collected=0'
    + '&payment_type=Cash+Pickup'
    + '&currencyType=RUB';
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  const serviceCharge = parseField(text, 'serviceCharge') ?? 5000;
  const sendAmount    = parseField(text, 'sendAmount');
  if (!sendAmount) throw new Error(`파싱 실패: ${text.slice(0, 200)}`);
  return { operator: 'GMoneyTrans', receiving_country: COUNTRY, receive_amount: AMOUNT,
    send_amount_krw: sendAmount, service_fee: serviceCharge,
    total_sending_amount: sendAmount + serviceCharge,
    delivery_method: 'Cash Payment' };
}
function parseField(text, field) {
  const m = text.match(new RegExp(`${field}--td_clm--([\\d.]+)--td_end--`));
  return m ? parseFloat(m[1]) : null;
}

// ─── E9Pay Cash (browser — reverse mode) ────────────────────────────────────
async function scrapeE9payCash(browser) {
  const page = await browser.newPage();
  try {
    await page.goto('https://www.e9pay.co.kr/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    // Select Russia
    await page.evaluate(() => {
      const radio = document.getElementById('RU_RUB');
      radio.checked = true;
      radio.dispatchEvent(new Event('change', { bubbles: true }));
      radio.click();
    });
    await page.waitForTimeout(2000);

    // Select Cash Payment (index 1)
    await page.evaluate(() => {
      const li = document.querySelectorAll('#remit-methods li')[1];
      if (li) li.querySelector('a')?.click();
    });
    await page.waitForTimeout(1500);

    // Read fee from method_map
    const feeFromMap = await page.evaluate(() => {
      if (typeof method_map !== 'undefined' && method_map['RU_RUB']?.[1]) {
        return Number(method_map['RU_RUB'][1].REMIT_FEE);
      }
      return null;
    });

    // Reverse mode — input receive amount directly
    await page.click('#reverse'); await page.waitForTimeout(500);
    await page.waitForSelector('#receive-money', { timeout: 5000 });
    await page.click('#receive-money', { clickCount: 3 });
    await page.fill('#receive-money', String(AMOUNT));
    await page.dispatchEvent('#receive-money', 'blur');

    let total = null;
    for (let attempt = 0; attempt < 10; attempt++) {
      await page.waitForTimeout(1000);
      const raw = await page.$eval('#send-money', el => el.value).catch(() => null);
      total = extractNumber(raw);
      if (total && total !== 1_000_000) break;
    }
    if (!total || total === 1_000_000) throw new Error('총 송금액 계산 대기 초과 (기본값 반환됨)');

    const feeRaw = await page.$eval('#remit-fee', el => el.textContent || el.value).catch(() => null);
    const fee = extractNumber(feeRaw) ?? feeFromMap ?? 0;

    return { operator: 'E9Pay', receiving_country: COUNTRY, receive_amount: AMOUNT,
      send_amount_krw: total, service_fee: fee,
      total_sending_amount: total + fee,
      delivery_method: 'Cash Payment' };
  } finally { await page.close(); }
}

// ─── E9Pay Card (browser — GME 송금액 기준 수취액 비교) ──────────────────────
// GME Card의 send_amount_krw(수수료 제외 순수 송금액)를 입력하여 E9Pay의 수취 RUB를 비교
async function scrapeE9payCard(browser, gmeSendAmountKRW) {
  const page = await browser.newPage();
  try {
    await page.goto('https://www.e9pay.co.kr/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    // Select Russia
    await page.evaluate(() => {
      const radio = document.getElementById('RU_RUB');
      radio.checked = true;
      radio.dispatchEvent(new Event('change', { bubbles: true }));
      radio.click();
    });
    await page.waitForTimeout(2000);

    // Select Card Payment (index 0)
    await page.evaluate(() => {
      const li = document.querySelectorAll('#remit-methods li')[0];
      if (li) li.querySelector('a')?.click();
    });
    await page.waitForTimeout(1500);

    // Read fee from method_map
    const feeFromMap = await page.evaluate(() => {
      if (typeof method_map !== 'undefined' && method_map['RU_RUB']?.[0]) {
        return Number(method_map['RU_RUB'][0].REMIT_FEE);
      }
      return 0;
    });

    // Input GME's send amount (fee excluded) — E9Pay exchanges the full amount
    await page.fill('#send-money', String(gmeSendAmountKRW));
    await page.press('#send-money', 'Tab');

    let receiveRUB = null;
    for (let attempt = 0; attempt < 10; attempt++) {
      await page.waitForTimeout(1000);
      const raw = await page.$eval('#receive-money', el => el.value).catch(() => null);
      receiveRUB = extractNumber(raw);
      if (receiveRUB && receiveRUB > 0) break;
    }
    if (!receiveRUB) throw new Error('수취액 계산 대기 초과');

    const feeRaw = await page.$eval('#remit-fee', el => el.textContent || el.value).catch(() => null);
    const fee = extractNumber(feeRaw) ?? feeFromMap ?? 0;

    return { operator: 'E9Pay', receiving_country: COUNTRY, receive_amount: receiveRUB,
      send_amount_krw: gmeSendAmountKRW, service_fee: fee,
      total_sending_amount: gmeSendAmountKRW + fee,
      delivery_method: 'Card Payment' };
  } finally { await page.close(); }
}

// ─── 스크래퍼 목록 (Phase 1 — GME Card 결과 불필요) ──────────────────────────
const PHASE1_SCRAPERS = [
  // Cash Payment
  { name: 'GME (Cash)',         fn: () => scrapeGmeApi('1', 'Cash Payment'),                         needsBrowser: false },
  { name: 'GMoneyTrans (Cash)', fn: scrapeGmoneytrans,                                               needsBrowser: false },
  { name: 'E9Pay (Cash)',       fn: (b) => withRetry(() => scrapeE9payCash(b)),                      needsBrowser: true },
  // Card Payment — GME only (E9Pay Card는 Phase 2에서 실행)
  { name: 'GME (Card)',         fn: () => scrapeGmeApi('14', 'Card Payment'),                        needsBrowser: false },
];

// ─── 메인 ─────────────────────────────────────────────────────────────────────
async function main() {
  const runHour = getRunHour();
  console.log(`\n[${new Date().toISOString()}] Russia RUB 스크래핑 시작 — run_hour: ${runHour}\n`);

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const results = [];
  const errors  = [];

  // ── Phase 1: GME + 기타 스크래퍼 병렬 실행 ──────────────────────────────
  console.log(`  Phase 1: 스크래퍼 병렬 실행 중... (${PHASE1_SCRAPERS.length}개)\n`);
  const settled = await Promise.allSettled(
    PHASE1_SCRAPERS.map(({ fn, needsBrowser }) => (needsBrowser ? fn(browser) : fn()))
  );

  for (let i = 0; i < settled.length; i++) {
    const { name } = PHASE1_SCRAPERS[i];
    const result = settled[i];
    if (result.status === 'fulfilled') {
      results.push(result.value);
      console.log(`  ✓ ${name}: 송금액 ${result.value.send_amount_krw?.toLocaleString()}원  수수료 ${result.value.service_fee?.toLocaleString()}원  합계 ${result.value.total_sending_amount?.toLocaleString()}원`);
    } else {
      console.error(`  ✗ ${name} 실패: ${result.reason?.message}`);
      errors.push({ name, error: result.reason?.message });
      logFailure(runHour, COUNTRY, name, result.reason?.delivery_method ?? 'Cash Payment', result.reason?.message);
    }
  }

  // ── Phase 2: E9Pay Card — GME Card의 send_amount_krw를 입력으로 사용 ─────
  const gmeCard = results.find(r => r.operator === 'GME' && r.delivery_method === 'Card Payment');
  if (gmeCard) {
    console.log(`\n  Phase 2: E9Pay Card 실행 (GME 송금액 ${gmeCard.send_amount_krw.toLocaleString()}원, 수수료 제외)\n`);
    try {
      const e9payCard = await withRetry(() => scrapeE9payCard(browser, gmeCard.send_amount_krw));
      results.push(e9payCard);
      console.log(`  ✓ E9Pay (Card): 수취액 ${e9payCard.receive_amount?.toLocaleString()} RUB  수수료 ${e9payCard.service_fee?.toLocaleString()}원  합계 ${e9payCard.total_sending_amount?.toLocaleString()}원`);
    } catch (err) {
      console.error(`  ✗ E9Pay (Card) 실패: ${err.message}`);
      errors.push({ name: 'E9Pay (Card)', error: err.message });
      logFailure(runHour, COUNTRY, 'E9Pay', 'Card Payment', err.message);
    }
  } else {
    console.warn('\n  ⚠️  GME Card 실패로 E9Pay Card 스킵 (기준 송금액 없음)');
    errors.push({ name: 'E9Pay (Card)', error: 'GME Card 실패로 스킵' });
    logFailure(runHour, COUNTRY, 'E9Pay', 'Card Payment', 'GME Card 실패로 스킵');
  }

  await browser.close();

  if (results.length === 0) {
    console.error('\n모든 스크래퍼 실패. 종료합니다.');
    process.exit(1);
  }

  // ── 수수료 오버라이드 적용 ────────────────────────────────────────────
  const feeMap = await loadFees(COUNTRY);
  const adjusted = applyFeeOverrides(results, feeMap);

  // ── GME 기준값 (delivery-method-aware) ────────────────────────────────
  const gmeBaselineMap = new Map();
  adjusted.filter(r => r.operator === 'GME').forEach(r => {
    gmeBaselineMap.set(r.delivery_method, r.total_sending_amount);
  });

  if (gmeBaselineMap.size === 0) console.warn('\n⚠️  GME 기준값 없음 — price_gap 계산 불가');

  const toSave = adjusted.map(r => {
    const baseline = gmeBaselineMap.get(r.delivery_method) ?? null;
    let priceGap, status;

    if (baseline && r.operator !== 'GME') {
      priceGap = r.total_sending_amount - baseline;
      status = priceGap > 0 ? 'GME 유리' : '경쟁사 유리';
    } else {
      priceGap = null;
      status = null;
    }

    return {
      run_hour:             runHour,
      operator:             r.operator,
      receiving_country:    r.receiving_country,
      receive_amount:       r.receive_amount,
      send_amount_krw:      r.send_amount_krw,
      service_fee:          r.service_fee ?? 0,
      total_sending_amount: r.total_sending_amount,
      gme_baseline:         baseline,
      price_gap:            priceGap,
      status:               status,
      delivery_method:      r.delivery_method,
    };
  });

  try {
    await saveRates(toSave);
    console.log(`\n✅ ${toSave.length}건 Supabase 저장 완료 (Russia RUB)`);
    await checkAlerts(toSave, runHour);
    await seedFees(toSave);
  } catch (err) {
    console.error(`\n❌ Supabase 저장 실패: ${err.message}`);
    process.exit(1);
  }

  if (errors.length > 0) {
    console.warn(`\n⚠️  실패한 스크래퍼 (${errors.length}개):`);
    errors.forEach(e => console.warn(`   - ${e.name}: ${e.error}`));
  }

  console.log('\n── Russia RUB 10,000 결과 요약 ─────────────────────────────────────');
  console.log(`${'운영사'.padEnd(14)} ${'수령방식'.padEnd(14)} ${'송금액(KRW)'.padStart(12)} ${'수수료'.padStart(8)} ${'합계'.padStart(12)} 차이`);
  console.log('─'.repeat(74));
  toSave.sort((a, b) => {
    const methodOrder = a.delivery_method.localeCompare(b.delivery_method);
    return methodOrder !== 0 ? methodOrder : a.total_sending_amount - b.total_sending_amount;
  }).forEach(r => {
    const gap = r.price_gap !== null ? `${r.price_gap > 0 ? '+' : ''}${r.price_gap.toLocaleString()}원` : '';
    console.log(
      `${r.operator.padEnd(14)} ${r.delivery_method.padEnd(14)} ${r.send_amount_krw.toLocaleString().padStart(12)} ${(r.service_fee || 0).toLocaleString().padStart(8)} ${r.total_sending_amount.toLocaleString().padStart(12)} ${gap}`
    );
  });
  console.log('\n완료.\n');
}

main().catch(err => {
  console.error('예기치 않은 오류:', err);
  process.exit(1);
});
