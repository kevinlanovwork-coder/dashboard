/**
 * China (CNY) 스크래퍼 — 10,000 CNY 기준
 * 실행: node --env-file=.env run-cny.js
 *
 * 지원 사업자: GME, GMoneyTrans, Hanpass, SBI, Cross, WireBarley, Coinshot, E9Pay, Utransfer, Moin, Debunk
 * 수령 방식: 전체 Alipay
 *
 * 수수료 (하드코딩):
 *   E9Pay=7,000  GMoneyTrans=4,000  SBI=5,000  Hanpass=0  Coinshot=10,000
 */
import { chromium } from 'playwright';
import { getRunHour, extractNumber, withRetry } from './lib/browser.js';
import { saveRates, saveRealtimeCheck, isDryRun, logFailure } from './lib/supabase.js';
import { checkAlerts } from './lib/alerts.js';
import { loadFees, applyFeeOverrides, seedFees } from './lib/fees.js';

const COUNTRY = 'China';
const AMOUNT  = 10_000;

// ─── GME (API — Alipay) ─────────────────────────────────────────────────────
async function scrapeGmeApi(deliveryMethodCode, deliveryMethodName) {
  const body = new URLSearchParams({
    method: 'GetExRate', pCurr: 'CNY', pCountryName: 'China',
    collCurr: 'KRW', deliveryMethod: deliveryMethodCode, cAmt: '', pAmt: String(AMOUNT),
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
  const total = parseFloat(data.collAmt?.toString().replace(/,/g, '') ?? '');
  const fee   = parseFloat(data.scCharge?.toString().replace(/,/g, '') ?? '0');
  if (!total) throw new Error('총 송금액 추출 실패');
  return { operator: 'GME', receiving_country: COUNTRY, receive_amount: AMOUNT,
    send_amount_krw: total - fee, service_fee: fee, total_sending_amount: total,
    delivery_method: deliveryMethodName };
}

// ─── GMoneyTrans (API — Alipay) ─────────────────────────────────────────────
async function scrapeGmoneytransApi(paymentType, deliveryMethodName) {
  const url = 'https://mapi.gmoneytrans.net/exratenew1/ajx_calcRate.asp'
    + `?receive_amount=${AMOUNT}`
    + '&payout_country=China'
    + '&total_collected=0'
    + `&payment_type=${encodeURIComponent(paymentType)}`
    + '&currencyType=CNY';
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  const sendAmount = parseField(text, 'sendAmount');
  if (!sendAmount) throw new Error(`파싱 실패: ${text.slice(0, 200)}`);
  const fee = 4000; // hardcoded
  return { operator: 'GMoneyTrans', receiving_country: COUNTRY, receive_amount: AMOUNT,
    send_amount_krw: sendAmount, service_fee: fee,
    total_sending_amount: sendAmount + fee,
    delivery_method: deliveryMethodName };
}
function parseField(text, field) {
  const m = text.match(new RegExp(`${field}--td_clm--([\\d.]+)--td_end--`));
  return m ? parseFloat(m[1]) : null;
}

// ─── Hanpass (API — Alipay) ──────────────────────────────────────────────────
// Alipay requires: mtoServiceCenterCode='ALMW-0001', fee 0.
async function scrapeHanpass(extraParams, deliveryMethodLabel) {
  const body = {
    inputAmount: String(AMOUNT), inputCurrencyCode: 'CNY',
    fromCurrencyCode: 'KRW', toCurrencyCode: 'CNY', toCountryCode: 'CN',
    memberSeq: '1', lang: 'en', ...extraParams,
  };
  const res = await fetch('https://app.hanpass.com/app/v1/remittance/get-cost', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
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
    delivery_method: deliveryMethodLabel };
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
    await page.click('a[data-currency="CNY"]'); await page.waitForTimeout(1500);
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
    const fee = 5000; // hardcoded
    return { operator: 'SBI', receiving_country: COUNTRY, receive_amount: AMOUNT,
      send_amount_krw: sendAmt, service_fee: fee, total_sending_amount: sendAmt + fee,
      delivery_method: 'Alipay' };
  } finally { await page.close(); await context.close(); }
}

// ─── Cross ────────────────────────────────────────────────────────────────────
async function scrapeCross(browser) {
  const page = await browser.newPage();
  try {
    await page.goto('https://crossenf.com/remittance', { waitUntil: 'load', timeout: 30000 });
    await page.waitForTimeout(2000);
    await page.locator('div.cursor-pointer.group').click();
    await page.waitForSelector('#aside-root ul', { timeout: 10000 });
    const searchInput = page.locator('#aside-root input');
    await searchInput.fill('CNY');
    await page.waitForTimeout(1000);
    await page.locator('#aside-root li:has(img[alt="CN flag"])').click();
    await page.waitForTimeout(1000);
    const receiveInput = page.locator('input[inputmode="numeric"]').nth(1);
    await receiveInput.click({ clickCount: 3 });
    await receiveInput.fill(String(AMOUNT));
    await receiveInput.press('Tab');
    let total = null;
    for (let attempt = 0; attempt < 10; attempt++) {
      await page.waitForTimeout(1000);
      const raw = await page.locator('input[inputmode="numeric"]').nth(0).inputValue();
      total = extractNumber(raw);
      if (total && total !== 1_000_000) break;
    }
    if (!total || total === 1_000_000) throw new Error('총 송금액 계산 대기 초과 (기본값 반환됨)');
    const fee = 0;
    return { operator: 'Cross', receiving_country: COUNTRY, receive_amount: AMOUNT,
      send_amount_krw: total, service_fee: fee, total_sending_amount: total + fee,
      delivery_method: 'Alipay' };
  } finally { await page.close(); }
}

// ─── WireBarley ───────────────────────────────────────────────────────────────
async function scrapeWirebarley(browser) {
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    locale: 'ko-KR',
  });
  const page = await context.newPage();
  try {
    await page.goto('https://www.wirebarley.com/ko', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);
    await page.locator('#lafc-popup button').click().catch(() => null); await page.waitForTimeout(1000);
    await page.locator('[data-title="currencyToMoneyBox"]').nth(1)
      .locator('img[alt="드롭 다운"]').click();
    await page.waitForTimeout(2000);
    await page.locator('button:has(img[alt="CN"])').click();
    await page.waitForTimeout(2000);
    await page.locator('[data-title="currencyToMoneyBox"]').nth(1).locator('button').click();
    await page.waitForTimeout(500);
    await page.locator('input').nth(1).click({ clickCount: 3 });
    await page.locator('input').nth(1).fill(String(AMOUNT));
    await page.locator('input').nth(1).press('Enter');
    let total = null;
    for (let attempt = 0; attempt < 10; attempt++) {
      await page.waitForTimeout(1000);
      const raw = await page.evaluate(() => {
        const ps = Array.from(document.querySelectorAll('p'));
        const label = ps.find(p => p.textContent.trim() === '총 입금액');
        return label?.nextElementSibling?.textContent?.trim() ?? null;
      });
      total = extractNumber(raw);
      if (total && total !== 1_000_000) break;
    }
    if (!total || total === 1_000_000) throw new Error('총 송금액 계산 대기 초과 (기본값 반환됨)');
    const feeRaw = await page.evaluate(() => {
      const ps = Array.from(document.querySelectorAll('p'));
      const label = ps.find(p => p.textContent.trim() === '수수료');
      return label?.nextElementSibling?.textContent?.trim() ?? null;
    });
    const fee = extractNumber(feeRaw) ?? 0;
    return { operator: 'WireBarley', receiving_country: COUNTRY, receive_amount: AMOUNT,
      send_amount_krw: total - fee, service_fee: fee, total_sending_amount: total,
      delivery_method: 'Alipay' };
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
    await page.click('#select-receiving-currency a[data-currency="CNY"]');
    await page.waitForTimeout(1000);
    await page.click('#receiving-input', { clickCount: 3 });
    await page.fill('#receiving-input', String(AMOUNT));
    await page.press('#receiving-input', 'Enter');
    let sendAmt = null;
    for (let attempt = 0; attempt < 10; attempt++) {
      await page.waitForTimeout(1000);
      const raw = await page.inputValue('#sending-input');
      sendAmt = extractNumber(raw);
      if (sendAmt && sendAmt !== 1_000_000) break;
    }
    if (!sendAmt || sendAmt === 1_000_000) throw new Error('총 송금액 계산 대기 초과 (기본값 반환됨)');
    // Coinshot: fee NOT included in sendAmt ("포함되지 않은 금액입니다")
    const fee = 10000;
    return { operator: 'Coinshot', receiving_country: COUNTRY, receive_amount: AMOUNT,
      send_amount_krw: sendAmt, service_fee: fee, total_sending_amount: sendAmt + fee,
      delivery_method: 'Alipay' };
  } finally { await page.close(); }
}

// ─── E9Pay (method: WECHAT PAY / ALIPAY) ─────────────────────────────────────
// remit-methods: WECHAT PAY (fee 10,000), ALIPAY (fee 7,000)
// Default method after selecting CN_CNY is WECHAT PAY.
async function scrapeE9pay(browser, methodName = 'WECHAT PAY', fee = 10000, deliveryMethodLabel = 'Wechat Pay') {
  const page = await browser.newPage();
  try {
    await page.goto('https://www.e9pay.co.kr/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);
    await page.waitForSelector('#CN_CNY', { state: 'attached', timeout: 10000 });
    await page.evaluate(() => {
      const radio = document.querySelector('#CN_CNY');
      radio.checked = true;
      radio.dispatchEvent(new Event('change', { bubbles: true }));
      radio.dispatchEvent(new Event('click',  { bubbles: true }));
    });
    await page.waitForTimeout(1000);
    // Select delivery method
    await page.click('#select-method'); await page.waitForTimeout(500);
    await page.evaluate((target) => {
      const items = document.querySelectorAll('#remit-methods li a');
      for (const a of items) {
        if (a.textContent.trim() === target) { a.click(); break; }
      }
    }, methodName);
    await page.waitForTimeout(1000);
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
    return { operator: 'E9Pay', receiving_country: COUNTRY, receive_amount: AMOUNT,
      send_amount_krw: total, service_fee: fee, total_sending_amount: total + fee,
      delivery_method: deliveryMethodLabel };
  } finally { await page.close(); }
}

// ─── Utransfer ────────────────────────────────────────────────────────────────
async function scrapeUtransfer(browser) {
  const page = await browser.newPage();
  try {
    await page.goto('https://www.utransfer.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);
    const personalBtn = page.locator('button:has-text("바로가기")').first();
    if (await personalBtn.isVisible().catch(() => false)) {
      await personalBtn.click();
      await page.waitForTimeout(2000);
    }
    await page.locator('select').nth(1).selectOption('CNY');
    await page.waitForTimeout(1000);
    await page.click('input[name="toAmount"]', { clickCount: 3 });
    await page.fill('input[name="toAmount"]', String(AMOUNT));
    await page.dispatchEvent('input[name="toAmount"]', 'change');
    let sendAmt = null;
    for (let attempt = 0; attempt < 10; attempt++) {
      await page.waitForTimeout(1000);
      const raw = await page.inputValue('input[name="fromAmount"]').catch(() => null);
      sendAmt = extractNumber(raw);
      if (sendAmt && sendAmt !== 1_000_000) break;
    }
    if (!sendAmt || sendAmt === 1_000_000) throw new Error('총 송금액 계산 대기 초과 (기본값 반환됨)');
    const feeRaw = await page.locator('.utransfer_fees').textContent().catch(() => null);
    const fee = extractNumber(feeRaw) ?? 5000;
    return { operator: 'Utransfer', receiving_country: COUNTRY, receive_amount: AMOUNT,
      send_amount_krw: sendAmt, service_fee: fee, total_sending_amount: sendAmt + fee,
      delivery_method: 'Alipay' };
  } finally { await page.close(); }
}

// ─── Moin ─────────────────────────────────────────────────────────────────────
async function scrapeMoin(browser) {
  const page = await browser.newPage();
  try {
    await page.goto('https://www.themoin.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);
    // Hide promo popup so it doesn't intercept clicks (clicking the transparent close div
    // stopped working after the 2026 redesign — the popup sits in #portalRoot .mds-modal).
    await page.addStyleTag({ content: `#portalRoot .mds-modal { display: none !important; }` });
    await page.waitForTimeout(300);
    // Open receive-currency picker. The clickable target is the inner child div;
    // clicking the outer div[color="var(--primary-100)"] wrapper no-ops.
    await page.locator('div[color="var(--primary-100)"] > div').first().click({ timeout: 5000 });
    await page.waitForTimeout(2000);
    // Select China CNY (picker list is still in Korean)
    await page.locator('text=중국').first().click();
    await page.waitForTimeout(2000);
    // Fill receive amount
    await page.click('#sendAmountForeignCurrency', { clickCount: 3 });
    await page.fill('#sendAmountForeignCurrency', String(AMOUNT));
    await page.press('#sendAmountForeignCurrency', 'Tab');
    // Read KRW send amount — poll until calculated
    let total = null;
    for (let attempt = 0; attempt < 10; attempt++) {
      await page.waitForTimeout(1000);
      const raw = await page.$eval('#sendAmountLocalCurrency', el => el.value).catch(() => null);
      total = extractNumber(raw);
      if (total && total !== 1_000_000) break;
    }
    if (!total || total === 1_000_000) throw new Error('총 송금액 계산 대기 초과 (기본값 반환됨)');
    return { operator: 'Moin', receiving_country: COUNTRY, receive_amount: AMOUNT,
      send_amount_krw: total, service_fee: 0, total_sending_amount: total,
      delivery_method: 'Alipay' };
  } finally { await page.close(); }
}

// ─── Debunk ───────────────────────────────────────────────────────────────────
async function scrapeDebunk(browser) {
  const page = await browser.newPage();
  try {
    await page.goto('https://www.debunk.co.kr/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);
    // Default currency is already CNY — enter receive amount
    const prevSend = await page.$eval('#sendCurrency', el => el.value).catch(() => '');
    await page.click('#receiveCurrency', { clickCount: 3 });
    await page.keyboard.type(String(AMOUNT));
    await page.dispatchEvent('#receiveCurrency', 'blur');
    await page.waitForFunction(
      (prev) => { const el = document.querySelector('#sendCurrency'); return el && el.value !== prev && el.value !== ''; },
      prevSend, { timeout: 10000 }
    ).catch(() => null);
    const raw = await page.$eval('#sendCurrency', el => el.value).catch(() => null);
    const sendAmt = extractNumber(raw);
    if (!sendAmt) throw new Error('총 송금액 추출 실패');
    const fee = 0;
    return { operator: 'Debunk', receiving_country: COUNTRY, receive_amount: AMOUNT,
      send_amount_krw: sendAmt, service_fee: fee, total_sending_amount: sendAmt + fee,
      delivery_method: 'Alipay' };
  } finally { await page.close(); }
}

// ─── 스크래퍼 목록 ────────────────────────────────────────────────────────────
const SCRAPERS = [
  { name: 'GME',                       fn: () => scrapeGmeApi('17', 'Alipay'),                          needsBrowser: false },
  { name: 'GMoneyTrans',              fn: () => scrapeGmoneytransApi('Alipay', 'Alipay'),              needsBrowser: false },
  { name: 'Hanpass',           fn: () => withRetry(() => scrapeHanpass({ mtoServiceCenterCode: 'ALMW-0001' }, 'Alipay')),  needsBrowser: false },
  { name: 'SBI',         fn: (b) => withRetry(() => scrapeSbi(b)), needsBrowser: true  },
  { name: 'Cross',       fn: (b) => withRetry(() => scrapeCross(b)), needsBrowser: true  },
  { name: 'WireBarley',  fn: (b) => withRetry(() => scrapeWirebarley(b)), needsBrowser: true  },
  { name: 'Coinshot',    fn: (b) => withRetry(() => scrapeCoinshot(b)), needsBrowser: true  },
  { name: 'E9Pay (Alipay)',    fn: (b) => withRetry(() => scrapeE9pay(b, 'ALIPAY', 7000, 'Alipay')),      needsBrowser: true },
  { name: 'Utransfer',   fn: (b) => withRetry(() => scrapeUtransfer(b)), needsBrowser: true  },
  { name: 'Moin',        fn: (b) => withRetry(() => scrapeMoin(b)), needsBrowser: true  },
  { name: 'Debunk',      fn: (b) => withRetry(() => scrapeDebunk(b)), needsBrowser: true  },
];

// ─── 메인 ─────────────────────────────────────────────────────────────────────
async function main() {
  const runHour = getRunHour();
  console.log(`\n[${new Date().toISOString()}] China CNY 스크래핑 시작 — run_hour: ${runHour}\n`);

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
      logFailure(runHour, COUNTRY, name, 'Alipay', result.reason?.message);
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

  // GME 기준값
  const gmeRecord   = adjusted.find(r => r.operator === 'GME');
  const gmeBaseline = gmeRecord?.total_sending_amount ?? null;

  if (!gmeBaseline) console.warn('\n⚠️  GME 기준값 없음 — price_gap 계산 불가');

  const toSave = adjusted.map(r => {
    const baseline = gmeBaseline;
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
    console.log(`\n✅ ${toSave.length}건 Supabase 저장 완료 (China CNY)`);
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

  console.log('\n── China CNY 10,000 결과 요약 ─────────────────────────────────────');
  console.log(`${'운영사'.padEnd(14)} ${'수령방식'.padEnd(14)} ${'송금액(KRW)'.padStart(12)} ${'수수료'.padStart(8)} ${'합계'.padStart(12)} 차이`);
  console.log('─'.repeat(74));
  toSave.sort((a, b) => a.total_sending_amount - b.total_sending_amount).forEach(r => {
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
