/**
 * Hanpass 스크래퍼 — Playwright 브라우저 자동화
 * URL: https://www.hanpass.com/en  (또는 /ko)
 * 기술: Next.js SSR
 *
 * ⚠️  셀렉터 검증 필요
 */
import { getTextFromSelectors } from '../lib/browser.js';

export const OPERATOR = 'Hanpass';

export async function scrape(browser) {
  const page = await browser.newPage();
  try {
    // 영어 페이지가 안정적이라면 /en, 한국어이면 /ko 사용
    await page.goto('https://www.hanpass.com/en', {
      waitUntil: 'networkidle',
      timeout: 30000,
    });

    // ── 수신 국가 선택 ─────────────────────────────────────────────────
    // TODO: 실제 셀렉터 확인
    const countryEl = await page.$('select[name="country"], .country-select, [data-testid="country-selector"]');
    if (countryEl) {
      await countryEl.selectOption({ label: 'Indonesia' });
    } else {
      await page.click('button:has-text("Indonesia"), .destination-country').catch(() => null);
    }

    await page.waitForTimeout(500);

    // ── 수령액 입력: 13,000,000 IDR ────────────────────────────────────
    // TODO: 실제 입력 필드 셀렉터 확인
    const receiveInput = await page.$([
      'input[name="receiveAmount"]',
      'input[placeholder*="receive"]',
      'input[placeholder*="받을"]',
      '.receive-input',
      '#receive',
    ].join(', '));

    if (!receiveInput) throw new Error('수령액 입력 필드를 찾을 수 없습니다.');

    await receiveInput.click({ clickCount: 3 });
    await receiveInput.fill('13000000');
    await page.waitForTimeout(2000);

    // ── 총 송금액 추출 ─────────────────────────────────────────────────
    const total = await getTextFromSelectors(page, [
      '.total-amount',
      '.send-krw',
      '[data-testid="total-krw"]',
      '.remittance-total strong',
      '.amount-result',
    ]);

    if (!total) throw new Error('총 송금액을 추출할 수 없습니다.');

    const fee = 5000; // Hanpass 고정 수수료 5,000원 (기존 데이터 기준)

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
