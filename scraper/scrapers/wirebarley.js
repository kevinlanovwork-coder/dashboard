/**
 * WireBarley 스크래퍼 — Playwright 브라우저 자동화
 * URL: https://www.wirebarley.com/ko
 *
 * ⚠️  셀렉터 검증 필요: 브라우저에서 사이트를 열고
 *     DevTools > Inspector로 각 요소의 실제 클래스/속성을 확인하세요.
 */
import { extractNumber, getTextFromSelectors } from '../lib/browser.js';

export const OPERATOR = 'WireBarley';

export async function scrape(browser) {
  const page = await browser.newPage();
  try {
    await page.goto('https://www.wirebarley.com/ko', {
      waitUntil: 'networkidle',
      timeout: 30000,
    });

    // ── 수신 국가: Indonesia 선택 ─────────────────────────────────────
    // TODO: DevTools에서 국가 선택 버튼 셀렉터 확인
    const countryBtn = await page.$('[data-country="Indonesia"], button:has-text("Indonesia"), .receive-country');
    if (countryBtn) {
      await countryBtn.click();
      await page.waitForTimeout(500);
    } else {
      // 드롭다운에서 Indonesia 검색
      const countryInput = await page.$('input[placeholder*="country"], input[placeholder*="국가"]');
      if (countryInput) {
        await countryInput.fill('Indonesia');
        await page.waitForTimeout(500);
        await page.click('li:has-text("Indonesia"), .option:has-text("Indonesia")');
      }
    }

    // ── 수령액 입력: 13,000,000 IDR ────────────────────────────────────
    // TODO: 실제 입력 필드 셀렉터 확인
    const receiveInput = await page.$([
      'input[name="receiveAmount"]',
      'input[placeholder*="받는"]',
      'input[placeholder*="receive"]',
      '.receive-amount input',
      '#receiveAmount',
    ].join(', '));

    if (receiveInput) {
      await receiveInput.triple_click?.() ?? await receiveInput.click({ clickCount: 3 });
      await receiveInput.fill('13000000');
      await page.waitForTimeout(2000); // 환율 계산 대기
    } else {
      // 보내는 금액 기반으로 역산하는 사이트인 경우 대안 로직 필요
      throw new Error('수령액 입력 필드를 찾을 수 없습니다. 셀렉터를 확인하세요.');
    }

    // ── 총 송금액(KRW) 추출 ────────────────────────────────────────────
    // TODO: 결과 표시 영역 셀렉터 확인
    const total = await getTextFromSelectors(page, [
      '[data-testid="totalAmount"]',
      '.total-amount',
      '.send-amount strong',
      '.remittance-result .amount',
      'span.krw-amount',
    ]);

    if (!total) throw new Error('총 송금액을 추출할 수 없습니다. 셀렉터를 확인하세요.');

    return {
      operator: OPERATOR,
      receiving_country: 'Indonesia',
      receive_amount: 13_000_000,
      send_amount_krw: total,
      service_fee: 0,
      total_sending_amount: total,
    };
  } finally {
    await page.close();
  }
}
