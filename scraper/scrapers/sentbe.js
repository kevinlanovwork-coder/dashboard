/**
 * Sentbe 스크래퍼 — Playwright 브라우저 자동화
 * URL: https://www.sentbe.com/ko
 */
import { extractNumber } from '../lib/browser.js';

export const OPERATOR = 'Sentbe';

export async function scrape(browser) {
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    locale: 'ko-KR',
  });
  const page = await context.newPage();
  try {
    await page.goto('https://www.sentbe.com/ko', {
      waitUntil: 'networkidle',
      timeout: 30000,
    });

    // ── 팝업 닫기 ──────────────────────────────────────────────────────
    await page.click('button.close').catch(() => null);
    await page.waitForTimeout(500);

    // ── 수신 국가: 인도네시아 / 루피아 - IDR 선택 ──────────────────────
    await page.waitForSelector('.receiveAmountInput .el-input-group__append', { timeout: 10000 });
    await page.click('.receiveAmountInput .el-input-group__append');
    await page.waitForTimeout(500);
    await page.click('.receiveAmountInput .el-select-dropdown__item:has-text("인도네시아")');
    await page.waitForTimeout(1000);

    // ── 수령액 입력: 13,000,000 IDR ────────────────────────────────────
    await page.click('#receiveAmount', { clickCount: 3 });
    await page.fill('#receiveAmount', '13000000');
    await page.press('#receiveAmount', 'Tab');
    await page.waitForTimeout(3000);

    // ── 총 송금액(KRW) 추출 ─────────────────────────────────────────────
    // Sentbe는 수수료 없음 — 환율 스프레드로 수익 창출
    const totalRaw = await page.$eval('#sendAmount', el => el.value).catch(() => null);
    const total = extractNumber(totalRaw);
    if (!total) throw new Error('총 송금액을 추출할 수 없습니다.');

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
    await context.close();
  }
}
