import type { Occurrence } from './budget';
import { addDays, diffDays, isRegular, maxDate, scheduleOccurrences, type Period } from './dates';
import type { AppData, IncomeSource, LocalDate, MandatoryPayment, Transaction } from './types';

// Planned incomes and payments: which occurrences are waiting for a confirmation, and what is coming.

/** How far back the home screen asks «Стипендия пришла?». */
export const CONFIRM_WINDOW_DAYS = 14;
/** How far ahead «Ближайшее» looks for planned events. */
const UPCOMING_HORIZON_DAYS = 366;
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

/** Every occurrence of a payment in the period: one for a monthly payment, several for a weekly one. */
export function paymentOccurrences(data: AppData, paymentId: string, period: Period): LocalDate[] {
  const payment = data.payments.find((p) => p.id === paymentId);
  if (!payment) return [];
  const from = maxDate(period.start, maxDate(payment.startDate, data.settings.trackingStartDate));
  return scheduleOccurrences(payment, from, period.end);
}

/**
 * The occurrence of a payment in the period to show and mark paid: the first unpaid one,
 * or the last one when all are paid. Null when the payment does not fall into the period.
 */
export function paymentOccurrence(data: AppData, paymentId: string, period: Period): LocalDate | null {
  const dates = paymentOccurrences(data, paymentId, period);
  return dates.find((date) => paymentTransaction(data, paymentId, date) === undefined) ?? dates[dates.length - 1] ?? null;
}

/** The operation that paid a payment occurrence, if any. */
export function paymentTransaction(data: AppData, paymentId: string, date: LocalDate): Transaction | undefined {
  return data.transactions.find((t) => t.type === 'expense' && t.paymentId === paymentId && t.plannedDate === date);
}

/** A planned income or payment on its day, for the calendar and «Ближайшее». */
export interface PlannedEvent {
  kind: 'income' | 'payment';
  sourceId: string; // the income source or the payment
  date: LocalDate;
  amountKopecks: number; // planned; for a done event, what actually came or was paid
  done: boolean; // the income is confirmed or the payment is paid
}

/**
 * Occurrences of active incomes and payments within [from, to], sorted by date (incomes first on a day).
 * Occurrences before the source's or payment's `startDate` and before the start of tracking are not planned.
 */
export function plannedEvents(data: AppData, from: LocalDate, to: LocalDate): PlannedEvent[] {
  const closing = new Map<string, Transaction>();
  for (const t of data.transactions) {
    if (t.plannedDate === null) continue;
    if (t.type === 'income' && t.incomeSourceId !== null) closing.set(`income|${key(t.incomeSourceId, t.plannedDate)}`, t);
    if (t.type === 'expense' && t.paymentId !== null) closing.set(`payment|${key(t.paymentId, t.plannedDate)}`, t);
  }
  const events: PlannedEvent[] = [];
  const add = (kind: PlannedEvent['kind'], item: IncomeSource | MandatoryPayment) => {
    if (!item.isActive) return;
    const start = maxDate(from, maxDate(item.startDate, data.settings.trackingStartDate));
    for (const date of scheduleOccurrences(item, start, to)) {
      const t = closing.get(`${kind}|${key(item.id, date)}`);
      events.push({ kind, sourceId: item.id, date, amountKopecks: t ? t.amountKopecks : item.amountKopecks, done: t !== undefined });
    }
  };
  for (const source of data.incomeSources) add('income', source);
  for (const payment of data.payments) add('payment', payment);
  // Stable sort: on the same day incomes stay before payments, each in the order of the data.
  return events.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** «Ближайшее»: the next `count` planned events from today on that are not confirmed or paid yet. */
export function upcomingEvents(data: AppData, today: LocalDate, count: number): PlannedEvent[] {
  return plannedEvents(data, today, addDays(today, UPCOMING_HORIZON_DAYS))
    .filter((e) => !e.done)
    .slice(0, count);
}
