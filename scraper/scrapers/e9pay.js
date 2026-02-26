/**
 * E9Pay 스크래퍼 — Playwright 브라우저 자동화
 * URL: https://www.e9pay.co.kr/
 */
import { extractNumber } from '../lib/browser.js';

export const OPERATOR = 'E9Pay';

export async function scrape(browser) {
  const page = await browser.newPage();
  try {
    await page.goto('https://www.e9pay.co.kr/', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await page.waitForTimeout(3000);

    // ── 수신 국가: Indonesia (IDR) 선택 (라디오가 CSS로 숨겨져 있어 JS로 트리거) ──
    await page.waitForSelector('#ID_IDR', { state: 'attached', timeout: 10000 });
    await page.evaluate(() => {
      const radio = document.querySelector('#ID_IDR');
      radio.checked = true;
      radio.dispatchEvent(new Event('change', { bubbles: true }));
      radio.dispatchEvent(new Event('click', { bubbles: true }));
    });
    await page.waitForTimeout(1000);

    // ── reverse 버튼 클릭 → 수령액 입력 모드로 전환 ────────────────────
    await page.waitForSelector('#reverse', { timeout: 5000 });
    await page.click('#reverse');
    await page.waitForTimeout(500);

    // ── 수령액 입력: 13,000,000 IDR ────────────────────────────────────
    await page.waitForSelector('#receive-money', { timeout: 5000 });
    await page.click('#receive-money', { clickCount: 3 });
    await page.fill('#receive-money', '13000000');
    await page.dispatchEvent('#receive-money', 'blur');

    // ── 총 송금액(KRW) 추출 — 계산 완료 대기 ────────────────────────
    let total = null;
    for (let attempt = 0; attempt < 10; attempt++) {
      await page.waitForTimeout(1000);
      const raw = await page.$eval('#send-money', el => el.value).catch(() => null);
      total = extractNumber(raw);
      if (total && total !== 1_000_000) break;
    }
    if (!total || total === 1_000_000) throw new Error('총 송금액 계산 대기 초과 (기본값 반환됨)');

    // ── 수수료 추출 ────────────────────────────────────────────────────
    const feeRaw = await page.$eval('#remit-fee', el => el.textContent || el.value).catch(() => null);
    const fee = extractNumber(feeRaw) ?? 0;

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
