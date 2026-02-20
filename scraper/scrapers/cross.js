/**
 * Cross 스크래퍼 — Playwright 브라우저 자동화
 * URL: https://crossenf.com/remittance
 */
import { extractNumber } from '../lib/browser.js';

export const OPERATOR = 'Cross';

export async function scrape(browser) {
  const page = await browser.newPage();
  try {
    // networkidle 미달성 사이트 — load 사용
    await page.goto('https://crossenf.com/remittance', {
      waitUntil: 'load',
      timeout: 30000,
    });
    await page.waitForTimeout(2000);

    // ── 수신 국가: Indonesia (IDR) 선택 ────────────────────────────────
    // 수신 통화 드롭다운 열기 (기본값 THB)
    await page.locator('div.relative:has(span:text("THB"))').click();
    await page.waitForSelector('#aside-root ul', { timeout: 10000 });

    // Indonesia 국기(ID flag) 이미지로 li 선택
    await page.locator('#aside-root li:has(img[alt="ID flag"])').click();
    await page.waitForTimeout(1000);

    // ── 수령액 입력: 13,000,000 IDR ────────────────────────────────────
    const receiveInput = page.locator('input[inputmode="numeric"]').nth(1);
    await receiveInput.click({ clickCount: 3 });
    await receiveInput.fill('13000000');
    await receiveInput.press('Tab');
    await page.waitForTimeout(3000);

    // ── 총 송금액(KRW) 추출 ────────────────────────────────────────────
    const totalRaw = await page.locator('input[inputmode="numeric"]').nth(0).inputValue();
    const total = extractNumber(totalRaw);
    if (!total) throw new Error('총 송금액을 추출할 수 없습니다.');

    const fee = 5000;

    return {
      operator: OPERATOR,
      receiving_country: 'Indonesia',
      receive_amount: 13_000_000,
      send_amount_krw: total,
      service_fee: fee,
      total_sending_amount: total + fee,
    };
  } finally {
    await page.close();
  }
}
