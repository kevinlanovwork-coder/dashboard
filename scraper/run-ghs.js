/**
 * Ghana (GHS) 스크래퍼 — 5,000 GHS 기준
 * 실행: node --env-file=.env run-ghs.js
 *
 * 지원 사업자: GME, GMoneyTrans
 * 수령 방식: Bank Deposit, Mobile Wallet
 */
import { chromium } from 'playwright';
import { getRunHour, extractNumber, withRetry } from './lib/browser.js';
import { saveRates, saveRealtimeCheck, isDryRun, logFailure } from './lib/supabase.js';
import { checkAlerts } from './lib/alerts.js';
import { loadFees, applyFeeOverrides, seedFees } from './lib/fees.js';

const COUNTRY = 'Ghana';
const AMOUNT  = 5_000;

// ─── GME (API) ──────────────────────────────────────────────────────────────
// deliveryMethodCode: '2' = Bank Deposit, '13' = Mobile Wallet
async function scrapeGmeApi(deliveryMethodCode, deliveryMethodName) {
  const body = new URLSearchParams({
    method: 'GetExRate', pCurr: 'GHS', pCountryName: 'Ghana',
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

// ─── GMoneyTrans (API) ──────────────────────────────────────────────────────
// paymentType: 'Bank+Account' = Bank Deposit, 'MTN' = Mobile Wallet
async function scrapeGmoneytrans(paymentType, deliveryMethodName) {
  const url = 'https://mapi.gmoneytrans.net/exratenew1/ajx_calcRate.asp'
    + `?receive_amount=${AMOUNT}`
    + '&payout_country=Ghana'
    + '&total_collected=0'
    + `&payment_type=${encodeURIComponent(paymentType)}`
    + '&currencyType=GHS';
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  const serviceCharge = parseField(text, 'serviceCharge') ?? 5000;
  const sendAmount    = parseField(text, 'sendAmount');
  if (!sendAmount) throw new Error(`파싱 실패: ${text.slice(0, 200)}`);
  return { operator: 'GMoneyTrans', receiving_country: COUNTRY, receive_amount: AMOUNT,
    send_amount_krw: sendAmount, service_fee: serviceCharge,
    total_sending_amount: sendAmount + serviceCharge,
    delivery_method: deliveryMethodName };
}
function parseField(text, field) {
  const m = text.match(new RegExp(`${field}--td_clm--([\\d.]+)--td_end--`));
  return m ? parseFloat(m[1]) : null;
}

// ─── 스크래퍼 목록 ────────────────────────────────────────────────────────────
const SCRAPERS = [
  // Bank Deposit
  { name: 'GME (Bank)',         fn: () => withRetry(() => scrapeGmeApi('2', 'Bank Deposit')),                needsBrowser: false },
  { name: 'GMoneyTrans (Bank)', fn: () => scrapeGmoneytrans('Bank+Account', 'Bank Deposit'),                needsBrowser: false },
  // Mobile Wallet
  { name: 'GME (Mobile)',         fn: () => withRetry(() => scrapeGmeApi('13', 'Mobile Wallet')),            needsBrowser: false },
  { name: 'GMoneyTrans (Mobile)', fn: () => scrapeGmoneytrans('MTN', 'Mobile Wallet'),                      needsBrowser: false },
];

// ─── 메인 ─────────────────────────────────────────────────────────────────────
async function main() {
  const runHour = getRunHour();
  console.log(`\n[${new Date().toISOString()}] Ghana GHS 스크래핑 시작 — run_hour: ${runHour}\n`);

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
    const { name } = SCRAPERS[i];
    const result = settled[i];
    if (result.status === 'fulfilled') {
      results.push(result.value);
      console.log(`  ✓ ${name}: 송금액 ${result.value.send_amount_krw?.toLocaleString()}원  수수료 ${result.value.service_fee?.toLocaleString()}원  합계 ${result.value.total_sending_amount?.toLocaleString()}원`);
    } else {
      console.error(`  ✗ ${name} 실패: ${result.reason?.message}`);
      errors.push({ name, error: result.reason?.message });
      const dm = name.includes('Mobile') ? 'Mobile Wallet' : 'Bank Deposit';
      logFailure(runHour, COUNTRY, name.split(' ')[0], dm, result.reason?.message);
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
    if (isDryRun()) {
      await saveRealtimeCheck(toSave, process.env.CHECK_ID);
    } else {
      await saveRates(toSave);
    }
    console.log(`\n✅ ${toSave.length}건 Supabase 저장 완료 (Ghana GHS)`);
    if (!isDryRun()) await checkAlerts(toSave, runHour);
    if (!isDryRun()) await seedFees(toSave);
  } catch (err) {
    console.error(`\n❌ Supabase 저장 실패: ${err.message}`);
    process.exit(1);
  }

  if (errors.length > 0) {
    console.warn(`\n⚠️  실패한 스크래퍼 (${errors.length}개):`);
    errors.forEach(e => console.warn(`   - ${e.name}: ${e.error}`));
  }

  console.log('\n── Ghana GHS 5,000 결과 요약 ────────────────────────────────────────');
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
