/**
 * Sentbe 스크래퍼 — Playwright 브라우저 자동화
 * URL: https://www.sentbe.com/ko
 * 기술: Nuxt.js SPA
 *
 * ⚠️  셀렉터 검증 필요
 */
import { getTextFromSelectors } from '../lib/browser.js';

export const OPERATOR = 'Sentbe';

export async function scrape(browser) {
  const page = await browser.newPage();
  try {
    await page.goto('https://www.sentbe.com/ko', {
      waitUntil: 'networkidle',
      timeout: 30000,
    });

    // ── 수신 국가: Indonesia 선택 ──────────────────────────────────────
    // TODO: 실제 셀렉터 확인
    await page.waitForSelector('.country-select, [data-country], select[name="country"]', { timeout: 10000 })
      .catch(() => null);

    const countryEl = await page.$('select[name="country"], .country-dropdown');
    if (countryEl) {
      await countryEl.selectOption({ label: 'Indonesia' });
    } else {
      const countryBtn = await page.$('button:has-text("인도네시아"), button:has-text("Indonesia"), .selected-country');
      if (countryBtn) await countryBtn.click();
      await page.waitForTimeout(500);
      await page.click('li:has-text("인도네시아"), li:has-text("Indonesia")').catch(() => null);
    }

    await page.waitForTimeout(500);

    // ── 수령액 입력 ────────────────────────────────────────────────────
    // TODO: 실제 입력 필드 셀렉터 확인
    const receiveInput = await page.$([
      'input[placeholder*="받을 금액"]',
      'input[placeholder*="receive"]',
      'input[name="receiverAmount"]',
      '#receive-amount',
    ].join(', '));

    if (!receiveInput) throw new Error('수령액 입력 필드를 찾을 수 없습니다.');

    await receiveInput.click({ clickCount: 3 });
    await receiveInput.fill('13000000');
    await page.waitForTimeout(2000);

    // ── 총 송금액 추출 ─────────────────────────────────────────────────
    const total = await getTextFromSelectors(page, [
      '.send-amount strong',
      '[data-testid="send-amount"]',
      '.remittance-result .krw',
      '.calculator-result strong',
      '.amount-krw',
    ]);

    if (!total) throw new Error('총 송금액을 추출할 수 없습니다.');

    // Sentbe 수수료는 별도 표시될 수 있음
    const fee = await getTextFromSelectors(page, ['.fee-amount', '.service-fee', '[data-testid="fee"]']) ?? 5000;

    return {
      operator: OPERATOR,
      receiving_country: 'Indonesia',
      receive_amount: 13_000_000,
      send_amount_krw: total - (typeof fee === 'number' ? fee : 5000),
      service_fee: typeof fee === 'number' ? fee : 5000,
      total_sending_amount: total,
    };
  } finally {
    await page.close();
  }
}
