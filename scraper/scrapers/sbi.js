/**
 * SBI Cosmoney 스크래퍼 — Playwright 브라우저 자동화
 * URL: https://www.sbicosmoney.com/
 *
 * ⚠️  headless 탐지 우회: waitUntil 'load' + 실제 user-agent 필요
 *     networkidle 사용 시 /login?timeout 으로 리다이렉트됨
 */
import { extractNumber } from '../lib/browser.js';

export const OPERATOR = 'SBI';

export async function scrape(browser) {
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    locale: 'ko-KR',
  });
  const page = await context.newPage();
  try {
    await page.goto('https://www.sbicosmoney.com/', {
      waitUntil: 'load',
      timeout: 30000,
    });
    await page.waitForTimeout(2000);

    // ── 팝업 닫기 ──────────────────────────────────────────────────────
    await page.click('button:has-text("Close")').catch(() => null);
    await page.waitForTimeout(500);

    // ── 수신 국가: Indonesia (IDR) 선택 ────────────────────────────────
    await page.click('.dest-country');
    await page.waitForTimeout(500);
    await page.click('a[data-currency="IDR"]');
    await page.waitForTimeout(1500);

    // ── 수령액 입력: 13,000,000 IDR ────────────────────────────────────
    await page.click('#targetAmount', { clickCount: 3 });
    await page.fill('#targetAmount', '13000000');
    await page.dispatchEvent('#targetAmount', 'input');

    // ── 총 송금액(KRW) 추출 — 계산 완료 대기 ────────────────────────
    let sendAmt = null;
    for (let attempt = 0; attempt < 10; attempt++) {
      await page.waitForTimeout(1000);
      const sendAmtRaw = await page.inputValue('#krwAmount');
      sendAmt = extractNumber(sendAmtRaw);
      if (sendAmt && sendAmt !== 1_000_000) break;
    }
    if (!sendAmt || sendAmt === 1_000_000) throw new Error('총 송금액 계산 대기 초과 (기본값 반환됨)');

    // ── 수수료: 인도네시아 Bank Transfer 고정 5,000원 ───────────────────
    const fee = 5000;

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
    await context.close();
  }
}
