import { splitAllExpenses } from './budget';
import { addDays } from './dates';
import type { AppData, LocalDate, Transaction } from './types';

// History 2h: operations grouped by day with «потрачено из лимита · перенос».

export interface HistoryEntry {
  transaction: Transaction;
  fromLimitKopecks: number; // 0 for incomes, adjustments, reserve spending, payments and goal purchases
}

export interface HistoryDay {
  date: LocalDate;
  entries: HistoryEntry[]; // newest first
  spentFromLimitKopecks: number;
  dailyLimitKopecks: number | null; // null when the app recorded no limit that day
  carryKopecks: number | null; // what went to the next day; null for today or without a limit
}

/** Days with operations, newest first. Today's limit comes from the current calculation. */
export function historyDays(data: AppData, today: LocalDate, todayLimitKopecks: number): HistoryDay[] {
  const splits = splitAllExpenses(data);
  const limits = new Map(data.daySummaries.map((s) => [s.date, s.dailyLimitKopecks]));
  limits.set(today, todayLimitKopecks);

  const byDate = new Map<LocalDate, HistoryEntry[]>();
  for (const t of data.transactions) {
    if (t.date > today) continue;
    const fromLimitKopecks = t.type === 'expense' ? (splits.get(t.id)?.fromLimitKopecks ?? t.amountKopecks) : 0;
    const entries = byDate.get(t.date) ?? [];
    entries.push({ transaction: t, fromLimitKopecks });
    byDate.set(t.date, entries);
  }

  return [...byDate.keys()]
    .sort((a, b) => (a < b ? 1 : -1))
    .map((date) => {
      const entries = byDate
        .get(date)!
        .sort((a, b) => (a.transaction.createdAt < b.transaction.createdAt ? 1 : a.transaction.createdAt > b.transaction.createdAt ? -1 : 0));
      const spentFromLimitKopecks = entries.reduce((sum, e) => sum + e.fromLimitKopecks, 0);
      const dailyLimitKopecks = limits.get(date) ?? null;
      const carryKopecks = date === today || dailyLimitKopecks === null ? null : dailyLimitKopecks - spentFromLimitKopecks;
      return { date, entries, spentFromLimitKopecks, dailyLimitKopecks, carryKopecks };
    });
}

/** Expenses and incomes of the last `days` days up to today, newest first: the home screen list. */
export function recentOperations(data: AppData, today: LocalDate, days: number): HistoryEntry[] {
  const since = addDays(today, -(days - 1));
  const splits = splitAllExpenses(data);
  return data.transactions
    .filter((t) => t.type !== 'adjustment' && t.date >= since && t.date <= today)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0))
    .map((t) => ({ transaction: t, fromLimitKopecks: t.type === 'expense' ? (splits.get(t.id)?.fromLimitKopecks ?? t.amountKopecks) : 0 }));
}

// Past days for the calendar colours, the week strip and the streak.

export type DayStatus = 'in' | 'over' | 'none';

export interface DayResult {
  date: LocalDate;
  status: DayStatus; // 'in': spent from the limit no more than it; 'over': more; 'none': no limit recorded that day
  dailyLimitKopecks: number | null; // the day's recorded limit (DaySummary)
  spentFromLimitKopecks: number;
}

function spentFromLimitByDay(data: AppData): Map<LocalDate, number> {
  const splits = splitAllExpenses(data);
  const spent = new Map<LocalDate, number>();
  for (const t of data.transactions) {
    if (t.type !== 'expense') continue;
    spent.set(t.date, (spent.get(t.date) ?? 0) + (splits.get(t.id)?.fromLimitKopecks ?? t.amountKopecks));
  }
  return spent;
}

/** Whether each day of [from, to] stayed within its recorded limit. Meant for past days: today is still going. */
export function dayResults(data: AppData, from: LocalDate, to: LocalDate): DayResult[] {
  const limits = new Map(data.daySummaries.map((s) => [s.date, s.dailyLimitKopecks]));
  const spent = spentFromLimitByDay(data);
  const result: DayResult[] = [];
  for (let date = from; date <= to; date = addDays(date, 1)) {
    const dailyLimitKopecks = limits.get(date) ?? null;
    const spentFromLimitKopecks = spent.get(date) ?? 0;
    const status: DayStatus = dailyLimitKopecks === null ? 'none' : spentFromLimitKopecks <= dailyLimitKopecks ? 'in' : 'over';
    result.push({ date, status, dailyLimitKopecks, spentFromLimitKopecks });
  }
  return result;
}

/**
 * «В лимите N дней подряд»: days in a row before today that stayed within the limit.
 * Stops at an overspent day or a day without a recorded limit.
 */
export function limitStreak(data: AppData, today: LocalDate): number {
  const limits = new Map(data.daySummaries.map((s) => [s.date, s.dailyLimitKopecks]));
  const spent = spentFromLimitByDay(data);
  let streak = 0;
  for (let date = addDays(today, -1); ; date = addDays(date, -1)) {
    const limit = limits.get(date);
    if (limit === undefined || (spent.get(date) ?? 0) > limit) return streak;
    streak += 1;
  }
}
