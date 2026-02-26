/**
 * Coinshot 스크래퍼 — Playwright 브라우저 자동화
 * URL: https://coinshot.org/main
 */
import { extractNumber } from '../lib/browser.js';

export const OPERATOR = 'Coinshot';

export async function scrape(browser) {
  const page = await browser.newPage();
  try {
    await page.goto('https://coinshot.org/main', {
      waitUntil: 'load',
      timeout: 30000,
    });
    await page.waitForTimeout(2000);

    // ── 언어 선택 모달 닫기 ────────────────────────────────────────────
    await page.waitForSelector('button.lang-btn[value="ko"]', { timeout: 10000 });
    await page.click('button.lang-btn[value="ko"]');
    await page.waitForTimeout(1000);

    // ── 수신 국가: Indonesia (IDR) 선택 ────────────────────────────────
    await page.click('#current-receiving-currency');
    await page.waitForTimeout(500);
    await page.click('#select-receiving-currency a[data-currency="IDR"]');
    await page.waitForTimeout(1000);

    // ── 수령액 입력: 13,000,000 IDR ────────────────────────────────────
    await page.click('#receiving-input', { clickCount: 3 });
    await page.fill('#receiving-input', '13000000');
    await page.press('#receiving-input', 'Enter');

    // ── 총 송금액(KRW) 추출 — 계산 완료 대기 ────────────────────────
    let sendAmt = null;
    for (let attempt = 0; attempt < 10; attempt++) {
      await page.waitForTimeout(1000);
      const raw = await page.inputValue('#sending-input');
      sendAmt = extractNumber(raw);
      if (sendAmt && sendAmt !== 1_000_000) break;
    }
    if (!sendAmt || sendAmt === 1_000_000) throw new Error('총 송금액 계산 대기 초과 (기본값 반환됨)');

    // ── 수수료 추출 — h5.text-left 에 "코인샷 수수료 X원이 포함되지 않은 금액입니다" ──
    const feeRaw = await page.locator('h5.text-left').textContent().catch(() => null);
    const fee = extractNumber(feeRaw) ?? 2500;

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
