/**
 * 텍스트에서 숫자만 추출 (콤마·원·KRW·IDR 제거)
 * "1,134,453원" → 1134453
 */
export function extractNumber(text) {
  if (!text) return null;
  const cleaned = text.replace(/[^0-9.]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) || num === 0 ? null : num;
}

/**
 * 현재 시각을 KST (UTC+9) 기준 "YYYY-MM-DD HH:MM" 형식으로 반환
 * 30분 단위로 반올림: :00~:29 → :00, :30~:59 → :30
 * GitHub Actions(UTC)와 로컬(KST) 모두 동일한 값을 반환
 */
export function getRunHour() {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const yyyy = kst.getUTCFullYear();
  const mm = String(kst.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(kst.getUTCDate()).padStart(2, '0');
  const hh = String(kst.getUTCHours()).padStart(2, '0');
  const min = kst.getUTCMinutes() < 30 ? '00' : '30';
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
}

/**
 * 실패 시 최대 retries번 재시도 (지수 백오프)
 */
export async function withRetry(fn, retries = 2, delayMs = 3000) {
  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt > retries) throw err;
      console.warn(`  재시도 ${attempt}/${retries} — ${err.message?.slice(0, 80)}`);
      await new Promise(r => setTimeout(r, delayMs * attempt));
    }
  }
}

/**
 * Playwright 페이지에서 여러 셀렉터 중 하나를 시도
 */
export async function trySelectors(page, selectors, timeout = 5000) {
  for (const selector of selectors) {
    try {
      await page.waitForSelector(selector, { timeout });
      return selector;
    } catch {
      // 다음 셀렉터 시도
    }
  }
  return null;
}

/**
 * Playwright 페이지에서 여러 셀렉터 중 텍스트를 추출
 */
export async function getTextFromSelectors(page, selectors) {
  for (const selector of selectors) {
    try {
      const el = await page.$(selector);
      if (el) {
        const text = await el.textContent();
        const num = extractNumber(text);
        if (num && num > 100000) return num; // 최소 100,000 KRW 이상이어야 유효
      }
    } catch {
      // 다음 셀렉터 시도
    }
  }
  return null;
}
