/**
 * Philippines (PHP) 스크래퍼 — 40,000 PHP 기준
 * 실행: node --env-file=.env run-php.js
 *
 * 지원 사업자: GME, GMoneyTrans, SBI, Coinshot, Cross, E9Pay, JRF, Utransfer, Hanpass
 */
import { chromium } from 'playwright';
import { getRunHour, extractNumber, withRetry } from './lib/browser.js';
import { saveRates } from './lib/supabase.js';

const COUNTRY = 'Philippines';
const AMOUNT  = 40_000;

// ─── GME ─────────────────────────────────────────────────────────────────────
async function scrapeGme(browser) {
  const page = await browser.newPage();
  try {
    await page.goto('https://online.gmeremit.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('#nCountry', { timeout: 10000 });
    await page.click('#nCountry'); await page.waitForTimeout(500);
    await page.fill('#CountryValue', 'Philippines'); await page.waitForTimeout(300);
    await page.click('#toCurrUl li[data-countrycode="PHP"]');
    await page.waitForTimeout(1000);
    await page.click('#recAmt', { clickCount: 3 });
    await page.fill('#recAmt', String(AMOUNT));
    await page.dispatchEvent('#recAmt', 'change');
    await page.waitForTimeout(3000);
    const raw = await page.$eval('#numAmount', el => el.value || el.textContent).catch(() => null);
    const total = extractNumber(raw);
    if (!total) throw new Error('총 송금액 추출 실패');
    return { operator: 'GME', receiving_country: COUNTRY, receive_amount: AMOUNT,
      send_amount_krw: total, service_fee: 0, total_sending_amount: total };
  } finally { await page.close(); }
}

// ─── GMoneyTrans (API) ────────────────────────────────────────────────────────
async function scrapeGmoneytrans() {
  const url = 'https://mapi.gmoneytrans.net/exratenew1/ajx_calcRate.asp'
    + `?receive_amount=${AMOUNT}`
    + '&payout_country=Philippines'
    + '&total_collected=0'
    + '&payment_type=Bank+Account'
    + '&currencyType=PHP';
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  const serviceCharge = parseField(text, 'serviceCharge') ?? 3000;
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

// ─── SBI ──────────────────────────────────────────────────────────────────────
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
    await page.click('a[data-currency="PHP"]'); await page.waitForTimeout(1500);
    await page.click('#targetAmount', { clickCount: 3 });
    await page.fill('#targetAmount', String(AMOUNT));
    await page.dispatchEvent('#targetAmount', 'input'); await page.waitForTimeout(2000);
    const raw = await page.inputValue('#krwAmount');
    const sendAmt = extractNumber(raw);
    if (!sendAmt) throw new Error('총 송금액 추출 실패');
    const fee = 5000;
    return { operator: 'SBI', receiving_country: COUNTRY, receive_amount: AMOUNT,
      send_amount_krw: sendAmt, service_fee: fee, total_sending_amount: sendAmt + fee };
  } finally { await page.close(); await context.close(); }
}

// ─── Coinshot ─────────────────────────────────────────────────────────────────
async function scrapeCoinshot(browser) {
  const page = await browser.newPage();
  try {
    await page.goto('https://coinshot.org/main', { waitUntil: 'load', timeout: 30000 });
    await page.waitForTimeout(2000);
    await page.waitForSelector('button.lang-btn[value="ko"]', { timeout: 10000 });
    await page.click('button.lang-btn[value="ko"]'); await page.waitForTimeout(1000);
    await page.click('#current-receiving-currency'); await page.waitForTimeout(500);
    await page.click('#select-receiving-currency a[data-currency="PHP"]');
    await page.waitForTimeout(1000);
    await page.click('#receiving-input', { clickCount: 3 });
    await page.fill('#receiving-input', String(AMOUNT));
    await page.press('#receiving-input', 'Enter'); await page.waitForTimeout(3000);
    const raw = await page.inputValue('#sending-input');
    const sendAmt = extractNumber(raw);
    if (!sendAmt) throw new Error('총 송금액 추출 실패');
    const feeRaw = await page.locator('h5.text-left').textContent().catch(() => null);
    const fee = extractNumber(feeRaw) ?? 2500;
    return { operator: 'Coinshot', receiving_country: COUNTRY, receive_amount: AMOUNT,
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
    await page.locator('#aside-root li:has(img[alt="PH flag"])').click();
    await page.waitForTimeout(1000);
    const receiveInput = page.locator('input[inputmode="numeric"]').nth(1);
    await receiveInput.click({ clickCount: 3 });
    await receiveInput.fill(String(AMOUNT));
    await receiveInput.press('Tab'); await page.waitForTimeout(3000);
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
    await page.waitForSelector('#PH_PHP', { state: 'attached', timeout: 10000 });
    await page.evaluate(() => {
      const radio = document.querySelector('#PH_PHP');
      radio.checked = true;
      radio.dispatchEvent(new Event('change', { bubbles: true }));
      radio.dispatchEvent(new Event('click',  { bubbles: true }));
    });
    await page.waitForTimeout(1000);
    await page.click('#reverse'); await page.waitForTimeout(500);
    await page.waitForSelector('#receive-money', { timeout: 5000 });
    await page.click('#receive-money', { clickCount: 3 });
    await page.fill('#receive-money', String(AMOUNT));
    await page.dispatchEvent('#receive-money', 'blur'); await page.waitForTimeout(3000);
    const raw = await page.$eval('#send-money', el => el.value).catch(() => null);
    const total = extractNumber(raw);
    if (!total) throw new Error('총 송금액 추출 실패');
    const feeRaw = await page.$eval('#remit-fee', el => el.textContent || el.value).catch(() => null);
    const fee = extractNumber(feeRaw) ?? 0;
    return { operator: 'E9Pay', receiving_country: COUNTRY, receive_amount: AMOUNT,
      send_amount_krw: total, service_fee: fee, total_sending_amount: total + fee };
  } finally { await page.close(); }
}

// ─── JRF ─────────────────────────────────────────────────────────────────────
async function scrapeJrf(browser) {
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();
  try {
    await page.goto('https://www.jpremit.co.kr/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);
    await page.click('#div_curr', { force: true });
    await page.waitForSelector('li#PHP', { state: 'visible', timeout: 10000 });
    await page.click('li#PHP'); await page.waitForTimeout(1500);
    await page.click('#rec_money', { clickCount: 3 });
    await page.fill('#rec_money', String(AMOUNT));
    await page.dispatchEvent('#rec_money', 'keyup'); await page.waitForTimeout(3000);
    const raw = await page.inputValue('#send_money');
    const sendAmt = extractNumber(raw);
    if (!sendAmt) throw new Error('총 송금액 추출 실패');
    const fee = 4000;
    return { operator: 'JRF', receiving_country: COUNTRY, receive_amount: AMOUNT,
      send_amount_krw: sendAmt, service_fee: fee, total_sending_amount: sendAmt + fee };
  } finally { await page.close(); await context.close(); }
}

// ─── Utransfer ────────────────────────────────────────────────────────────────
async function scrapeUtransfer(browser) {
  const page = await browser.newPage();
  try {
    await page.goto('https://www.utransfer.com', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForFunction(() => document.querySelectorAll('select').length >= 2, null, { timeout: 15000 });
    await page.locator('select').nth(1).selectOption('PHP');
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

// ─── Hanpass (API) ────────────────────────────────────────────────────────────
async function scrapeHanpass() {
  const res = await fetch('https://app.hanpass.com/app/v1/remittance/get-cost', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ inputAmount: String(AMOUNT), inputCurrencyCode: 'PHP',
      fromCurrencyCode: 'KRW', toCurrencyCode: 'PHP', toCountryCode: 'PH',
      memberSeq: '1', lang: 'en' }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (data.resultCode !== '0') throw new Error(`Hanpass API 오류: ${data.resultMessage}`);
  const total = data.depositAmountIncludingFee;
  const fee   = data.transferFee ?? 0;
  if (!total) throw new Error('총 송금액 추출 실패');
  return { operator: 'Hanpass', receiving_country: COUNTRY, receive_amount: AMOUNT,
    send_amount_krw: total - fee, service_fee: fee, total_sending_amount: total };
}

// ─── 스크래퍼 목록 ────────────────────────────────────────────────────────────
const SCRAPERS = [
  { name: 'GME',         fn: (b) => withRetry(() => scrapeGme(b)), needsBrowser: true  },
  { name: 'GMoneyTrans', fn: scrapeGmoneytrans,  needsBrowser: false },
  { name: 'SBI',         fn: (b) => withRetry(() => scrapeSbi(b)), needsBrowser: true  },
  { name: 'Coinshot',    fn: (b) => withRetry(() => scrapeCoinshot(b)), needsBrowser: true  },
  { name: 'Cross',       fn: (b) => withRetry(() => scrapeCross(b)), needsBrowser: true  },
  { name: 'E9Pay',       fn: (b) => withRetry(() => scrapeE9pay(b)), needsBrowser: true  },
  { name: 'JRF',         fn: (b) => withRetry(() => scrapeJrf(b)), needsBrowser: true  },
  { name: 'Utransfer',   fn: (b) => withRetry(() => scrapeUtransfer(b)), needsBrowser: true  },
  { name: 'Hanpass',     fn: scrapeHanpass,      needsBrowser: false },
];

// ─── 메인 ─────────────────────────────────────────────────────────────────────
async function main() {
  const runHour = getRunHour();
  console.log(`\n[${new Date().toISOString()}] Philippines PHP 스크래핑 시작 — run_hour: ${runHour}\n`);

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
    console.log(`\n✅ ${toSave.length}건 Supabase 저장 완료 (Philippines PHP)`);
  } catch (err) {
    console.error(`\n❌ Supabase 저장 실패: ${err.message}`);
    process.exit(1);
  }

  if (errors.length > 0) {
    console.warn(`\n⚠️  실패한 스크래퍼 (${errors.length}개):`);
    errors.forEach(e => console.warn(`   - ${e.name}: ${e.error}`));
  }

  console.log('\n── Philippines PHP 40,000 결과 요약 ───────────────────────────────');
  console.log(`${'운영사'.padEnd(14)} ${'송금액(KRW)'.padStart(12)} ${'수수료'.padStart(8)} ${'합계'.padStart(12)} 차이`);
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
