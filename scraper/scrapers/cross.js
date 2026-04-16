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
    await page.locator('div.cursor-pointer.group').click();
    await page.waitForSelector('#aside-root ul', { timeout: 10000 });
    const searchInput = page.locator('#aside-root input');
    await searchInput.fill('IDR');
    await page.waitForTimeout(1000);

    // Indonesia 국기(ID flag) 이미지로 li 선택
    await page.locator('#aside-root li:has(img[alt="ID flag"])').click();
    await page.waitForTimeout(1000);

    // ── 수령액 입력: 13,000,000 IDR ────────────────────────────────────
    const receiveInput = page.locator('input[inputmode="numeric"]').nth(1);
    await receiveInput.click({ clickCount: 3 });
    await receiveInput.fill('13000000');
    await receiveInput.press('Tab');

    // ── 총 송금액(KRW) 추출 — 계산 완료 대기 ────────────────────────
    let total = null;
    for (let attempt = 0; attempt < 10; attempt++) {
      await page.waitForTimeout(1000);
      const raw = await page.locator('input[inputmode="numeric"]').nth(0).inputValue();
      total = extractNumber(raw);
      if (total && total !== 1_000_000) break;
    }
    if (!total || total === 1_000_000) throw new Error('총 송금액 계산 대기 초과 (기본값 반환됨)');

    // 수수료 추출 (프로모션으로 0원일 수 있음)
    const fee = await page.evaluate(() => {
      const row = [...document.querySelectorAll('div')].find(d =>
        d.className?.includes('border-t') && d.textContent?.includes('Fee')
      );
      if (!row) return 0;
      const spans = row.querySelectorAll('span');
      const last = spans[spans.length - 1]?.textContent || '0';
      return parseInt(last.replace(/[^0-9]/g, ''), 10) || 0;
    });

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
