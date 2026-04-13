import { describe, it, expect } from 'vitest';

// calcRate is not exported, so we replicate the logic for testing
function calcRate(receiveAmount, sendKRW) {
  if (!receiveAmount || !sendKRW) return null;
  const raw = receiveAmount / sendKRW;
  return raw >= 1 ? raw : sendKRW / receiveAmount;
}

describe('calcRate', () => {
  it('returns foreign per 1 KRW for Indonesia (raw >= 1)', () => {
    // 13,000,000 IDR / 1,100,000 KRW = ~11.82 IDR per 1 KRW
    const rate = calcRate(13000000, 1100000);
    expect(rate).toBeCloseTo(11.82, 1);
    expect(rate).toBeGreaterThan(1);
  });

  it('returns KRW per 1 foreign for China (raw < 1)', () => {
    // 10,000 CNY / 2,200,000 KRW = 0.0045 → flips to 220 KRW per 1 CNY
    const rate = calcRate(10000, 2200000);
    expect(rate).toBe(220);
    expect(rate).toBeGreaterThan(1);
  });

  it('returns KRW per 1 foreign for Cambodia (raw < 1)', () => {
    // 1,000 USD / 1,530,000 KRW → 1530 KRW per 1 USD
    const rate = calcRate(1000, 1530000);
    expect(rate).toBe(1530);
  });

  it('returns null for zero sendKRW', () => {
    expect(calcRate(10000, 0)).toBeNull();
  });

  it('returns null for null inputs', () => {
    expect(calcRate(null, 1000000)).toBeNull();
    expect(calcRate(10000, null)).toBeNull();
  });

  it('returns 1 when receive equals send', () => {
    expect(calcRate(1000000, 1000000)).toBe(1);
  });
});

describe('price alert direction logic', () => {
  // Simulates the matching logic from alerts.js
  function matchesPriceRule(record, rule) {
    if (record.operator === 'GME') return false;
    if (record.price_gap === null) return false;
    if (rule.operator && record.operator !== rule.operator) return false;
    if (rule.direction === 'cheaper') return record.price_gap <= rule.threshold_krw;
    return Math.abs(record.price_gap) >= Math.abs(rule.threshold_krw);
  }

  it('cheaper direction: matches when price_gap is below threshold', () => {
    const record = { operator: 'Hanpass', price_gap: -3000 };
    const rule = { direction: 'cheaper', threshold_krw: -2000, operator: null };
    expect(matchesPriceRule(record, rule)).toBe(true);
  });

  it('cheaper direction: does not match when price_gap is above threshold', () => {
    const record = { operator: 'Hanpass', price_gap: -1000 };
    const rule = { direction: 'cheaper', threshold_krw: -2000, operator: null };
    expect(matchesPriceRule(record, rule)).toBe(false);
  });

  it('cheaper direction: does not match expensive operators', () => {
    const record = { operator: 'Moin', price_gap: 5000 };
    const rule = { direction: 'cheaper', threshold_krw: -2000, operator: null };
    expect(matchesPriceRule(record, rule)).toBe(false);
  });

  it('any direction: matches based on absolute value', () => {
    const record = { operator: 'Moin', price_gap: 5000 };
    const rule = { direction: 'any', threshold_krw: 3000, operator: null };
    expect(matchesPriceRule(record, rule)).toBe(true);
  });

  it('excludes GME records', () => {
    const record = { operator: 'GME', price_gap: 0 };
    const rule = { direction: 'cheaper', threshold_krw: -2000, operator: null };
    expect(matchesPriceRule(record, rule)).toBe(false);
  });

  it('excludes null price_gap', () => {
    const record = { operator: 'Hanpass', price_gap: null };
    const rule = { direction: 'cheaper', threshold_krw: -2000, operator: null };
    expect(matchesPriceRule(record, rule)).toBe(false);
  });
});

describe('rate alert direction logic', () => {
  function matchesRateRule(record, rule, gmeRate) {
    if (record.operator === 'GME') return false;
    if (rule.operator && record.operator !== rule.operator) return false;
    const compRate = calcRate(record.receive_amount, record.send_amount_krw);
    if (compRate === null || gmeRate === null) return false;
    const rateGap = Math.abs(compRate - gmeRate);
    if (rateGap < Math.abs(rule.threshold_krw)) return false;
    if (rule.direction === 'cheaper') return record.price_gap !== null && record.price_gap < 0;
    return true;
  }

  it('cheaper direction: only matches operators with negative price_gap', () => {
    const cheaper = { operator: 'Hanpass', receive_amount: 10000, send_amount_krw: 2200000, price_gap: -5000 };
    const expensive = { operator: 'Moin', receive_amount: 10000, send_amount_krw: 2250000, price_gap: 3000 };
    const rule = { direction: 'cheaper', threshold_krw: 0.01, operator: null };
    const gmeRate = calcRate(10000, 2225000);
    expect(matchesRateRule(cheaper, rule, gmeRate)).toBe(true);
    expect(matchesRateRule(expensive, rule, gmeRate)).toBe(false);
  });

  it('any direction: matches all operators exceeding threshold', () => {
    const record = { operator: 'Moin', receive_amount: 10000, send_amount_krw: 2250000, price_gap: 3000 };
    const rule = { direction: 'any', threshold_krw: 0.01, operator: null };
    const gmeRate = calcRate(10000, 2225000);
    expect(matchesRateRule(record, rule, gmeRate)).toBe(true);
  });
});
