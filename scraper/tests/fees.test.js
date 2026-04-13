import { describe, it, expect, vi } from 'vitest';

// Mock supabase.js to avoid requiring env vars
vi.mock('../lib/supabase.js', () => ({ default: {} }));

const { applyFeeOverrides } = await import('../lib/fees.js');

describe('applyFeeOverrides', () => {
  it('overrides fee when DB fee differs from scraped fee', () => {
    const records = [
      { operator: 'E9Pay', delivery_method: 'Bank Deposit', send_amount_krw: 1100000, service_fee: 0, total_sending_amount: 1100000 },
    ];
    const feeMap = new Map([['E9Pay||Bank Deposit', 5000]]);
    const result = applyFeeOverrides(records, feeMap);
    expect(result[0].service_fee).toBe(5000);
    expect(result[0].total_sending_amount).toBe(1105000);
  });

  it('does not override when fees match', () => {
    const records = [
      { operator: 'GME', delivery_method: 'Bank Deposit', send_amount_krw: 1100000, service_fee: 0, total_sending_amount: 1100000 },
    ];
    const feeMap = new Map([['GME||Bank Deposit', 0]]);
    const result = applyFeeOverrides(records, feeMap);
    expect(result[0].service_fee).toBe(0);
    expect(result[0].total_sending_amount).toBe(1100000);
  });

  it('passes through when no override exists', () => {
    const records = [
      { operator: 'NewOp', delivery_method: 'Bank Deposit', send_amount_krw: 500000, service_fee: 3000, total_sending_amount: 503000 },
    ];
    const feeMap = new Map();
    const result = applyFeeOverrides(records, feeMap);
    expect(result[0].service_fee).toBe(3000);
    expect(result[0].total_sending_amount).toBe(503000);
  });

  it('handles null delivery_method by defaulting to Bank Deposit', () => {
    const records = [
      { operator: 'Hanpass', delivery_method: null, send_amount_krw: 1000000, service_fee: 0, total_sending_amount: 1000000 },
    ];
    const feeMap = new Map([['Hanpass||Bank Deposit', 5000]]);
    const result = applyFeeOverrides(records, feeMap);
    expect(result[0].service_fee).toBe(5000);
    expect(result[0].total_sending_amount).toBe(1005000);
  });
});
