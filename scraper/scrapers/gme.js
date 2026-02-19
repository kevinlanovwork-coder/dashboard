/**
 * GME (Global Money Express) 스크래퍼 — Playwright 브라우저 자동화
 * URL: https://online.gmeremit.com/
 *
 * ⚠️  셀렉터 검증 필요
 */
import { getTextFromSelectors } from '../lib/browser.js';

export const OPERATOR = 'GME';

export async function scrape(browser) {
  const page = await browser.newPage();
  try {
    await page.goto('https://online.gmeremit.com/', {
      waitUntil: 'networkidle',
      timeout: 30000,
    });

    // ── 수신 국가: Indonesia 선택 ──────────────────────────────────────
    // TODO: 실제 셀렉터 확인
    await page.waitForSelector('select, .country-select, [data-testid]', { timeout: 10000 })
      .catch(() => null);

    const countryEl = await page.$('select[name="country"], select[name="receivingCountry"], .country-select');
    if (countryEl) {
      await countryEl.selectOption({ label: 'Indonesia' }).catch(() =>
        countryEl.selectOption({ value: 'IDR' })
      );
    } else {
      await page.click('button:has-text("Indonesia"), .destination-btn, [data-country="ID"]').catch(() => null);
    }

    await page.waitForTimeout(500);

    // ── 수령액 입력: 13,000,000 IDR ────────────────────────────────────
    const receiveInput = await page.$([
      'input[name="receiveAmount"]',
      'input[name="receivingAmount"]',
      'input[placeholder*="receive"]',
      'input[placeholder*="받을"]',
      '#receiveAmount',
      '.receive-input input',
    ].join(', '));

    if (!receiveInput) throw new Error('수령액 입력 필드를 찾을 수 없습니다.');

    await receiveInput.click({ clickCount: 3 });
    await receiveInput.fill('13000000');
    await page.waitForTimeout(2000);

    // ── 총 송금액(KRW) 추출 ────────────────────────────────────────────
    const total = await getTextFromSelectors(page, [
      '[data-testid="totalAmount"]',
      '[data-testid="sendAmount"]',
      '.total-amount',
      '.send-amount',
      '.krw-amount',
      '.remittance-total',
    ]);

    if (!total) throw new Error('총 송금액을 추출할 수 없습니다.');

    const fee = await getTextFromSelectors(page, [
      '[data-testid="fee"]',
      '.service-fee',
      '.fee-amount',
    ]) ?? 0;

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
