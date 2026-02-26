/**
 * Utransfer 스크래퍼 — Playwright 브라우저 자동화
 * URL: https://www.utransfer.com
 */
import { extractNumber } from '../lib/browser.js';

export const OPERATOR = 'Utransfer';

export async function scrape(browser) {
  const page = await browser.newPage();
  try {
    await page.goto('https://www.utransfer.com', {
      waitUntil: 'networkidle',
      timeout: 30000,
    });
    await page.waitForTimeout(2000);

    // ── 수신 통화: IDR 선택 (두 번째 select) ───────────────────────────
    await page.locator('select').nth(1).selectOption('IDR');
    await page.waitForTimeout(1000);

    // ── 수령액 입력: 13,000,000 IDR ────────────────────────────────────
    await page.click('input[name="toAmount"]', { clickCount: 3 });
    await page.fill('input[name="toAmount"]', '13000000');
    await page.dispatchEvent('input[name="toAmount"]', 'change');

    // ── 총 송금액(KRW) 추출 — 계산 완료 대기 ────────────────────────
    let sendAmt = null;
    for (let attempt = 0; attempt < 10; attempt++) {
      await page.waitForTimeout(1000);
      const raw = await page.inputValue('input[name="fromAmount"]').catch(() => null);
      sendAmt = extractNumber(raw);
      if (sendAmt && sendAmt > 1_000_000) break;
    }
    if (!sendAmt || sendAmt <= 1_000_000) throw new Error('총 송금액 계산 대기 초과 (기본값 반환됨)');

    // ── 수수료 추출 ────────────────────────────────────────────────────
    const feeRaw = await page.locator('.utransfer_fees').textContent().catch(() => null);
    const fee = extractNumber(feeRaw) ?? 5000;

    return {
      operator: OPERATOR,
      receiving_country: 'Indonesia',
      receive_amount: 13_000_000,
      send_amount_krw: sendAmt,
      service_fee: fee,
      total_sending_amount: sendAmt + fee,
    };
  } finally {
    await page.close();
  }
}
