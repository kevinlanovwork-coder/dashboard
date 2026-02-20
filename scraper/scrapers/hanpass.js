/**
 * Hanpass 스크래퍼 — Playwright 브라우저 자동화
 * URL: https://www.hanpass.com/en
 */
import { extractNumber } from '../lib/browser.js';

export const OPERATOR = 'Hanpass';

export async function scrape(browser) {
  const page = await browser.newPage();
  try {
    await page.goto('https://www.hanpass.com/en', {
      waitUntil: 'networkidle',
      timeout: 30000,
    });

    // ── 수신 국가: Indonesia (IDR) 선택 ────────────────────────────────
    await page.locator('.ExchangeCalculator_recipientAmountField__lbLSL button').click();
    await page.waitForSelector('#countrySearch', { timeout: 10000 });
    await page.fill('#countrySearch', 'Indonesia');
    await page.waitForTimeout(500);
    await page.locator('button[aria-label="Indonesia IDR"]').first().click();
    await page.waitForTimeout(1500);

    // ── 수령액 입력: 13,000,000 IDR ────────────────────────────────────
    await page.click('#recipient', { clickCount: 3 });
    await page.fill('#recipient', '13000000');
    await page.press('#recipient', 'Tab');
    await page.waitForTimeout(3000);

    // ── 총 송금액(KRW) 추출 — #deposit 값이 fee 포함 총액 ───────────────
    const totalRaw = await page.$eval('#deposit', el => el.value).catch(() => null);
    const total = extractNumber(totalRaw);
    if (!total) throw new Error('총 송금액을 추출할 수 없습니다.');

    // ── 수수료 추출 ────────────────────────────────────────────────────
    const feeRaw = await page.locator('.ExchangeCalculator_row__EPWVT')
      .filter({ hasText: 'Remittance fee' })
      .locator('span:last-child')
      .textContent()
      .catch(() => null);
    const fee = extractNumber(feeRaw) ?? 0;

    return {
      operator: OPERATOR,
      receiving_country: 'Indonesia',
      receive_amount: 13_000_000,
      send_amount_krw: total - fee,
      service_fee: fee,
      total_sending_amount: total,
    };
  } finally {
    await page.close();
  }
}
