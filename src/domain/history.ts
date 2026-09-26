import { splitAllExpenses } from './budget';
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
