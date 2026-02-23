/**
 * Thailand (THB) 스크래퍼 — 26,000 THB 기준
 * 실행: node run-thb.js
 *
 * 모든 사업자에서 KRW→THB 26,000 수령 기준 송금액 수집
 * Supabase에 receiving_country='Thailand' 로 저장
 */
import { chromium } from 'playwright';
import { getRunHour, extractNumber, withRetry } from './lib/browser.js';
import { saveRates } from './lib/supabase.js';

const COUNTRY = 'Thailand';
const AMOUNT  = 26_000;

// ─── GME ─────────────────────────────────────────────────────────────────────
async function scrapeGme(browser) {
  const page = await browser.newPage();
  try {
    await page.goto('https://online.gmeremit.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('#nCountry', { timeout: 10000 });
    await page.click('#nCountry');
    await page.waitForTimeout(500);
    await page.waitForSelector('#CountryValue', { timeout: 5000 });
    await page.fill('#CountryValue', 'Thailand');
    await page.waitForTimeout(300);
    await page.click('#toCurrUl li[data-countrycode="THB"]');
    await page.waitForTimeout(1000);
    await page.waitForSelector('#recAmt', { timeout: 10000 });
    await page.click('#recAmt', { clickCount: 3 });
    await page.fill('#recAmt', String(AMOUNT));
    await page.dispatchEvent('#recAmt', 'change');
    await page.waitForTimeout(3000);
    const sendAmtRaw = await page.$eval('#numAmount', el => el.value || el.textContent).catch(() => null);
    const total = extractNumber(sendAmtRaw);
    if (!total) throw new Error('총 송금액 추출 실패');
    return { operator: 'GME', receiving_country: COUNTRY, receive_amount: AMOUNT,
      send_amount_krw: total, service_fee: 0, total_sending_amount: total };
  } finally { await page.close(); }
}

// ─── GMoneyTrans (API) ────────────────────────────────────────────────────────
async function scrapeGmoneytrans() {
  const url = 'https://mapi.gmoneytrans.net/exratenew1/ajx_calcRate.asp'
    + `?receive_amount=${AMOUNT}`
    + '&payout_country=Thailand'
    + '&total_collected=0'
    + '&payment_type=Bank+Account'
    + '&currencyType=THB';
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

// ─── WireBarley ───────────────────────────────────────────────────────────────
async function scrapeWirebarley(browser) {
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    locale: 'ko-KR',
  });
  const page = await context.newPage();
  try {
    await page.goto('https://www.wirebarley.com/ko', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);
    await page.locator('#lafc-popup button').click().catch(() => null);
    await page.waitForTimeout(1000);
    await page.locator('[data-title="currencyToMoneyBox"]').nth(1)
      .locator('img[alt="드롭 다운"]').click();
    await page.waitForTimeout(2000);
    await page.locator('button:has(img[alt="TH"])').click();
    await page.waitForTimeout(2000);
    await page.locator('[data-title="currencyToMoneyBox"]').nth(1).locator('button').click();
    await page.waitForTimeout(500);
    await page.locator('input').nth(1).click({ clickCount: 3 });
    await page.locator('input').nth(1).fill(String(AMOUNT));
    await page.locator('input').nth(1).press('Enter');
    await page.waitForTimeout(3000);
    const totalRaw = await page.evaluate(() => {
      const ps = Array.from(document.querySelectorAll('p'));
      const label = ps.find(p => p.textContent.trim() === '총 입금액');
      return label?.nextElementSibling?.textContent?.trim() ?? null;
    });
    const total = extractNumber(totalRaw);
    if (!total) throw new Error('총 송금액 추출 실패');
    const feeRaw = await page.evaluate(() => {
      const ps = Array.from(document.querySelectorAll('p'));
      const label = ps.find(p => p.textContent.trim() === '수수료');
      return label?.nextElementSibling?.textContent?.trim() ?? null;
    });
    const fee = extractNumber(feeRaw) ?? 0;
    return { operator: 'WireBarley', receiving_country: COUNTRY, receive_amount: AMOUNT,
      send_amount_krw: total - fee, service_fee: fee, total_sending_amount: total };
  } finally { await page.close(); await context.close(); }
}

// ─── Sentbe ───────────────────────────────────────────────────────────────────
async function scrapeSentbe(browser) {
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    locale: 'ko-KR',
  });
  const page = await context.newPage();
  try {
    await page.goto('https://www.sentbe.com/ko', { waitUntil: 'networkidle', timeout: 30000 });
    await page.click('button.close').catch(() => null);
    await page.waitForTimeout(300);
    await page.click('article.app-download-popup .dim').catch(() => null);
    await page.waitForTimeout(500);
    await page.waitForSelector('.receiveAmountInput .el-input-group__append', { timeout: 10000 });
    await page.click('.receiveAmountInput .el-input-group__append');
    await page.waitForTimeout(500);
    // 태국 / Thailand 선택
    await page.click('.receiveAmountInput .el-select-dropdown__item:has-text("태국")');
    await page.waitForTimeout(1000);
    await page.click('#receiveAmount', { clickCount: 3 });
    await page.fill('#receiveAmount', String(AMOUNT));
    await page.press('#receiveAmount', 'Tab');
    await page.waitForTimeout(3000);
    const totalRaw = await page.$eval('#sendAmount', el => el.value).catch(() => null);
    const total = extractNumber(totalRaw);
    if (!total) throw new Error('총 송금액 추출 실패');
    const fee = 5000;
    return { operator: 'Sentbe', receiving_country: COUNTRY, receive_amount: AMOUNT,
      send_amount_krw: total, service_fee: fee, total_sending_amount: total + fee };
  } finally { await page.close(); await context.close(); }
}

// ─── Hanpass ──────────────────────────────────────────────────────────────────
async function scrapeHanpass(browser) {
  const page = await browser.newPage();
  try {
    await page.goto('https://www.hanpass.com/en', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);
    await page.locator('[class*="recipientAmountField"] button').click();
    await page.waitForSelector('#countrySearch', { timeout: 10000 });
    await page.fill('#countrySearch', 'Thailand');
    await page.waitForTimeout(500);
    await page.locator('button[aria-label="Thailand THB"]').first().click();
    await page.waitForTimeout(1500);
    const prevDeposit = await page.$eval('#deposit', el => el.value).catch(() => '');
    await page.click('#recipient', { clickCount: 3 });
    await page.keyboard.type(String(AMOUNT));
    await page.dispatchEvent('#recipient', 'blur');
    await page.waitForFunction(
      (prev) => { const el = document.querySelector('#deposit'); return el && el.value !== prev && el.value !== '' && el.value !== '0'; },
      prevDeposit, { timeout: 10000 }
    ).catch(() => null);
    const totalRaw = await page.$eval('#deposit', el => el.value).catch(() => null);
    const total = extractNumber(totalRaw);
    if (!total) throw new Error('총 송금액 추출 실패');
    const feeRaw = await page.locator('[class*="ExchangeCalculator_row"]')
      .filter({ hasText: 'Remittance fee' }).locator('span:last-child')
      .textContent().catch(() => null);
    const fee = extractNumber(feeRaw) ?? 0;
    return { operator: 'Hanpass', receiving_country: COUNTRY, receive_amount: AMOUNT,
      send_amount_krw: total - fee, service_fee: fee, total_sending_amount: total };
  } finally { await page.close(); }
}

// ─── Utransfer ────────────────────────────────────────────────────────────────
async function scrapeUtransfer(browser) {
  const page = await browser.newPage();
  try {
    await page.goto('https://www.utransfer.com', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);
    await page.locator('select').nth(1).selectOption('THB');
    await page.waitForTimeout(1000);
    await page.click('input[name="toAmount"]', { clickCount: 3 });
    await page.fill('input[name="toAmount"]', String(AMOUNT));
    await page.dispatchEvent('input[name="toAmount"]', 'change');
    await page.waitForTimeout(3000);
    const sendAmtRaw = await page.inputValue('input[name="fromAmount"]').catch(() => null);
    const sendAmt = extractNumber(sendAmtRaw);
    if (!sendAmt) throw new Error('총 송금액 추출 실패');
    const feeRaw = await page.locator('.utransfer_fees').textContent().catch(() => null);
    const fee = extractNumber(feeRaw) ?? 5000;
    return { operator: 'Utransfer', receiving_country: COUNTRY, receive_amount: AMOUNT,
      send_amount_krw: sendAmt, service_fee: fee, total_sending_amount: sendAmt + fee };
  } finally { await page.close(); }
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
    await page.click('button:has-text("Close")').catch(() => null);
    await page.waitForTimeout(500);
    await page.click('.dest-country');
    await page.waitForTimeout(500);
    await page.click('a[data-currency="THB"]');
    await page.waitForTimeout(1500);
    await page.click('#targetAmount', { clickCount: 3 });
    await page.fill('#targetAmount', String(AMOUNT));
    await page.dispatchEvent('#targetAmount', 'input');
    await page.waitForTimeout(2000);
    const sendAmtRaw = await page.inputValue('#krwAmount');
    const sendAmt = extractNumber(sendAmtRaw);
    if (!sendAmt) throw new Error('총 송금액 추출 실패');
    const fee = 5000; // Thailand Bank Transfer: 5,000원
    return { operator: 'SBI', receiving_country: COUNTRY, receive_amount: AMOUNT,
      send_amount_krw: sendAmt, service_fee: fee, total_sending_amount: sendAmt + fee };
  } finally { await page.close(); await context.close(); }
}

// ─── Cross (기본값이 THB — 국가 변경 불필요) ──────────────────────────────────
async function scrapeCross(browser) {
  const page = await browser.newPage();
  try {
    await page.goto('https://crossenf.com/remittance', { waitUntil: 'load', timeout: 30000 });
    await page.waitForTimeout(2000);
    // THB is already the default receiving currency — no country change needed
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

// ─── Coinshot ─────────────────────────────────────────────────────────────────
async function scrapeCoinshot(browser) {
  const page = await browser.newPage();
  try {
    await page.goto('https://coinshot.org/main', { waitUntil: 'load', timeout: 30000 });
    await page.waitForTimeout(2000);
    await page.waitForSelector('button.lang-btn[value="ko"]', { timeout: 10000 });
    await page.click('button.lang-btn[value="ko"]');
    await page.waitForTimeout(1000);
    await page.click('#current-receiving-currency');
    await page.waitForTimeout(500);
    await page.click('#select-receiving-currency a[data-currency="THB"]');
    await page.waitForTimeout(1000);
    await page.click('#receiving-input', { clickCount: 3 });
    await page.fill('#receiving-input', String(AMOUNT));
    await page.press('#receiving-input', 'Enter');
    await page.waitForTimeout(3000);
    const sendAmtRaw = await page.inputValue('#sending-input');
    const sendAmt = extractNumber(sendAmtRaw);
    if (!sendAmt) throw new Error('총 송금액 추출 실패');
    const fee = 5000; // Thailand: 5,000원 고정
    return { operator: 'Coinshot', receiving_country: COUNTRY, receive_amount: AMOUNT,
      send_amount_krw: sendAmt, service_fee: fee, total_sending_amount: sendAmt + fee };
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
    await page.waitForSelector('li#THB', { state: 'visible', timeout: 10000 });
    await page.click('li#THB');
    await page.waitForTimeout(1500);
    await page.click('#rec_money', { clickCount: 3 });
    await page.fill('#rec_money', String(AMOUNT));
    await page.dispatchEvent('#rec_money', 'keyup');
    await page.waitForTimeout(3000);
    const sendAmtRaw = await page.inputValue('#send_money');
    const sendAmt = extractNumber(sendAmtRaw);
    if (!sendAmt) throw new Error('총 송금액 추출 실패');
    const feeRaw = await page.textContent('#servicefee').catch(() => null);
    const fee = extractNumber(feeRaw) ?? 5000;
    return { operator: 'JRF', receiving_country: COUNTRY, receive_amount: AMOUNT,
      send_amount_krw: sendAmt, service_fee: fee, total_sending_amount: sendAmt + fee };
  } finally { await page.close(); await context.close(); }
}

// ─── E9Pay ────────────────────────────────────────────────────────────────────
async function scrapeE9pay(browser) {
  const page = await browser.newPage();
  try {
    await page.goto('https://www.e9pay.co.kr/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);
    await page.waitForSelector('#TH_THB', { state: 'attached', timeout: 10000 });
    await page.evaluate(() => {
      const radio = document.querySelector('#TH_THB');
      radio.checked = true;
      radio.dispatchEvent(new Event('change', { bubbles: true }));
      radio.dispatchEvent(new Event('click', { bubbles: true }));
    });
    await page.waitForTimeout(1000);
    await page.waitForSelector('#reverse', { timeout: 5000 });
    await page.click('#reverse');
    await page.waitForTimeout(500);
    await page.waitForSelector('#receive-money', { timeout: 5000 });
    await page.click('#receive-money', { clickCount: 3 });
    await page.fill('#receive-money', String(AMOUNT));
    await page.dispatchEvent('#receive-money', 'blur');
    await page.waitForTimeout(3000);
    const sendAmtRaw = await page.$eval('#send-money', el => el.value).catch(() => null);
    const total = extractNumber(sendAmtRaw);
    if (!total) throw new Error('총 송금액 추출 실패');
    const feeRaw = await page.$eval('#remit-fee', el => el.textContent || el.value).catch(() => null);
    const fee = extractNumber(feeRaw) ?? 0;
    return { operator: 'E9Pay', receiving_country: COUNTRY, receive_amount: AMOUNT,
      send_amount_krw: total, service_fee: fee, total_sending_amount: total + fee };
  } finally { await page.close(); }
}

// ─── 스크래퍼 목록 ────────────────────────────────────────────────────────────
const SCRAPERS = [
  { name: 'GME',         fn: (b) => withRetry(() => scrapeGme(b)), needsBrowser: true  },
  { name: 'GMoneyTrans', fn: scrapeGmoneytrans,  needsBrowser: false },
  { name: 'WireBarley',  fn: scrapeWirebarley,   needsBrowser: true  },
  { name: 'Sentbe',      fn: scrapeSentbe,       needsBrowser: true  },
  { name: 'Hanpass',     fn: scrapeHanpass,      needsBrowser: true  },
  { name: 'SBI',         fn: (b) => withRetry(() => scrapeSbi(b)), needsBrowser: true  },
  { name: 'Cross',       fn: scrapeCross,        needsBrowser: true  },
  { name: 'Coinshot',    fn: scrapeCoinshot,     needsBrowser: true  },
  { name: 'JRF',         fn: (b) => withRetry(() => scrapeJrf(b)), needsBrowser: true  },
  { name: 'E9Pay',       fn: (b) => withRetry(() => scrapeE9pay(b)), needsBrowser: true  },
];

// ─── 메인 ─────────────────────────────────────────────────────────────────────
async function main() {
  const runHour = getRunHour();
  console.log(`\n[${new Date().toISOString()}] Thailand THB 스크래핑 시작 — run_hour: ${runHour}\n`);

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

  // GME 기준값 계산
  const gmeRecord = results.find(r => r.operator === 'GME');
  const gmeBaseline = gmeRecord?.total_sending_amount ?? null;
  if (!gmeBaseline) console.warn('\n⚠️  GME 기준값 없음 — price_gap 계산 불가');

  // Supabase 저장용 레코드 구성
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
    console.log(`\n✅ ${toSave.length}건 Supabase 저장 완료 (Thailand THB)`);
  } catch (err) {
    console.error(`\n❌ Supabase 저장 실패: ${err.message}`);
    process.exit(1);
  }

  if (errors.length > 0) {
    console.warn(`\n⚠️  실패한 스크래퍼 (${errors.length}개):`);
    errors.forEach(e => console.warn(`   - ${e.name}: ${e.error}`));
  }

  // 결과 요약 출력
  console.log('\n── Thailand THB 26,000 결과 요약 ──────────────────────────────────');
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
