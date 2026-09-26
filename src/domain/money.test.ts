import { describe, expect, it } from 'vitest';
import { formatKopecks, formatMoney, parseAmount } from './money';

describe('formatMoney', () => {
  it('formats kopecks as «27,50 BYN»', () => {
    expect(formatMoney(2750)).toBe('27,50 BYN');
    expect(formatMoney(0)).toBe('0,00 BYN');
    expect(formatMoney(5)).toBe('0,05 BYN');
  });

  it('separates thousands with U+202F and uses U+2212 for minus', () => {
    expect(formatKopecks(102000)).toBe('1 020,00');
    expect(formatKopecks(123456789)).toBe('1 234 567,89');
    expect(formatKopecks(-1996)).toBe('−19,96');
  });
});

describe('parseAmount', () => {
  it('parses comma, dot and spaces into kopecks', () => {
    expect(parseAmount('3,5')).toBe(350);
    expect(parseAmount('12.40')).toBe(1240);
    expect(parseAmount('1 020')).toBe(102000);
    expect(parseAmount('0,05')).toBe(5);
    expect(parseAmount('7,')).toBe(700);
  });

  it('rejects invalid input', () => {
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('1,234')).toBeNull();
    expect(parseAmount('-5')).toBeNull();
    expect(parseAmount('abc')).toBeNull();
  });
});
