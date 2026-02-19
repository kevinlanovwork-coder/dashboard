/**
 * Utransfer 스크래퍼 — Playwright 브라우저 자동화
 * URL: https://www.utransfer.com
 * 기술: React SPA (jQuery + webpack)
 *
 * ⚠️  셀렉터 검증 필요
 */
import { getTextFromSelectors } from '../lib/browser.js';

export const OPERATOR = 'Utransfer';

export async function scrape(browser) {
  const page = await browser.newPage();
  try {
    await page.goto('https://www.utransfer.com', {
      waitUntil: 'networkidle',
      timeout: 30000,
    });

    // ── 수신 국가 선택 ─────────────────────────────────────────────────
    // TODO: 실제 셀렉터 확인
    const countryEl = await page.$('select[name="country"], .country-list, [data-country]');
    if (countryEl) {
      const tag = await countryEl.evaluate(el => el.tagName.toLowerCase());
      if (tag === 'select') {
        await countryEl.selectOption({ label: 'Indonesia' });
      } else {
        await countryEl.click();
        await page.click('li:has-text("Indonesia"), option:has-text("Indonesia")').catch(() => null);
      }
    }

    await page.waitForTimeout(500);

    // ── 수령액 입력 ────────────────────────────────────────────────────
    const receiveInput = await page.$([
      'input[name="receiveAmount"]',
      'input[placeholder*="받을"]',
      'input[placeholder*="receive"]',
      '.receive-amount-input',
    ].join(', '));

    if (!receiveInput) throw new Error('수령액 입력 필드를 찾을 수 없습니다.');

    await receiveInput.click({ clickCount: 3 });
    await receiveInput.fill('13000000');
    await page.waitForTimeout(2000);

    // ── 총 송금액 추출 ─────────────────────────────────────────────────
    const total = await getTextFromSelectors(page, [
      '.send-amount',
      '.total-krw',
      '[data-testid="total"]',
      '.remittance-result .amount',
      '#totalAmount',
    ]);

    if (!total) throw new Error('총 송금액을 추출할 수 없습니다.');

    const fee = 5000; // Utransfer 고정 수수료 5,000원 (기존 데이터 기준)

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
