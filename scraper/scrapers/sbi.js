/**
 * SBI 스크래퍼 — Playwright 브라우저 자동화
 *
 * ⚠️  URL 및 셀렉터 검증 필요: 실제 SBI 한국 송금 서비스 URL을 확인하세요.
 */
import { getTextFromSelectors } from '../lib/browser.js';

export const OPERATOR = 'SBI';

export async function scrape(browser) {
  const page = await browser.newPage();
  try {
    await page.goto('https://www.sbicosmoney.com/', {
      waitUntil: 'networkidle',
      timeout: 30000,
    });

    // ── 수신 국가: Indonesia 선택 ──────────────────────────────────────
    const countryEl = await page.$('select[name="country"], .country-select, [data-testid="country"]');
    if (countryEl) {
      await countryEl.selectOption({ label: 'Indonesia' }).catch(() =>
        countryEl.selectOption({ label: '인도네시아' })
      );
    } else {
      await page.click('button:has-text("Indonesia"), button:has-text("인도네시아")').catch(() => null);
      await page.waitForTimeout(500);
      await page.click('li:has-text("Indonesia"), li:has-text("인도네시아")').catch(() => null);
    }

    await page.waitForTimeout(500);

    // ── 수령액 입력 ────────────────────────────────────────────────────
    const receiveInput = await page.$([
      'input[name="receiveAmount"]',
      'input[placeholder*="receive"]',
      'input[placeholder*="받을"]',
      '#receiveAmount',
    ].join(', '));

    if (!receiveInput) throw new Error('수령액 입력 필드를 찾을 수 없습니다.');

    await receiveInput.click({ clickCount: 3 });
    await receiveInput.fill('13000000');
    await page.waitForTimeout(2000);

    // ── 총 송금액 추출 ─────────────────────────────────────────────────
    const total = await getTextFromSelectors(page, [
      '.total-amount',
      '.send-amount',
      '[data-testid="total"]',
      '.remittance-result .amount',
      '#totalAmount',
    ]);

    if (!total) throw new Error('총 송금액을 추출할 수 없습니다.');

    const fee = await getTextFromSelectors(page, ['.fee-amount', '.service-fee']) ?? 0;

    return {
      operator: OPERATOR,
      receiving_country: 'Indonesia',
      receive_amount: 13_000_000,
      send_amount_krw: typeof total === 'number' ? total - (typeof fee === 'number' ? fee : 0) : total,
      service_fee: typeof fee === 'number' ? fee : 0,
      total_sending_amount: total,
    };
  } finally {
    await page.close();
  }
}
