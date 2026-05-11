/**
 * Cambodia (USD) 스크래퍼 — 1,000 USD 기준
 * 실행: node --env-file=.env run-usd.js
 *
 * 지원 사업자: GME, GMoneyTrans, Hanpass, SBI, E9Pay
 */
import { chromium } from 'playwright';
import { getRunHour, extractNumber, withRetry } from './lib/browser.js';
import { saveRates, logFailure } from './lib/supabase.js';
import { checkAlerts } from './lib/alerts.js';
import { loadFees, applyFeeOverrides, seedFees } from './lib/fees.js';

const COUNTRY = 'Cambodia';
const AMOUNT  = 1_000;

// ─── GME (API) ────────────────────────────────────────────────────────────────
// dm=2: Bank Deposit, dm=1: Cash Pickup
async function scrapeGme(dm, method) {
  const body = new URLSearchParams({
    method: 'GetExRate', pCurr: 'USD', pCountryName: 'Cambodia',
    collCurr: 'KRW', deliveryMethod: dm, cAmt: '', pAmt: String(AMOUNT),
    cardOnline: 'false', calBy: 'P',
  }).toString();
  const res = await fetch('https://online.gmeremit.com/Default.aspx', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
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
    delivery_method: method };
}

// ─── GMoneyTrans (API) ────────────────────────────────────────────────────────
async function scrapeGmoneytrans(paymentType, method) {
  const url = 'https://mapi.gmoneytrans.net/exratenew1/ajx_calcRate.asp'
    + `?receive_amount=${AMOUNT}`
    + '&payout_country=Cambodia'
    + '&total_collected=0'
    + '&payment_type=' + encodeURIComponent(paymentType)
    + '&currencyType=USD';
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  const serviceCharge = parseField(text, 'serviceCharge') ?? 2500;
  const sendAmount    = parseField(text, 'sendAmount');
  if (!sendAmount) throw new Error(`파싱 실패: ${text.slice(0, 200)}`);
  return { operator: 'GMoneyTrans', receiving_country: COUNTRY, receive_amount: AMOUNT,
    send_amount_krw: sendAmount, service_fee: serviceCharge,
    total_sending_amount: sendAmount + serviceCharge,
    delivery_method: method };
}
function parseField(text, field) {
  const m = text.match(new RegExp(`${field}--td_clm--([\\d.]+)--td_end--`));
  return m ? parseFloat(m[1]) : null;
}

// ─── Hanpass (API) ────────────────────────────────────────────────────────────
async function scrapeHanpass(remittanceOption, method) {
  const res = await fetch('https://app.hanpass.com/app/v1/remittance/get-cost', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ inputAmount: String(AMOUNT), inputCurrencyCode: 'USD',
      fromCurrencyCode: 'KRW', toCurrencyCode: 'USD', toCountryCode: 'KH',
      remittanceOption, memberSeq: '1', lang: 'en' }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (data.resultCode !== '0') throw new Error(`Hanpass API 오류: ${data.resultMessage}`);
  const total = data.depositAmountIncludingFee;
  const fee   = data.transferFee ?? 0;
  if (!total) throw new Error('총 송금액 추출 실패');
  return { operator: 'Hanpass', receiving_country: COUNTRY, receive_amount: AMOUNT,
    send_amount_krw: total - fee, service_fee: fee, total_sending_amount: total,
    delivery_method: method };
}

// ─── SBI ──────────────────────────────────────────────────────────────────────
// SBI Cambodia only offers Cash Pickup on their site; we reuse the same values for Bank Deposit
async function scrapeSbi(browser) {
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    locale: 'ko-KR',
  });
  const page = await context.newPage();
  try {
    await page.goto('https://www.sbicosmoney.com/', { waitUntil: 'load', timeout: 30000 });
    await page.waitForTimeout(2000);
    await page.click('button:has-text("Close")').catch(() => null); await page.waitForTimeout(500);
    await page.click('.dest-country'); await page.waitForTimeout(500);
    await page.click('a[data-currency="USD"]'); await page.waitForTimeout(1500);
    await page.click('#targetAmount', { clickCount: 3 });
    await page.fill('#targetAmount', String(AMOUNT));
    await page.dispatchEvent('#targetAmount', 'input');
    let sendAmt = null;
    for (let attempt = 0; attempt < 10; attempt++) {
      await page.waitForTimeout(1000);
      const raw = await page.inputValue('#krwAmount');
      sendAmt = extractNumber(raw);
      if (sendAmt && sendAmt !== 1_000_000) break;
    }
    if (!sendAmt || sendAmt === 1_000_000) throw new Error('총 송금액 계산 대기 초과 (기본값 반환됨)');
    const feeRaw = await page.$eval('.fee-amount', el => el.textContent).catch(() => null);
    const fee = extractNumber(feeRaw) ?? 5000;
    const base = { operator: 'SBI', receiving_country: COUNTRY, receive_amount: AMOUNT,
      send_amount_krw: sendAmt, service_fee: fee, total_sending_amount: sendAmt + fee };
    return [
      { ...base, delivery_method: 'Bank Deposit' },
      { ...base, delivery_method: 'Cash Pickup' },
    ];
  } finally { await page.close(); await context.close(); }
}

// ─── E9Pay (Playwright) ──────────────────────────────────────────────────────
// methodIndex: 0 = ABA Bank Account (default), 4 = AMK Cash Pick-Up
async function scrapeE9pay(browser, methodIndex, method) {
  const page = await browser.newPage();
  try {
    await page.goto('https://www.e9pay.co.kr/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);
    await page.waitForSelector('#KH_USD', { state: 'attached', timeout: 10000 });
    await page.evaluate(() => {
      const radio = document.querySelector('#KH_USD');
      radio.checked = true;
      radio.dispatchEvent(new Event('change', { bubbles: true }));
      radio.dispatchEvent(new Event('click',  { bubbles: true }));
    });
    await page.waitForTimeout(2000);
    if (methodIndex > 0) {
      await page.evaluate((idx) => {
        const li = document.querySelectorAll('#remit-methods li')[idx];
        if (li) li.querySelector('a').click();
      }, methodIndex);
      await page.waitForTimeout(1500);
    }
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
    const fee = extractNumber(feeRaw) ?? 0;
    return { operator: 'E9Pay', receiving_country: COUNTRY, receive_amount: AMOUNT,
      send_amount_krw: total, service_fee: fee, total_sending_amount: total + fee,
      delivery_method: method };
  } finally { await page.close(); }
}

// ─── 스크래퍼 목록 ────────────────────────────────────────────────────────────
const SCRAPERS = [
  // Bank Deposit
  { name: 'GME (Bank Deposit)',         fn: () => withRetry(() => scrapeGme('2', 'Bank Deposit')),                needsBrowser: false },
  { name: 'GMoneyTrans (Bank Deposit)', fn: () => scrapeGmoneytrans('Bank Account', 'Bank Deposit'),             needsBrowser: false },
  { name: 'Hanpass (Bank Deposit)',     fn: () => withRetry(() => scrapeHanpass('BANK_TRANSFER', 'Bank Deposit')),needsBrowser: false },
  { name: 'E9Pay (Bank Deposit)',       fn: (b) => withRetry(() => scrapeE9pay(b, 0, 'Bank Deposit')),           needsBrowser: true  },
  // Cash Pickup
  { name: 'GME (Cash Pickup)',          fn: () => withRetry(() => scrapeGme('1', 'Cash Pickup')),                 needsBrowser: false },
  { name: 'GMoneyTrans (Cash Pickup)',  fn: () => scrapeGmoneytrans('Cash Pickup', 'Cash Pickup'),               needsBrowser: false },
  { name: 'Hanpass (Cash Pickup)',      fn: () => withRetry(() => scrapeHanpass('CASH_PICKUP', 'Cash Pickup')),   needsBrowser: false },
  { name: 'SBI',                        fn: (b) => withRetry(() => scrapeSbi(b)),                                 needsBrowser: true, multi: true },
  { name: 'E9Pay (Cash Pickup)',        fn: (b) => withRetry(() => scrapeE9pay(b, 4, 'Cash Pickup')),            needsBrowser: true  },
];

// ─── 메인 ─────────────────────────────────────────────────────────────────────
async function main() {
  const runHour = getRunHour();
  console.log(`\n[${new Date().toISOString()}] Cambodia USD 스크래핑 시작 — run_hour: ${runHour}\n`);

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const results = [];
  const errors  = [];

  console.log(`  모든 스크래퍼 병렬 실행 중... (${SCRAPERS.length}개)\n`);
  const settled = await Promise.allSettled(
    SCRAPERS.map(({ fn, needsBrowser }) => (needsBrowser ? fn(browser) : fn()))
  );

  for (let i = 0; i < settled.length; i++) {
    const { name, multi } = SCRAPERS[i];
    const result = settled[i];
    if (result.status === 'fulfilled') {
      if (multi && Array.isArray(result.value)) {
        for (const r of result.value) {
          results.push(r);
          console.log(`  ✓ ${name} (${r.delivery_method}): 송금액 ${r.send_amount_krw?.toLocaleString()}원  수수료 ${r.service_fee?.toLocaleString()}원  합계 ${r.total_sending_amount?.toLocaleString()}원`);
        }
      } else {
        results.push(result.value);
        console.log(`  ✓ ${name}: 송금액 ${result.value.send_amount_krw?.toLocaleString()}원  수수료 ${result.value.service_fee?.toLocaleString()}원  합계 ${result.value.total_sending_amount?.toLocaleString()}원`);
      }
    } else {
      console.error(`  ✗ ${name} 실패: ${result.reason?.message}`);
      errors.push({ name, error: result.reason?.message });
      logFailure(runHour, COUNTRY, name, result.reason?.delivery_method ?? 'Bank Deposit', result.reason?.message);
    }
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
    const priceGap = baseline && r.operator !== 'GME'
      ? r.total_sending_amount - baseline : null;
    const status = priceGap === null ? null : priceGap > 0 ? 'GME 유리' : '경쟁사 유리';
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
    console.log(`\n✅ ${toSave.length}건 Supabase 저장 완료 (Cambodia USD)`);
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

  console.log('\n── Cambodia USD 1,000 결과 요약 ───────────────────────────────────');
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
