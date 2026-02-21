/**
 * JRF (JP Remit) 스크래퍼 — Playwright 브라우저 자동화
 * URL: https://www.jpremit.co.kr/
 */
import { extractNumber } from '../lib/browser.js';

export const OPERATOR = 'JRF';

export async function scrape(browser) {
  const page = await browser.newPage();
  try {
    await page.goto('https://www.jpremit.co.kr/', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await page.waitForTimeout(3000);

    // ── 수신 통화: IDR 선택 ─────────────────────────────────────────────
    await page.click('#div_curr');
    await page.waitForTimeout(500);
    await page.click('li#IDR');
    await page.waitForTimeout(1500);

    // ── 수령액 입력: 13,000,000 IDR ────────────────────────────────────
    await page.click('#rec_money', { clickCount: 3 });
    await page.fill('#rec_money', '13000000');
    await page.dispatchEvent('#rec_money', 'keyup');
    await page.waitForTimeout(3000);

    // ── 총 송금액(KRW) 추출 — fee 미포함 ──────────────────────────────
    const sendAmtRaw = await page.inputValue('#send_money');
    const sendAmt = extractNumber(sendAmtRaw);
    if (!sendAmt) throw new Error('총 송금액을 추출할 수 없습니다.');

    // ── 수수료 추출 ────────────────────────────────────────────────────
    const feeRaw = await page.textContent('#servicefee').catch(() => null);
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
