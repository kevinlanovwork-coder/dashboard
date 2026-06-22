/**
 * WireBarley 스크래퍼 — Playwright 브라우저 자동화
 * URL: https://www.wirebarley.com/ko
 *
 * 2026년 사이트 개편으로 메인 계산기가 React 위젯으로 교체됨:
 * - <input> 이 사라지고 금액은 <button> 안의 <label> 로 표시됨 (클릭 시 input 활성화)
 * - 국가 선택은 통화 셀렉터(받는 금액 박스 안의 div.cursor-pointer)를 눌러 검색 팝업을 열고,
 *   "받는 국가를 선택해주세요." 검색창에 한글 국가명을 입력 → 필터된 옵션 버튼(예: "중국CNY") 클릭.
 *   (홈페이지에 보이는 img[alt="중국"] 등은 /kr/send-money/* SEO 링크라 계산기와 무관)
 * - 통화 코드("CNY")로는 검색되지 않음 — 반드시 한글 국가명으로 검색.
 * - 총 입금액/수수료는 <p> 라벨의 다음 형제 텍스트에서 추출.
 *
 * 모든 코리도(corridor)에서 공유. 국가/금액 등은 opts로 주입한다.
 */
import { extractNumber } from '../lib/browser.js';

export const OPERATOR = 'WireBarley';
const URL = 'https://www.wirebarley.com/ko';

/** <p>라벨</p><다음형제>값</다음형제> 구조에서 값 텍스트 추출 */
function readLabel(page, label) {
  return page.evaluate((name) => {
    const p = Array.from(document.querySelectorAll('p')).find(el => el.textContent.trim() === name);
    return p?.nextElementSibling?.textContent?.trim() ?? null;
  }, label);
}

/**
 * @param {import('playwright').Browser} browser
 * @param {object} opts
 * @param {string} opts.koreanName        검색창에 입력할 한글 국가명 (예: '중국', '인도', '태국')
 * @param {string} opts.country           receiving_country (예: 'China')
 * @param {number} opts.amount            수령 금액 (수신 통화 기준)
 * @param {string} [opts.deliveryMethod]  반환 레코드의 delivery_method (예: 'Alipay')
 */
export async function scrape(browser, opts = {}) {
  const { koreanName, country, amount, deliveryMethod = null } = opts;

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    locale: 'ko-KR',
  });
  const page = await context.newPage();
  try {
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    // ── 광고 팝업 닫기 ─────────────────────────────────────────────────
    await page.locator('#lafc-popup button').click().catch(() => null);
    await page.waitForTimeout(1000);

    // 받는 금액 박스 (보내는/받는 순서로 currencyToMoneyBox 가 렌더됨 → 받는 = nth(1))
    const recvBox = page.locator('[data-title="currencyToMoneyBox"]').nth(1);

    // ── 수신 통화 선택 팝업 열기 (박스 안의 통화 셀렉터 클릭) ───────────
    await recvBox.locator('div.cursor-pointer').first().click({ timeout: 10000 });
    await page.waitForTimeout(1200);

    // ── 한글 국가명으로 검색 → 옵션 클릭 ────────────────────────────────
    const search = page.locator('input[placeholder="받는 국가를 선택해주세요."]');
    await search.fill(koreanName);
    await page.waitForTimeout(1200);
    await page.locator(`button:has-text("${koreanName}")`).first().click({ timeout: 10000 });
    await page.waitForTimeout(2500);

    // 입력 전 총 입금액(KRW) 기준값 — 수령액 입력 후 이 값에서 바뀌면 재계산 완료
    const baseline = extractNumber(await readLabel(page, '총 입금액'));

    // ── 수령액 입력: 금액 버튼 클릭 → input 활성화 후 입력 ──────────────
    await recvBox.locator('button').first().click({ timeout: 10000 });
    await page.waitForTimeout(500);
    const recvInput = recvBox.locator('input');
    await recvInput.first().click({ clickCount: 3 });
    await recvInput.first().fill(String(amount));
    await recvInput.first().press('Enter');

    // ── 총 입금액(KRW) 재계산 대기 (polling) ────────────────────────────
    let total = null;
    for (let attempt = 0; attempt < 12; attempt++) {
      await page.waitForTimeout(1000);
      const t = extractNumber(await readLabel(page, '총 입금액'));
      if (t && t !== baseline && t !== 1_000_000) { total = t; break; }
    }
    if (!total) throw new Error('총 송금액 계산 대기 초과 (기본값 반환됨)');

    // ── 수수료 추출 (0원이 유효하므로 extractNumber null → 0 처리) ───────
    const fee = extractNumber(await readLabel(page, '수수료')) ?? 0;

    const record = {
      operator: OPERATOR,
      receiving_country: country,
      receive_amount: amount,
      send_amount_krw: total - fee,
      service_fee: fee,
      total_sending_amount: total,
    };
    if (deliveryMethod) record.delivery_method = deliveryMethod;
    return record;
  } finally {
    await page.close();
    await context.close();
  }
}
