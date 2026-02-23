/**
 * GME (Global Money Express) 스크래퍼 — API (Direct fetch)
 * URL: https://online.gmeremit.com/Default.aspx
 */
import { extractNumber } from '../lib/browser.js';

export const OPERATOR = 'GME';

export async function scrape() {
  const body = new URLSearchParams({
    method: 'GetExRate', pCurr: 'IDR', pCountryName: 'Indonesia',
    collCurr: 'KRW', deliveryMethod: '1', cAmt: '', pAmt: '13000000',
    cardOnline: 'false', calBy: 'P',
  }).toString();
  const res = await fetch('https://online.gmeremit.com/Default.aspx', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body, signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (data.errorCode !== '0') throw new Error(`GME API 오류: ${data.msg}`);
  const total = extractNumber(data.collAmt);
  if (!total) throw new Error('총 송금액 추출 실패');
  return {
    operator: OPERATOR,
    receiving_country: 'Indonesia',
    receive_amount: 13_000_000,
    send_amount_krw: total,
    service_fee: 0,
    total_sending_amount: total,
  };
}
