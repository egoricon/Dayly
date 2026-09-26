import type { Occurrence } from './budget';
import { addDays, diffDays, isRegular, maxDate, monthlyOccurrences, scheduleOccurrences, type Period } from './dates';
import type { AppData, LocalDate, Transaction } from './types';

// Planned incomes and payments: which occurrences are waiting for a confirmation.

/** How far back the home screen asks «Стипендия пришла?». */
export const CONFIRM_WINDOW_DAYS = 14;
/** How early an income can arrive and still close its planned occurrence. */
const EARLY_ARRIVAL_DAYS = 7;

function key(sourceId: string, date: LocalDate): string {
  return `${sourceId}|${date}`;
}

function confirmedIncomes(data: AppData): Set<string> {
  return new Set(
    data.transactions
      .filter((t) => t.type === 'income' && t.incomeSourceId !== null && t.plannedDate !== null)
      .map((t) => key(t.incomeSourceId!, t.plannedDate!)),
  );
}

function incomeOccurrences(data: AppData, from: LocalDate, to: LocalDate): Occurrence[] {
  const confirmed = confirmedIncomes(data);
  const result: Occurrence[] = [];
  for (const source of data.incomeSources) {
    if (!source.isActive || !isRegular(source)) continue;
    const start = maxDate(from, maxDate(source.startDate, data.settings.trackingStartDate));
    for (const date of scheduleOccurrences(source, start, to)) {
      if (!confirmed.has(key(source.id, date))) {
        result.push({ sourceId: source.id, date, amountKopecks: source.amountKopecks });
      }
    }
  }
  return result.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** Planned incomes whose day has come (today or up to two weeks late) but that are not confirmed. */
export function incomesToConfirm(data: AppData, today: LocalDate): Occurrence[] {
  return incomeOccurrences(data, addDays(today, -(CONFIRM_WINDOW_DAYS - 1)), today);
}

/**
 * The planned occurrence an income from `sourceId` received today closes:
 * the nearest unconfirmed one, late or up to a week early. Null when there is none.
 */
export function occurrenceToClose(data: AppData, sourceId: string, today: LocalDate): LocalDate | null {
  const candidates = incomeOccurrences(
    data,
    addDays(today, -(CONFIRM_WINDOW_DAYS - 1)),
    addDays(today, EARLY_ARRIVAL_DAYS),
  ).filter((o) => o.sourceId === sourceId);
  let best: LocalDate | null = null;
  for (const { date } of candidates) {
    if (best === null || Math.abs(diffDays(today, date)) < Math.abs(diffDays(today, best))) best = date;
  }
  return best;
}

/** The occurrence of a payment in the given period, if it falls into it. */
export function paymentOccurrence(data: AppData, paymentId: string, period: Period): LocalDate | null {
  const payment = data.payments.find((p) => p.id === paymentId);
  if (!payment) return null;
  const from = maxDate(period.start, maxDate(payment.startDate, data.settings.trackingStartDate));
  return monthlyOccurrences(payment.dayOfMonth, from, period.end)[0] ?? null;
}

/** The operation that paid a payment occurrence, if any. */
export function paymentTransaction(data: AppData, paymentId: string, date: LocalDate): Transaction | undefined {
  return data.transactions.find((t) => t.type === 'expense' && t.paymentId === paymentId && t.plannedDate === date);
}
