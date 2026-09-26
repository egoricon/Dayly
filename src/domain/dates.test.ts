import { describe, expect, it } from 'vitest';
import { addDays, daysInclusive, diffDays, getPeriod, monthlyOccurrences, toLocalDate } from './dates';

describe('dates', () => {
  it('adds and diffs days across months and years', () => {
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29');
    expect(diffDays('2026-09-26', '2026-10-05')).toBe(9);
    expect(daysInclusive('2026-09-26', '2026-11-20')).toBe(56);
  });

  it('takes the local calendar day of a Date', () => {
    expect(toLocalDate(new Date(2026, 8, 26, 23, 59))).toBe('2026-09-26');
  });

  it('builds the period around the main income day', () => {
    expect(getPeriod('2026-09-26', 5)).toEqual({ start: '2026-09-05', end: '2026-10-04' });
    expect(getPeriod('2026-10-05', 5)).toEqual({ start: '2026-10-05', end: '2026-11-04' });
    expect(getPeriod('2026-01-03', 5)).toEqual({ start: '2025-12-05', end: '2026-01-04' });
    expect(getPeriod('2026-09-26', null)).toEqual({ start: '2026-09-01', end: '2026-09-30' });
    expect(getPeriod('2028-02-10', null)).toEqual({ start: '2028-02-01', end: '2028-02-29' });
  });

  it('lists monthly occurrences with day 31 clamped', () => {
    expect(monthlyOccurrences(31, '2026-01-15', '2026-04-30')).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
    ]);
    expect(monthlyOccurrences(5, '2026-10-06', '2026-10-04')).toEqual([]);
  });
});
