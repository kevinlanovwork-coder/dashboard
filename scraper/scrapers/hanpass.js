/**
 * Hanpass 스크래퍼 — API (Direct fetch)
 * URL: https://app.hanpass.com/app/v1/remittance/get-cost
 */

export const OPERATOR = 'Hanpass';

export async function scrape() {
  const res = await fetch('https://app.hanpass.com/app/v1/remittance/get-cost', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      inputAmount: '13000000',
      inputCurrencyCode: 'IDR',
      fromCurrencyCode: 'KRW',
      toCurrencyCode: 'IDR',
      toCountryCode: 'ID',
      memberSeq: '1',
      lang: 'en',
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (data.resultCode !== '0') throw new Error(`Hanpass API 오류: ${data.resultMessage}`);
  const total = data.depositAmountIncludingFee;
  const fee   = data.transferFee ?? 0;
  if (!total) throw new Error('총 송금액 추출 실패');
  return {
    operator: OPERATOR,
    receiving_country: 'Indonesia',
    receive_amount: 13_000_000,
    send_amount_krw: total - fee,
    service_fee: fee,
    total_sending_amount: total,
  };
}
