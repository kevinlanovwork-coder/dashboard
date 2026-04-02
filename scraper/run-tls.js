/**
 * Timor Leste (USD) 스크래퍼 — 1,000 USD 기준
 * 실행: node --env-file=.env run-tls.js
 *
 * 지원 사업자: Hanpass, GMoneyTrans
 * 수령 방식: Bank Deposit, Cash Pickup (MoneyGram)
 */
import { chromium } from 'playwright';
import { getRunHour, extractNumber, withRetry } from './lib/browser.js';
import { saveRates, logFailure } from './lib/supabase.js';
import { checkAlerts } from './lib/alerts.js';
import { loadFees, applyFeeOverrides, seedFees } from './lib/fees.js';

const COUNTRY = 'Timor Leste';
const AMOUNT  = 1_000;

// ─── GMoneyTrans (API — Bank Deposit) ─────────────────────────────────────────
async function scrapeGmoneytransBankDeposit() {
  const url = 'https://mapi.gmoneytrans.net/exratenew1/ajx_calcRate.asp'
    + `?receive_amount=${AMOUNT}`
    + '&payout_country=Timor-Leste'
    + '&total_collected=0'
    + '&payment_type=Bank+Account'
    + '&currencyType=USD';
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  const sendAmount = parseField(text, 'sendAmount');
  if (!sendAmount) throw new Error(`파싱 실패: ${text.slice(0, 200)}`);
  const fee = 0;
  return { operator: 'GMoneyTrans', receiving_country: COUNTRY, receive_amount: AMOUNT,
    send_amount_krw: sendAmount, service_fee: fee,
    total_sending_amount: sendAmount + fee,
    delivery_method: 'Bank Deposit' };
}

// ─── GMoneyTrans (API — Cash Pickup MoneyGram) ────────────────────────────────
async function scrapeGmoneytransCashPickup() {
  const url = 'https://mapi.gmoneytrans.net/exratenew1/ajx_calcRate.asp'
    + `?receive_amount=${AMOUNT}`
    + '&payout_country=Timor-Leste'
    + '&total_collected=0'
    + '&payment_type=Cash+Pickup'
    + '&currencyType=USD';
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  const sendAmount = parseField(text, 'sendAmount');
  if (!sendAmount) throw new Error(`파싱 실패: ${text.slice(0, 200)}`);
  const fee = 0;
  return { operator: 'GMoneyTrans', receiving_country: COUNTRY, receive_amount: AMOUNT,
    send_amount_krw: sendAmount, service_fee: fee,
    total_sending_amount: sendAmount + fee,
    delivery_method: 'Cash Pickup (MoneyGram)' };
}

function parseField(text, field) {
  const m = text.match(new RegExp(`${field}--td_clm--([\\d.]+)--td_end--`));
  return m ? parseFloat(m[1]) : null;
}

// ─── Hanpass (API — Bank Deposit) ─────────────────────────────────────────────
async function scrapeHanpassBankDeposit() {
  const res = await fetch('https://app.hanpass.com/app/v1/remittance/get-cost', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ inputAmount: String(AMOUNT), inputCurrencyCode: 'USD',
      fromCurrencyCode: 'KRW', toCurrencyCode: 'USD', toCountryCode: 'TL',
      remittanceOption: 'BANK_TRANSFER', memberSeq: '1', lang: 'en' }),
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
    delivery_method: 'Bank Deposit' };
}

// ─── Hanpass (API — Cash Pickup MoneyGram) ────────────────────────────────────
async function scrapeHanpassCashPickup() {
  const res = await fetch('https://app.hanpass.com/app/v1/remittance/get-cost', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ inputAmount: String(AMOUNT), inputCurrencyCode: 'USD',
      fromCurrencyCode: 'KRW', toCurrencyCode: 'USD', toCountryCode: 'TL',
      remittanceOption: 'CASH_PICKUP', memberSeq: '1', lang: 'en' }),
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
    delivery_method: 'Cash Pickup (MoneyGram)' };
}

// ─── 스크래퍼 목록 ────────────────────────────────────────────────────────────
const SCRAPERS = [
  { name: 'GMoneyTrans (Bank Deposit)',     fn: scrapeGmoneytransBankDeposit,  needsBrowser: false },
  { name: 'GMoneyTrans (Cash Pickup)',      fn: scrapeGmoneytransCashPickup,   needsBrowser: false },
  { name: 'Hanpass (Bank Deposit)',         fn: () => withRetry(scrapeHanpassBankDeposit),  needsBrowser: false },
  { name: 'Hanpass (Cash Pickup)',          fn: () => withRetry(scrapeHanpassCashPickup),   needsBrowser: false },
];

// ─── 메인 ─────────────────────────────────────────────────────────────────────
async function main() {
  const runHour = getRunHour();
  console.log(`\n[${new Date().toISOString()}] Timor Leste USD 스크래핑 시작 — run_hour: ${runHour}\n`);

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
      logFailure(runHour, COUNTRY, name, 'Bank Deposit', result.reason?.message);
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

  // GME 기준값 — delivery_method 별로 분리
  // (GME not available yet, use null baselines)
  const toSave = adjusted.map(r => {
    return {
      run_hour:             runHour,
      operator:             r.operator,
      receiving_country:    r.receiving_country,
      receive_amount:       r.receive_amount,
      send_amount_krw:      r.send_amount_krw,
      service_fee:          r.service_fee ?? 0,
      total_sending_amount: r.total_sending_amount,
      gme_baseline:         null,
      price_gap:            null,
      status:               null,
      delivery_method:      r.delivery_method,
    };
  });

  try {
    await saveRates(toSave);
    console.log(`\n✅ ${toSave.length}건 Supabase 저장 완료 (Timor Leste USD)`);
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

  console.log('\n── Timor Leste USD 1,000 결과 요약 ──────────────────────────────────');
  console.log(`${'운영사'.padEnd(14)} ${'수령방식'.padEnd(24)} ${'송금액(KRW)'.padStart(12)} ${'수수료'.padStart(8)} ${'합계'.padStart(12)}`);
  console.log('─'.repeat(74));
  toSave.sort((a, b) => a.total_sending_amount - b.total_sending_amount).forEach(r => {
    console.log(
      `${r.operator.padEnd(14)} ${r.delivery_method.padEnd(24)} ${r.send_amount_krw.toLocaleString().padStart(12)} ${(r.service_fee || 0).toLocaleString().padStart(8)} ${r.total_sending_amount.toLocaleString().padStart(12)}`
    );
  });
  console.log('\n완료.\n');
}

main().catch(err => {
  console.error('예기치 않은 오류:', err);
  process.exit(1);
});
