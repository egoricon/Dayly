import type { LocalDate } from './types';

// LocalDate arithmetic via UTC day numbers, so DST and time zones never shift a day.

const MS_PER_DAY = 86_400_000;

function parts(date: LocalDate): [number, number, number] {
  const [y, m, d] = date.split('-').map(Number);
  return [y!, m!, d!];
}

function toDayNumber(date: LocalDate): number {
  const [y, m, d] = parts(date);
  return Date.UTC(y, m - 1, d) / MS_PER_DAY;
}

function fromDayNumber(day: number): LocalDate {
  return new Date(day * MS_PER_DAY).toISOString().slice(0, 10);
}

export function makeDate(year: number, month: number, day: number): LocalDate {
  return fromDayNumber(Date.UTC(year, month - 1, day) / MS_PER_DAY);
}

/** Local calendar day of a Date on this device. */
export function toLocalDate(date: Date): LocalDate {
  return makeDate(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

export function addDays(date: LocalDate, days: number): LocalDate {
  return fromDayNumber(toDayNumber(date) + days);
}

/** b − a in days. */
export function diffDays(a: LocalDate, b: LocalDate): number {
  return toDayNumber(b) - toDayNumber(a);
}

/** Days from a to b, both inclusive. */
export function daysInclusive(a: LocalDate, b: LocalDate): number {
  return diffDays(a, b) + 1;
}

export function maxDate(a: LocalDate, b: LocalDate): LocalDate {
  return a > b ? a : b;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** The occurrence of a monthly day in the given month; 29–31 fall back to the last day. */
export function monthlyOccurrence(year: number, month: number, dayOfMonth: number): LocalDate {
  return makeDate(year, month, Math.min(dayOfMonth, daysInMonth(year, month)));
}

function shiftMonth(year: number, month: number, delta: number): [number, number] {
  const index = year * 12 + (month - 1) + delta;
  return [Math.floor(index / 12), (index % 12) + 1];
}

export interface Period {
  start: LocalDate;
  end: LocalDate; // inclusive
}

/**
 * Period containing `today`: from the main income day to the day before the next one.
 * Without a main income day it is the calendar month.
 */
export function getPeriod(today: LocalDate, dayOfMonth: number | null): Period {
  const [y, m] = parts(today);
  if (dayOfMonth === null) {
    return { start: makeDate(y, m, 1), end: makeDate(y, m, daysInMonth(y, m)) };
  }
  let [sy, sm] = [y, m];
  if (monthlyOccurrence(y, m, dayOfMonth) > today) [sy, sm] = shiftMonth(y, m, -1);
  const [ny, nm] = shiftMonth(sy, sm, 1);
  return {
    start: monthlyOccurrence(sy, sm, dayOfMonth),
    end: addDays(monthlyOccurrence(ny, nm, dayOfMonth), -1),
  };
}

/** All occurrences of a monthly day within [from, to], inclusive. */
export function monthlyOccurrences(dayOfMonth: number, from: LocalDate, to: LocalDate): LocalDate[] {
  const result: LocalDate[] = [];
  if (from > to) return result;
  let [y, m] = parts(from);
  const [ty, tm] = parts(to);
  while (y * 12 + m <= ty * 12 + tm) {
    const date = monthlyOccurrence(y, m, dayOfMonth);
    if (date >= from && date <= to) result.push(date);
    [y, m] = shiftMonth(y, m, 1);
  }
  return result;
}

/** The same day `months` months later; 29–31 fall back to the last day of that month. */
export function addMonths(date: LocalDate, months: number): LocalDate {
  const [y, m, d] = parts(date);
  const [ny, nm] = shiftMonth(y, m, months);
  return monthlyOccurrence(ny, nm, d);
}

/** Monday-first weekday index: 0 = Monday … 6 = Sunday. */
export function weekdayIndex(date: LocalDate): number {
  return (new Date(toDayNumber(date) * MS_PER_DAY).getUTCDay() + 6) % 7;
}
