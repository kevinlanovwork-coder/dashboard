import { RATES_DATA } from './ratesData';

export interface RateRecord {
  id: number;
  timestamp: string;
  runHour: string;
  operator: string;
  receivingCountry: string;
  receiveAmount: number;
  sendAmountKRW: number;
  receiveMultiplier: number;
  adjustedSendingAmount: number;
  serviceFee: number;
  totalSendingAmount: number;
  gmeBaseline: number | null;
  priceGap: number | null;
  status: string;
}

export function parseRates(): RateRecord[] {
  return RATES_DATA;
}
