import fs from 'fs';
import path from 'path';

export interface RateRecord {
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

function parseNumber(str: string): number | null {
  if (!str || str.trim() === '') return null;
  const cleaned = str.replace(/[",]/g, '').trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (const char of line) {
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

export function parseRates(): RateRecord[] {
  const filePath = path.join(process.cwd(), 'data', 'rates.csv');
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').filter(line => line.trim());

  const records: RateRecord[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);
    if (cols.length < 12) continue;

    records.push({
      timestamp: cols[0].trim(),
      runHour: cols[1].trim(),
      operator: cols[2].trim(),
      receivingCountry: cols[3].trim(),
      receiveAmount: parseNumber(cols[4]) ?? 0,
      sendAmountKRW: parseNumber(cols[5]) ?? 0,
      receiveMultiplier: parseNumber(cols[6]) ?? 1,
      adjustedSendingAmount: parseNumber(cols[7]) ?? 0,
      serviceFee: parseNumber(cols[8]) ?? 0,
      totalSendingAmount: parseNumber(cols[9]) ?? 0,
      gmeBaseline: parseNumber(cols[10]),
      priceGap: parseNumber(cols[11]),
      status: cols[12]?.trim() ?? '',
    });
  }
  return records;
}
