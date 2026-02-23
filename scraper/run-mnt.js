/**
 * Mongolia (MNT) 스크래퍼 — 2,500,000 MNT 기준
 * 실행: node --env-file=.env run-mnt.js
 *
 * 지원 사업자: GME, GMoneyTrans, Utransfer, Cross, E9Pay, Coinshot, Hanpass
 */
import { chromium } from 'playwright';
import { getRunHour, extractNumber, withRetry } from './lib/browser.js';
import { saveRates } from './lib/supabase.js';

const COUNTRY = 'Mongolia';
const AMOUNT  = 2_500_000;

// ─── GME (API) ────────────────────────────────────────────────────────────────
async function scrapeGme() {
  const body = new URLSearchParams({
    method: 'GetExRate', pCurr: 'MNT', pCountryName: 'Mongolia',
    collCurr: 'KRW', deliveryMethod: '2', cAmt: '', pAmt: String(AMOUNT),
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
  if (!total) throw new Error('총 송금액 추출 실패');
  return { operator: 'GME', receiving_country: COUNTRY, receive_amount: AMOUNT,
    send_amount_krw: total, service_fee: 0, total_sending_amount: total };
}

// ─── GMoneyTrans (API) ────────────────────────────────────────────────────────
async function scrapeGmoneytrans() {
  const url = 'https://mapi.gmoneytrans.net/exratenew1/ajx_calcRate.asp'
    + `?receive_amount=${AMOUNT}`
    + '&payout_country=Mongolia'
    + '&total_collected=0'
    + '&payment_type=Bank+Account'
    + '&currencyType=MNT';
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  const serviceCharge = parseField(text, 'serviceCharge') ?? 2500;
  const sendAmount    = parseField(text, 'sendAmount');
  if (!sendAmount) throw new Error(`파싱 실패: ${text.slice(0, 200)}`);
  return { operator: 'GMoneyTrans', receiving_country: COUNTRY, receive_amount: AMOUNT,
    send_amount_krw: sendAmount, service_fee: serviceCharge,
    total_sending_amount: sendAmount + serviceCharge };
}
function parseField(text, field) {
  const m = text.match(new RegExp(`${field}--td_clm--([\\d.]+)--td_end--`));
  return m ? parseFloat(m[1]) : null;
}

// ─── Utransfer ────────────────────────────────────────────────────────────────
async function scrapeUtransfer(browser) {
  const page = await browser.newPage();
  try {
    await page.goto('https://www.utransfer.com', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);
    await page.locator('select').nth(1).selectOption('MNT');
    await page.waitForTimeout(1000);
    await page.click('input[name="toAmount"]', { clickCount: 3 });
    await page.fill('input[name="toAmount"]', String(AMOUNT));
    await page.dispatchEvent('input[name="toAmount"]', 'change');
    await page.waitForTimeout(3000);
    const raw = await page.inputValue('input[name="fromAmount"]').catch(() => null);
    const sendAmt = extractNumber(raw);
    if (!sendAmt) throw new Error('총 송금액 추출 실패');
    const feeRaw = await page.locator('.utransfer_fees').textContent().catch(() => null);
    const fee = extractNumber(feeRaw) ?? 5000;
    return { operator: 'Utransfer', receiving_country: COUNTRY, receive_amount: AMOUNT,
      send_amount_krw: sendAmt, service_fee: fee, total_sending_amount: sendAmt + fee };
  } finally { await page.close(); }
}

// ─── Cross ────────────────────────────────────────────────────────────────────
async function scrapeCross(browser) {
  const page = await browser.newPage();
  try {
    await page.goto('https://crossenf.com/remittance', { waitUntil: 'load', timeout: 30000 });
    await page.waitForTimeout(2000);
    await page.locator('div.relative:has(span:text("THB"))').click();
    await page.waitForSelector('#aside-root ul', { timeout: 10000 });
    await page.locator('#aside-root li:has(img[alt="MN flag"])').click();
    await page.waitForTimeout(1000);
    const receiveInput = page.locator('input[inputmode="numeric"]').nth(1);
    await receiveInput.click({ clickCount: 3 });
    await receiveInput.fill(String(AMOUNT));
    await receiveInput.press('Tab');
    await page.waitForTimeout(3000);
    const totalRaw = await page.locator('input[inputmode="numeric"]').nth(0).inputValue();
    const total = extractNumber(totalRaw);
    if (!total) throw new Error('총 송금액 추출 실패');
    const fee = 5000;
    return { operator: 'Cross', receiving_country: COUNTRY, receive_amount: AMOUNT,
      send_amount_krw: total, service_fee: fee, total_sending_amount: total + fee };
  } finally { await page.close(); }
}

// ─── E9Pay ────────────────────────────────────────────────────────────────────
async function scrapeE9pay(browser) {
  const page = await browser.newPage();
  try {
    await page.goto('https://www.e9pay.co.kr/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);
    await page.waitForSelector('#MN_MNT', { state: 'attached', timeout: 10000 });
    await page.evaluate(() => {
      const radio = document.querySelector('#MN_MNT');
      radio.checked = true;
      radio.dispatchEvent(new Event('change', { bubbles: true }));
      radio.dispatchEvent(new Event('click', { bubbles: true }));
    });
    await page.waitForTimeout(1000);
    await page.click('#reverse'); await page.waitForTimeout(500);
    await page.waitForSelector('#receive-money', { timeout: 5000 });
    await page.click('#receive-money', { clickCount: 3 });
    await page.fill('#receive-money', String(AMOUNT));
    await page.dispatchEvent('#receive-money', 'blur');
    await page.waitForTimeout(3000);
    const raw = await page.$eval('#send-money', el => el.value).catch(() => null);
    const total = extractNumber(raw);
    if (!total) throw new Error('총 송금액 추출 실패');
    const feeRaw = await page.$eval('#remit-fee', el => el.textContent || el.value).catch(() => null);
    const fee = extractNumber(feeRaw) ?? 0;
    return { operator: 'E9Pay', receiving_country: COUNTRY, receive_amount: AMOUNT,
      send_amount_krw: total, service_fee: fee, total_sending_amount: total + fee };
  } finally { await page.close(); }
}

// ─── Coinshot ─────────────────────────────────────────────────────────────────
async function scrapeCoinshot(browser) {
  const page = await browser.newPage();
  try {
    await page.goto('https://coinshot.org/main', { waitUntil: 'load', timeout: 30000 });
    await page.waitForTimeout(2000);
    await page.waitForSelector('button.lang-btn[value="ko"]', { timeout: 10000 });
    await page.click('button.lang-btn[value="ko"]');
    await page.waitForTimeout(1000);
    await page.click('#current-receiving-currency'); await page.waitForTimeout(500);
    await page.click('#select-receiving-currency a[data-currency="MNT"]');
    await page.waitForTimeout(1000);
    await page.click('#receiving-input', { clickCount: 3 });
    await page.fill('#receiving-input', String(AMOUNT));
    await page.press('#receiving-input', 'Enter');
    await page.waitForTimeout(3000);
    const raw = await page.inputValue('#sending-input');
    const sendAmt = extractNumber(raw);
    if (!sendAmt) throw new Error('총 송금액 추출 실패');
    const feeRaw = await page.locator('h5.text-left').textContent().catch(() => null);
    const fee = extractNumber(feeRaw) ?? 2500;
    return { operator: 'Coinshot', receiving_country: COUNTRY, receive_amount: AMOUNT,
      send_amount_krw: sendAmt, service_fee: fee, total_sending_amount: sendAmt + fee };
  } finally { await page.close(); }
}

// ─── Hanpass ──────────────────────────────────────────────────────────────────
async function scrapeHanpass(browser) {
  const page = await browser.newPage();
  try {
    await page.goto('https://www.hanpass.com/en', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);
    await page.locator('[class*="recipientAmountField"] button').click();
    await page.waitForSelector('#countrySearch', { timeout: 10000 });
    await page.fill('#countrySearch', 'Mongolia'); await page.waitForTimeout(500);
    await page.locator('button[aria-label="Mongolia MNT"]').first().click();
    await page.waitForTimeout(3000);
    const prevDeposit = await page.$eval('#deposit', el => el.value).catch(() => '');
    await page.click('#recipient', { clickCount: 3 });
    await page.waitForTimeout(300);
    await page.keyboard.type(String(AMOUNT));
    await page.dispatchEvent('#recipient', 'input');
    await page.dispatchEvent('#recipient', 'blur');
    await page.waitForFunction(
      (prev) => { const el = document.querySelector('#deposit'); return el && el.value !== prev && el.value !== '' && el.value !== '0'; },
      prevDeposit, { timeout: 15000 }
    ).catch(() => null);
    const raw = await page.$eval('#deposit', el => el.value).catch(() => null);
    const total = extractNumber(raw);
    if (!total) throw new Error('총 송금액 추출 실패');
    const feeRaw = await page.locator('[class*="ExchangeCalculator_row"]')
      .filter({ hasText: 'Remittance fee' }).locator('span:last-child')
      .textContent().catch(() => null);
    const fee = extractNumber(feeRaw) ?? 0;
    return { operator: 'Hanpass', receiving_country: COUNTRY, receive_amount: AMOUNT,
      send_amount_krw: total - fee, service_fee: fee, total_sending_amount: total };
  } finally { await page.close(); }
}

// ─── 스크래퍼 목록 ────────────────────────────────────────────────────────────
const SCRAPERS = [
  { name: 'GME',         fn: () => withRetry(() => scrapeGme()),   needsBrowser: false },
  { name: 'GMoneyTrans', fn: scrapeGmoneytrans,  needsBrowser: false },
  { name: 'Utransfer',   fn: scrapeUtransfer,    needsBrowser: true  },
  { name: 'Cross',       fn: scrapeCross,        needsBrowser: true  },
  { name: 'E9Pay',       fn: (b) => withRetry(() => scrapeE9pay(b)), needsBrowser: true  },
  { name: 'Coinshot',    fn: scrapeCoinshot,     needsBrowser: true  },
  { name: 'Hanpass',     fn: scrapeHanpass,      needsBrowser: true  },
];

// ─── 메인 ─────────────────────────────────────────────────────────────────────
async function main() {
  const runHour = getRunHour();
  console.log(`\n[${new Date().toISOString()}] Mongolia MNT 스크래핑 시작 — run_hour: ${runHour}\n`);

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
    }
  }

  await browser.close();

  if (results.length === 0) {
    console.error('\n모든 스크래퍼 실패. 종료합니다.');
    process.exit(1);
  }

  const gmeRecord   = results.find(r => r.operator === 'GME');
  const gmeBaseline = gmeRecord?.total_sending_amount ?? null;
  if (!gmeBaseline) console.warn('\n⚠️  GME 기준값 없음 — price_gap 계산 불가');

  const toSave = results.map(r => {
    const priceGap = gmeBaseline && r.operator !== 'GME'
      ? r.total_sending_amount - gmeBaseline : null;
    const status = priceGap === null ? null : priceGap > 0 ? 'GME 유리' : '경쟁사 유리';
    return {
      run_hour:             runHour,
      operator:             r.operator,
      receiving_country:    r.receiving_country,
      receive_amount:       r.receive_amount,
      send_amount_krw:      r.send_amount_krw,
      service_fee:          r.service_fee ?? 0,
      total_sending_amount: r.total_sending_amount,
      gme_baseline:         gmeBaseline,
      price_gap:            priceGap,
      status:               status,
    };
  });

  try {
    await saveRates(toSave);
    console.log(`\n✅ ${toSave.length}건 Supabase 저장 완료 (Mongolia MNT)`);
  } catch (err) {
    console.error(`\n❌ Supabase 저장 실패: ${err.message}`);
    process.exit(1);
  }

  if (errors.length > 0) {
    console.warn(`\n⚠️  실패한 스크래퍼 (${errors.length}개):`);
    errors.forEach(e => console.warn(`   - ${e.name}: ${e.error}`));
  }

  console.log('\n── Mongolia MNT 2,500,000 결과 요약 ───────────────────────────────');
  console.log(`${'운영사'.padEnd(14)} ${'송금액(KRW)'.padStart(12)} ${'수수료'.padStart(8)} ${'합계'.padStart(12)} 상태`);
  console.log('─'.repeat(60));
  toSave.sort((a, b) => a.total_sending_amount - b.total_sending_amount).forEach(r => {
    const gap = r.price_gap !== null ? `${r.price_gap > 0 ? '+' : ''}${r.price_gap.toLocaleString()}원` : '';
    console.log(
      `${r.operator.padEnd(14)} ${r.send_amount_krw.toLocaleString().padStart(12)} ${(r.service_fee || 0).toLocaleString().padStart(8)} ${r.total_sending_amount.toLocaleString().padStart(12)} ${gap}`
    );
  });
  console.log('\n완료.\n');
}

main().catch(err => {
  console.error('예기치 않은 오류:', err);
  process.exit(1);
});
