/**
 * Quick test: WireBarley (THB) + Sentbe (THB + VND) in headless mode
 */
import { chromium } from 'playwright';
import { extractNumber } from './lib/browser.js';

const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});

// ─── WireBarley THB ──────────────────────────────────────────────────────────
console.log('\n--- WireBarley (THB 26,000) ---');
try {
  const page = await browser.newPage();
  await page.goto('https://www.wirebarley.com/ko', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);
  await page.locator('#lafc-popup button').click().catch(() => null);
  await page.waitForTimeout(1000);

  // Check current state
  const dropdownCount = await page.locator('[data-title="currencyToMoneyBox"]').count();
  console.log('currencyToMoneyBox count:', dropdownCount);

  await page.locator('[data-title="currencyToMoneyBox"]').nth(1)
    .locator('img[alt="드롭 다운"]').click();
  await page.waitForTimeout(2000);

  const thButtons = await page.locator('button:has(img[alt="TH"])').count();
  console.log('TH flag buttons found:', thButtons);

  await page.locator('button:has(img[alt="TH"])').click();
  await page.waitForTimeout(2000);

  await page.locator('[data-title="currencyToMoneyBox"]').nth(1).locator('button').click();
  await page.waitForTimeout(500);
  await page.locator('input').nth(1).click({ clickCount: 3 });
  await page.locator('input').nth(1).fill('26000');
  await page.locator('input').nth(1).press('Enter');
  await page.waitForTimeout(3000);

  const totalRaw = await page.evaluate(() => {
    const ps = Array.from(document.querySelectorAll('p'));
    const label = ps.find(p => p.textContent.trim() === '총 입금액');
    return label?.nextElementSibling?.textContent?.trim() ?? null;
  });
  console.log('총 입금액 raw:', totalRaw);
  console.log('Extracted:', extractNumber(totalRaw));
  await page.close();
} catch (e) { console.error('WireBarley FAILED:', e.message); }

// ─── Sentbe THB ──────────────────────────────────────────────────────────────
console.log('\n--- Sentbe (THB 26,000) ---');
try {
  const page = await browser.newPage();
  await page.goto('https://www.sentbe.com/ko', { waitUntil: 'networkidle', timeout: 30000 });
  await page.click('button.close').catch(() => null);
  await page.waitForTimeout(500);
  await page.waitForSelector('.receiveAmountInput .el-input-group__append', { timeout: 10000 });
  await page.click('.receiveAmountInput .el-input-group__append');
  await page.waitForTimeout(500);

  const items = await page.locator('.receiveAmountInput .el-select-dropdown__item').allTextContents();
  console.log('Dropdown items:', items);

  await page.click('.receiveAmountInput .el-select-dropdown__item:has-text("태국")');
  await page.waitForTimeout(1000);
  await page.click('#receiveAmount', { clickCount: 3 });
  await page.fill('#receiveAmount', '26000');
  await page.press('#receiveAmount', 'Tab');
  await page.waitForTimeout(3000);

  const val = await page.$eval('#sendAmount', el => el.value).catch(() => null);
  console.log('sendAmount:', val, '→', extractNumber(val));
  await page.close();
} catch (e) { console.error('Sentbe THB FAILED:', e.message); }

// ─── Sentbe VND ──────────────────────────────────────────────────────────────
console.log('\n--- Sentbe (VND 20,000,000) ---');
try {
  const page = await browser.newPage();
  await page.goto('https://www.sentbe.com/ko', { waitUntil: 'networkidle', timeout: 30000 });
  await page.click('button.close').catch(() => null);
  await page.waitForTimeout(500);
  await page.waitForSelector('.receiveAmountInput .el-input-group__append', { timeout: 10000 });
  await page.click('.receiveAmountInput .el-input-group__append');
  await page.waitForTimeout(500);

  const items = await page.locator('.receiveAmountInput .el-select-dropdown__item').allTextContents();
  console.log('Dropdown items:', items.filter(i => i.includes('베트남')));

  await page.click('.receiveAmountInput .el-select-dropdown__item:has-text("베트남 / 동")');
  await page.waitForTimeout(1000);
  await page.click('#receiveAmount', { clickCount: 3 });
  await page.fill('#receiveAmount', '20000000');
  await page.press('#receiveAmount', 'Tab');
  await page.waitForTimeout(3000);

  const val = await page.$eval('#sendAmount', el => el.value).catch(() => null);
  console.log('sendAmount:', val, '→', extractNumber(val));
  await page.close();
} catch (e) { console.error('Sentbe VND FAILED:', e.message); }

await browser.close();
console.log('\nDone.');
