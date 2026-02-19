/**
 * GMoneyTrans 스크래퍼 — 직접 API 호출 (브라우저 불필요)
 * API: https://mapi.gmoneytrans.net/exratenew1/ajx_calcRate.asp
 * 확인 완료: serviceCharge=2500, sendAmount=1,119,483 (2026-02)
 */

export const OPERATOR = 'GMoneyTrans';

export async function scrape() {
  const url =
    'https://mapi.gmoneytrans.net/exratenew1/ajx_calcRate.asp' +
    '?receive_amount=13000000' +
    '&payout_country=Indonesia' +
    '&total_collected=0' +
    '&payment_type=Bank+Account' +
    '&currencyType=IDR';

  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const text = await res.text();

  const serviceCharge = parseField(text, 'serviceCharge') ?? 2500;
  const sendAmount    = parseField(text, 'sendAmount');

  if (!sendAmount) throw new Error(`파싱 실패: ${text.slice(0, 200)}`);

  return {
    operator: OPERATOR,
    receiving_country: 'Indonesia',
    receive_amount: 13_000_000,
    send_amount_krw: sendAmount,
    service_fee: serviceCharge,
    total_sending_amount: sendAmount + serviceCharge,
  };
}

function parseField(text, field) {
  const m = text.match(new RegExp(`${field}--td_clm--([\\d.]+)--td_end--`));
  return m ? parseFloat(m[1]) : null;
}
