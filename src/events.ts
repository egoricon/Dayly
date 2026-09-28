import { INCOME_KIND_NAMES, newId, removeIncomeSource, removePayment, saveIncomeSource, savePayment } from './appData';
import { weekdayIndex, type Schedule } from './domain/dates';
import type { AppData, IncomeSource, LocalDate, MandatoryPayment } from './domain/types';

// Planned incomes and payments as calendar events: one form for both, with «Повтор» as in a phone calendar.
// An income is an IncomeSource, a «расход» is a MandatoryPayment; a one-off one has `date`.

export type EventKind = 'income' | 'payment';
export type Repeat = 'once' | 'monthly' | 'weekly';

export interface EventDraft {
  kind: EventKind;
  /** Stipend, salary…: only for incomes. */
  incomeKind: IncomeSource['kind'];
  name: string;
  amountKopecks: number;
  /** The day of the occurrence the person tapped; a repeat goes on from it. */
  date: LocalDate;
  repeat: Repeat;
}

/** An existing event: the income source or the payment behind a calendar row. */
export interface EventRef {
  kind: EventKind;
  id: string;
}

function scheduleOf(repeat: Repeat, date: LocalDate): Schedule {
  switch (repeat) {
    case 'once':
      return { dayOfMonth: null, weekday: null, date };
    case 'monthly':
      return { dayOfMonth: Number(date.slice(8, 10)), weekday: null, date: null };
    case 'weekly':
      return { dayOfMonth: null, weekday: weekdayIndex(date) + 1, date: null };
  }
}

function repeatOf(schedule: Schedule): Repeat {
  if (schedule.weekday !== null) return 'weekly';
  if (schedule.dayOfMonth !== null) return 'monthly';
  return 'once';
}

/**
 * Adds an event, or changes the existing one `id`: a change applies to every repeat, and past
 * confirmed ones stay as they were (they are operations of their own). A new event is not
 * expected before its day. A new repeating income becomes the main one when there is none yet,
 * as in «Финансы → Добавить доход».
 */
export function saveEvent(data: AppData, draft: EventDraft, id: string | null): AppData {
  const schedule = scheduleOf(draft.repeat, draft.date);
  if (draft.kind === 'income') {
    const existing = data.incomeSources.find((s) => s.id === id);
    const source: IncomeSource = {
      id: existing?.id ?? newId(),
      kind: draft.incomeKind,
      name: draft.name,
      amountKopecks: draft.amountKopecks,
      ...schedule,
      startDate: existing?.startDate ?? draft.date,
      isActive: true,
    };
    const main = data.settings.mainIncomeSourceId;
    return saveIncomeSource(data, source, existing ? main === existing.id : main === null);
  }
  const existing = data.payments.find((p) => p.id === id);
  const payment: MandatoryPayment = {
    id: existing?.id ?? newId(),
    name: draft.name,
    amountKopecks: draft.amountKopecks,
    ...schedule,
    startDate: existing?.startDate ?? draft.date,
    isActive: true,
  };
  return savePayment(data, payment);
}

/** Deleting stops the event and all its repeats; past operations keep its name. */
export function removeEvent(data: AppData, ref: EventRef): AppData {
  return ref.kind === 'income' ? removeIncomeSource(data, ref.id) : removePayment(data, ref.id);
}

/** The form's contents for an existing event, opened on its occurrence `date`. Null when it is gone. */
export function eventDraftOf(data: AppData, ref: EventRef, date: LocalDate): EventDraft | null {
  if (ref.kind === 'income') {
    const source = data.incomeSources.find((s) => s.id === ref.id);
    if (!source) return null;
    return {
      kind: 'income',
      incomeKind: source.kind,
      name: source.name,
      amountKopecks: source.amountKopecks,
      date: source.date ?? date,
      repeat: repeatOf(source),
    };
  }
  const payment = data.payments.find((p) => p.id === ref.id);
  if (!payment) return null;
  return {
    kind: 'payment',
    incomeKind: 'other',
    name: payment.name,
    amountKopecks: payment.amountKopecks,
    date: payment.date ?? date,
    repeat: repeatOf(payment),
  };
}

/** Default name of an income of this kind: «Стипендия», «Зарплата»… */
export function incomeKindName(kind: IncomeSource['kind']): string {
  return INCOME_KIND_NAMES[kind];
}
