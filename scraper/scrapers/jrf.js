/**
 * JRF (JP Remit) 스크래퍼 — Playwright 브라우저 자동화
 * URL: https://www.jpremit.co.kr/
 *
 * 모든 코리도(corridor)에서 공유. 통화/국가/금액/수수료는 opts로 주입한다.
 */
import { extractNumber } from '../lib/browser.js';

export const OPERATOR = 'JRF';

/**
 * @param {import('playwright').Browser} browser
 * @param {object} opts
 * @param {string} opts.currency             수신 통화 코드 — jpremit의 `li#<currency>` 와 일치 (예: 'IDR')
 * @param {string} opts.country              receiving_country (예: 'Indonesia')
 * @param {number} opts.amount               수령 금액 (수신 통화 기준)
 * @param {number} [opts.fee]                고정 수수료(KRW). 생략 시 #servicefee 에서 추출
 * @param {number} [opts.feeFallback=5000]   #servicefee 추출 실패 시 대체 수수료
 * @param {string} [opts.payCategory]        설정 시 #banner_form_ddl_category 에서 선택 (예: 'Cash Pay')
 * @param {string} [opts.deliveryMethod]     반환 레코드의 delivery_method (예: 'Cash Pickup')
 */
export async function scrape(browser, opts = {}) {
  const {
    currency, country, amount,
    fee = null, feeFallback = 5000,
    payCategory = null, deliveryMethod = null,
  } = opts;

  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();
  try {
    await page.goto('https://www.jpremit.co.kr/', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await page.waitForTimeout(3000);

    // ── 수신 통화 선택 ──────────────────────────────────────────────────
    // 드롭다운은 body의 click 핸들러가 e.target.class === 'select_co'일 때만 열림.
    // #div_curr 클릭은 자식 요소에 따라 동작이 갈리므로, jQuery로 직접 표시.
    await page.evaluate(() => window.jQuery('#co-list').show());
    await page.waitForSelector(`li#${currency}`, { state: 'visible', timeout: 10000 });
    await page.click(`li#${currency}`);
    await page.waitForTimeout(1500);

    // ── 수령 방식 선택 (예: Cash Pay) ───────────────────────────────────
    if (payCategory) {
      await page.evaluate((cat) => {
        const sel = document.querySelector('#banner_form_ddl_category');
        sel.value = cat;
        sel.dispatchEvent(new Event('change', { bubbles: true }));
      }, payCategory);
      await page.waitForTimeout(2000);
    }

    // ── 수령액 입력 ─────────────────────────────────────────────────────
    await page.click('#rec_money', { clickCount: 3 });
    await page.fill('#rec_money', String(amount));
    await page.dispatchEvent('#rec_money', 'keyup');

    // ── 총 송금액(KRW) 추출 — 기본값(1,000,000)이 아닌 계산값이 나올 때까지 대기 ──
    let sendAmt = null;
    for (let attempt = 0; attempt < 10; attempt++) {
      await page.waitForTimeout(1000);
      const raw = await page.inputValue('#send_money');
      sendAmt = extractNumber(raw);
      if (sendAmt && sendAmt !== 1_000_000) break;
    }
    if (!sendAmt || sendAmt === 1_000_000) throw new Error('총 송금액 계산 대기 초과 (기본값 반환됨)');

    // ── 수수료: 고정값이 있으면 사용, 없으면 #servicefee 에서 추출 ──────────
    const serviceFee = fee != null
      ? fee
      : (extractNumber(await page.textContent('#servicefee').catch(() => null)) ?? feeFallback);

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
