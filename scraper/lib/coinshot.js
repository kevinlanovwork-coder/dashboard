/**
 * Coinshot API client — avoids Playwright entirely.
 * Coinshot exposes POST /calculate/sending; we just need the CSRF token and session cookie
 * from the main page, so this is ~1 order of magnitude faster and far more reliable than
 * driving the browser UI.
 */

async function fetchCsrfAndCookies() {
  const res = await fetch('https://coinshot.org/main', {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Coinshot main HTTP ${res.status}`);
  const html = await res.text();
  const m = html.match(/name="_csrf"\s+content="([^"]+)"/);
  if (!m) throw new Error('CSRF 토큰 추출 실패');
  const setCookies = res.headers.getSetCookie?.() ?? [];
  const cookie = setCookies.map(c => c.split(';')[0]).join('; ');
  return { csrf: m[1], cookie };
}

export async function scrapeCoinshot({ country, currency, amount, deliveryMethod }) {
  const { csrf, cookie } = await fetchCsrfAndCookies();
  const body = new URLSearchParams({
    receivingAmount: String(amount),
    sendingCurrency: 'KRW',
    receivingCurrency: currency,
    feeIncluded: '',
  }).toString();
  const res = await fetch('https://coinshot.org/calculate/sending', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-CSRF-TOKEN': csrf,
      'Cookie': cookie,
      'User-Agent': 'Mozilla/5.0',
    },
    body,
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Coinshot calculate HTTP ${res.status}`);
  const data = await res.json();
  const sendAmt = Number(data.fromAmount);
  const fee = Number(data.fromFee ?? 0);
  if (!Number.isFinite(sendAmt) || sendAmt <= 0) {
    throw new Error(`Coinshot API 응답 파싱 실패: ${JSON.stringify(data).slice(0, 200)}`);
  }
  const result = {
    operator: 'Coinshot',
    receiving_country: country,
    receive_amount: amount,
    send_amount_krw: sendAmt,
    service_fee: fee,
    total_sending_amount: sendAmt + fee,
  };
  if (deliveryMethod) result.delivery_method = deliveryMethod;
  return result;
}
