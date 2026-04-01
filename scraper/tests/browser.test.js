import { describe, it, expect } from 'vitest';
import { extractNumber, getRunHour } from '../lib/browser.js';

describe('extractNumber', () => {
  it('extracts plain number', () => {
    expect(extractNumber('1134453')).toBe(1134453);
  });

  it('extracts number with commas', () => {
    expect(extractNumber('1,134,453')).toBe(1134453);
  });

  it('extracts number with currency suffix', () => {
    expect(extractNumber('1,134,453원')).toBe(1134453);
  });

  it('extracts number with KRW suffix', () => {
    expect(extractNumber('1,134,453 KRW')).toBe(1134453);
  });

  it('extracts decimal number', () => {
    expect(extractNumber('185.23')).toBe(185.23);
  });

  it('returns null for null input', () => {
    expect(extractNumber(null)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(extractNumber('')).toBeNull();
  });

  it('returns null for non-numeric text', () => {
    expect(extractNumber('abc')).toBeNull();
  });

  it('returns null for zero', () => {
    expect(extractNumber('0')).toBeNull();
  });
});

describe('getRunHour', () => {
  it('returns YYYY-MM-DD HH:MM format', () => {
    const result = getRunHour();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
  });

  it('minutes are either 00 or 30', () => {
    const result = getRunHour();
    const minutes = result.slice(-2);
    expect(['00', '30']).toContain(minutes);
  });
});
