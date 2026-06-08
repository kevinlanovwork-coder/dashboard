/**
 * JRF (JP Remit) 스크래퍼 — Playwright 브라우저 자동화
 *
 * 2026년 사이트 개편으로 계산기가 iframe(https://rateweb.jpremit.co.kr/)로 이동했다.
 * - 국가/수령방식은 숨겨진 <select>(#country, #payout) 로 제어 — 값 설정 후 change 이벤트
 *   (계산 엔진은 커스텀 UI 라벨이 아니라 숨은 select 값을 직접 읽는다)
 * - 수령액은 #receiverAmount 에 "실제 키 입력"으로 넣어야 재계산이 트리거됨 (fill 만으로는 안 됨)
 * - 송금액은 #senderAmount(수수료 제외 KRW), 수수료는 'Sending Fee : N KRW' 텍스트에서 추출
 *
 * 모든 코리도(corridor)에서 공유. 국가코드/금액 등은 opts로 주입한다.
 */
import { extractNumber } from '../lib/browser.js';

export const OPERATOR = 'JRF';
const RATE_URL = 'https://rateweb.jpremit.co.kr/';

/**
 * @param {import('playwright').Browser} browser
 * @param {object} opts
 * @param {string} opts.countryCode          #country 의 ISO 코드 (예: 'ID', 'TH', 'VN', 'NP', 'PH', 'PK', 'BD', 'LK')
 * @param {string} opts.country              receiving_country (예: 'Indonesia')
 * @param {number} opts.amount               수령 금액 (수신 통화 기준)
 * @param {string} [opts.payout='B']         #payout 값 — 'B'(Bank Account) | 'C'(Cash Pickup) 등
 * @param {number} [opts.fee]                고정 수수료(KRW) 강제. 생략 시 페이지의 'Sending Fee' 사용
 * @param {number} [opts.feeFallback=5000]   페이지 수수료 추출 실패 시 대체 수수료
 * @param {string} [opts.deliveryMethod]     반환 레코드의 delivery_method (예: 'Cash Pickup')
 */
export async function scrape(browser, opts = {}) {
  const {
    countryCode, country, amount,
    payout = 'B', fee = null, feeFallback = 5000,
    deliveryMethod = null,
  } = opts;

  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();
  try {
    await page.goto(RATE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    // 숨은 select 가 옵션과 함께 준비될 때까지 대기 (계산 엔진 초기화 신호)
    await page.waitForSelector('#country', { state: 'attached', timeout: 20000 });
    await page.waitForFunction(
      () => document.querySelector('#country')?.options.length > 0
         && document.querySelector('#senderAmount'),
      { timeout: 20000 },
    );
    await page.waitForTimeout(1500);

    // ── 국가 선택 (숨은 select + change) ────────────────────────────────
    await page.evaluate((c) => {
      const cs = document.querySelector('#country');
      cs.value = c;
      cs.dispatchEvent(new Event('change', { bubbles: true }));
    }, countryCode);
    await page.waitForTimeout(1800); // 국가 변경 시 #payout 옵션이 재구성됨

    // ── 수령방식 선택 (숨은 select + change) ────────────────────────────
    await page.evaluate((p) => {
      const ps = document.querySelector('#payout');
      if (ps) { ps.value = p; ps.dispatchEvent(new Event('change', { bubbles: true })); }
    }, payout);
    await page.waitForTimeout(1000);

    // ── 수령액 입력 — 실제 키 입력으로 재계산 트리거 ────────────────────
    await page.click('#receiverAmount');
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Delete');
    await page.keyboard.type(String(amount), { delay: 30 });

    // ── 송금액(KRW) 재계산 대기 — 기본값(1,000,000)이 아니고 수령액이 우리 값일 때 ──
    let sendAmt = null;
    for (let attempt = 0; attempt < 12; attempt++) {
      await page.waitForTimeout(1000);
      const recv = extractNumber(await page.inputValue('#receiverAmount'));
      sendAmt = extractNumber(await page.inputValue('#senderAmount'));
      if (sendAmt && sendAmt !== 1_000_000 && recv === amount) break;
    }
    if (!sendAmt || sendAmt === 1_000_000) throw new Error('총 송금액 계산 대기 초과 (기본값 반환됨)');

    // ── 수수료: 고정값이 있으면 사용, 없으면 'Sending Fee : N KRW' 추출 ──────
    // extractNumber 는 0을 null 로 반환하므로(수수료 0원이 유효함) 직접 파싱한다.
    let serviceFee;
    if (fee != null) {
      serviceFee = fee;
    } else {
      const body = await page.evaluate(() => document.body.innerText || '');
      const m = body.match(/Sending Fee\s*[:：]\s*([\d,]+)/i);
      const parsed = m ? Number(m[1].replace(/,/g, '')) : NaN;
      serviceFee = Number.isFinite(parsed) ? parsed : feeFallback;
    }

    const record = {
      operator: OPERATOR,
      receiving_country: country,
      receive_amount: amount,
      send_amount_krw: sendAmt,
      service_fee: serviceFee,
      total_sending_amount: sendAmt + serviceFee,
    };
    if (deliveryMethod) record.delivery_method = deliveryMethod;
    return record;
  } finally {
    await page.close();
    await context.close();
  }
}
