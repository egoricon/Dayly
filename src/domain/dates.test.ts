import { describe, expect, it } from 'vitest';
import {
  addDays,
  daysInclusive,
  diffDays,
  getPeriod,
  isRecurring,
  isRegular,
  monthlyOccurrences,
  nextOccurrence,
  scheduleOccurrences,
  toLocalDate,
  weeklyOccurrences,
} from './dates';

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

  it('builds a week-long period around a weekly main income (26.09.2026 is a Saturday)', () => {
    expect(getPeriod('2026-09-26', null, 5)).toEqual({ start: '2026-09-25', end: '2026-10-01' });
    expect(getPeriod('2026-09-26', null, 6)).toEqual({ start: '2026-09-26', end: '2026-10-02' });
    expect(getPeriod('2026-09-26', null, 7)).toEqual({ start: '2026-09-20', end: '2026-09-26' });
  });

  it('lists weekly occurrences', () => {
    expect(weeklyOccurrences(5, '2026-09-26', '2026-10-17')).toEqual(['2026-10-02', '2026-10-09', '2026-10-16']);
    expect(weeklyOccurrences(6, '2026-09-26', '2026-10-03')).toEqual(['2026-09-26', '2026-10-03']);
    expect(weeklyOccurrences(1, '2026-09-26', '2026-09-27')).toEqual([]);
  });

  it('one-off, monthly and weekly schedules (update 1)', () => {
    const once = { dayOfMonth: null, weekday: null, date: '2026-10-13' };
    const monthly = { dayOfMonth: 5, weekday: null, date: null };
    const weekly = { dayOfMonth: null, weekday: 1, date: null };
    const irregular = { dayOfMonth: null, weekday: null, date: null };
    expect(scheduleOccurrences(once, '2026-10-01', '2026-10-31')).toEqual(['2026-10-13']);
    expect(scheduleOccurrences(once, '2026-10-14', '2026-10-31')).toEqual([]);
    expect(scheduleOccurrences(monthly, '2026-10-01', '2026-11-30')).toEqual(['2026-10-05', '2026-11-05']);
    expect(scheduleOccurrences(weekly, '2026-10-01', '2026-10-13')).toEqual(['2026-10-05', '2026-10-12']);
    expect(scheduleOccurrences(irregular, '2026-10-01', '2026-10-31')).toEqual([]);
    expect([once, monthly, weekly, irregular].map(isRegular)).toEqual([true, true, true, false]);
    // Only a repeating main income can define the period.
    expect([once, monthly, weekly, irregular].map(isRecurring)).toEqual([false, true, true, false]);
  });

  it('finds the next occurrence on or after a day', () => {
    expect(nextOccurrence({ dayOfMonth: 31, weekday: null, date: null }, '2026-02-01')).toBe('2026-02-28');
    expect(nextOccurrence({ dayOfMonth: 5, weekday: null, date: null }, '2026-10-05')).toBe('2026-10-05');
    expect(nextOccurrence({ dayOfMonth: null, weekday: 5, date: null }, '2026-09-26')).toBe('2026-10-02');
    expect(nextOccurrence({ dayOfMonth: null, weekday: null, date: '2027-03-01' }, '2026-09-26')).toBe('2027-03-01');
    expect(nextOccurrence({ dayOfMonth: null, weekday: null, date: '2026-09-25' }, '2026-09-26')).toBeNull();
    expect(nextOccurrence({ dayOfMonth: null, weekday: null, date: null }, '2026-09-26')).toBeNull();
  });
});
