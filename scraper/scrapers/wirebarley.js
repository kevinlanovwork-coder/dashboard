/**
 * WireBarley 스크래퍼 — Playwright 브라우저 자동화
 * URL: https://www.wirebarley.com/ko
 */
import { extractNumber } from '../lib/browser.js';

export const OPERATOR = 'WireBarley';

export async function scrape(browser) {
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    locale: 'ko-KR',
  });
  const page = await context.newPage();
  try {
    await page.goto('https://www.wirebarley.com/ko', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await page.waitForTimeout(3000);

    // ── 광고 팝업 닫기 ─────────────────────────────────────────────────
    await page.locator('#lafc-popup button').click().catch(() => null);
    await page.waitForTimeout(1000);

    // ── 수신 통화 드롭다운 열기 (기본값: USD) ──────────────────────────
    await page.locator('[data-title="currencyToMoneyBox"]').nth(1)
      .locator('img[alt="드롭 다운"]').click();
    await page.waitForTimeout(2000);

    // ── 수신 국가: Indonesia (IDR) 선택 ────────────────────────────────
    await page.locator('button:has(img[alt="ID"])').click();
    await page.waitForTimeout(2000);

    // ── 수령액 입력: 13,000,000 IDR ────────────────────────────────────
    // 금액 버튼 클릭 → input 활성화
    await page.locator('[data-title="currencyToMoneyBox"]').nth(1).locator('button').click();
    await page.waitForTimeout(500);

    await page.locator('input').nth(1).click({ clickCount: 3 });
    await page.locator('input').nth(1).fill('13000000');
    await page.locator('input').nth(1).press('Enter');

    // ── 총 입금액(KRW) 추출 (polling) ────────────────────────────────────
    let total = null;
    for (let attempt = 0; attempt < 10; attempt++) {
      await page.waitForTimeout(1000);
      const totalRaw = await page.evaluate(() => {
        const ps = Array.from(document.querySelectorAll('p'));
        const label = ps.find(p => p.textContent.trim() === '총 입금액');
        return label?.nextElementSibling?.textContent?.trim() ?? null;
      });
      total = extractNumber(totalRaw);
      if (total && total > 1_000_000) break;
    }
    if (!total || total <= 1_000_000) throw new Error('총 송금액 계산 대기 초과 (기본값 반환됨)');

    // ── 수수료 추출 ────────────────────────────────────────────────────
    const feeRaw = await page.evaluate(() => {
      const ps = Array.from(document.querySelectorAll('p'));
      const label = ps.find(p => p.textContent.trim() === '수수료');
      return label?.nextElementSibling?.textContent?.trim() ?? null;
    });
    const fee = extractNumber(feeRaw) ?? 0;

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
    await context.close();
  }
}
