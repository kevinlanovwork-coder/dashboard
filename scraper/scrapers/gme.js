/**
 * GME (Global Money Express) 스크래퍼 — Playwright 브라우저 자동화
 * URL: https://online.gmeremit.com/
 */
import { extractNumber } from '../lib/browser.js';

export const OPERATOR = 'GME';

export async function scrape(browser) {
  const page = await browser.newPage();
  try {
    await page.goto('https://online.gmeremit.com/', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    // ── 수신 국가: Indonesia (IDR) 선택 ────────────────────────────────
    // #nCountry 클릭 → 드롭다운 열기
    await page.waitForSelector('#nCountry', { timeout: 10000 });
    await page.click('#nCountry');
    await page.waitForTimeout(500);

    // 검색창에 "Indonesia" 입력해 필터링
    await page.waitForSelector('#CountryValue', { timeout: 5000 });
    await page.fill('#CountryValue', 'Indonesia');
    await page.waitForTimeout(300);

    // Indonesia (IDR) 항목 클릭
    await page.click('#toCurrUl li[data-countrycode="IDR"]');
    await page.waitForTimeout(1000);

    // ── 수령액 입력: 13,000,000 IDR ────────────────────────────────────
    await page.waitForSelector('#recAmt', { timeout: 10000 });
    await page.click('#recAmt', { clickCount: 3 });
    await page.fill('#recAmt', '13000000');

    // onchange="Calculate('P')" 트리거
    await page.dispatchEvent('#recAmt', 'change');

    // ── 총 송금액(KRW) 추출 — 계산 완료 대기 ────────────────────────
    let total = null;
    for (let attempt = 0; attempt < 10; attempt++) {
      await page.waitForTimeout(1000);
      const raw = await page.$eval('#numAmount', el => el.value || el.textContent).catch(() => null);
      total = extractNumber(raw);
      if (total && total !== 1_000_000) break;
    }
    if (!total || total === 1_000_000) throw new Error('총 송금액 계산 대기 초과 (기본값 반환됨)');

    // 수수료는 이미 #numAmount(총 송금액)에 포함되어 있음
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
  }
}
