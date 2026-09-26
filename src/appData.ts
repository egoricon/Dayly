import { cushionSavedBy } from './domain/budget';
import { addDays } from './domain/dates';
import type {
  AppData,
  Category,
  Goal,
  IncomeSource,
  LocalDate,
  MandatoryPayment,
  ReserveCategory,
  Transaction,
} from './domain/types';

// Pure updates of AppData made by the app layer. Each returns a new object.

export function newId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  // randomUUID needs a secure context; a phone opening the dev server over plain http has none.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function blankTransaction(fields: Pick<Transaction, 'type' | 'amountKopecks' | 'date' | 'createdAt'>): Transaction {
  return {
    id: newId(),
    category: null,
    incomeSourceId: null,
    paymentId: null,
    goalId: null,
    plannedDate: null,
    note: null,
    ...fields,
  };
}

function withTransaction(data: AppData, transaction: Transaction): AppData {
  return { ...data, transactions: [...data.transactions, transaction] };
}

function upsert<T extends { id: string }>(items: T[], item: T): T[] {
  return items.some((i) => i.id === item.id) ? items.map((i) => (i.id === item.id ? item : i)) : [...items, item];
}

export const INCOME_KIND_NAMES: Record<IncomeSource['kind'], string> = {
  scholarship: 'Стипендия',
  salary: 'Зарплата',
  parents: 'От родителей',
  other: 'Другое',
};

function dayOf(date: LocalDate): number {
  return Number(date.slice(8, 10));
}

export interface OnboardingResult {
  balanceKopecks: number;
  income: { kind: IncomeSource['kind']; amountKopecks: number; date: LocalDate } | null;
  payments: { name: string; amountKopecks: number; date: LocalDate }[];
}

/**
 * Data after onboarding. The balance becomes a starting adjustment. The next income becomes
 * the main one: its day of month defines the period, and it is not expected before `date`.
 * Payments are monthly on the day of their date.
 */
export function createInitialData(today: LocalDate, result: OnboardingResult, now: Date): AppData {
  const transactions: Transaction[] = [];
  if (result.balanceKopecks !== 0) {
    transactions.push({
      ...blankTransaction({ type: 'adjustment', amountKopecks: result.balanceKopecks, date: today, createdAt: now.toISOString() }),
      note: 'Стартовый баланс',
    });
  }
  const income: IncomeSource | null = result.income && {
    id: newId(),
    kind: result.income.kind,
    name: INCOME_KIND_NAMES[result.income.kind],
    amountKopecks: result.income.amountKopecks,
    dayOfMonth: dayOf(result.income.date),
    startDate: result.income.date,
    isActive: true,
  };
  return {
    schemaVersion: 1,
    settings: {
      onboardingCompleted: true,
      trackingStartDate: today,
      mainIncomeSourceId: income?.id ?? null,
      reserves: { groceriesKopecks: 0, transportKopecks: 0 },
      cushion: { mode: 'fixed', amountKopecks: 0 },
      theme: 'auto',
      lastCategory: 'cafe',
    },
    incomeSources: income ? [income] : [],
    payments: result.payments.map((p) => ({
      id: newId(),
      name: p.name,
      amountKopecks: p.amountKopecks,
      dayOfMonth: dayOf(p.date),
      startDate: today,
      isActive: true,
    })),
    goals: [],
    transactions,
    daySummaries: [],
  };
}

export function addExpense(data: AppData, amountKopecks: number, category: Category, today: LocalDate, now: Date): AppData {
  const expense = {
    ...blankTransaction({ type: 'expense', amountKopecks, date: today, createdAt: now.toISOString() }),
    category,
  };
  return { ...withTransaction(data, expense), settings: { ...data.settings, lastCategory: category } };
}

/** Income received today. With a source and a planned date it confirms that occurrence. */
export function addIncome(
  data: AppData,
  amountKopecks: number,
  incomeSourceId: string | null,
  plannedDate: LocalDate | null,
  today: LocalDate,
  now: Date,
): AppData {
  return withTransaction(data, {
    ...blankTransaction({ type: 'income', amountKopecks, date: today, createdAt: now.toISOString() }),
    incomeSourceId,
    plannedDate,
  });
}

/** Deleting a goal purchase makes the goal active again: the money is back in the savings. */
export function deleteTransaction(data: AppData, id: string): AppData {
  const removed = data.transactions.find((t) => t.id === id);
  const next = { ...data, transactions: data.transactions.filter((t) => t.id !== id) };
  const goal = removed?.goalId ? next.goals.find((g) => g.id === removed.goalId) : undefined;
  return goal && goal.status === 'done' ? saveGoal(next, { ...goal, status: 'active' }) : next;
}

/** Changes amount and category of an expense; its day and time stay. */
export function updateExpense(data: AppData, id: string, amountKopecks: number, category: Category): AppData {
  return {
    ...data,
    transactions: data.transactions.map((t) => (t.id === id && t.type === 'expense' ? { ...t, amountKopecks, category } : t)),
  };
}

/** «Сверить баланс»: an adjustment that brings the balance to what the student actually has. */
export function reconcileBalance(data: AppData, actualKopecks: number, balanceKopecks: number, today: LocalDate, now: Date): AppData {
  const difference = actualKopecks - balanceKopecks;
  if (difference === 0) return data;
  return withTransaction(data, {
    ...blankTransaction({ type: 'adjustment', amountKopecks: difference, date: today, createdAt: now.toISOString() }),
    note: 'Сверка баланса',
  });
}

/** Keeps the last computed limit of the day; returns the same object when nothing changed. */
export function recordDaySummary(data: AppData, date: LocalDate, dailyLimitKopecks: number): AppData {
  const existing = data.daySummaries.find((s) => s.date === date);
  if (existing?.dailyLimitKopecks === dailyLimitKopecks) return data;
  const others = data.daySummaries.filter((s) => s.date !== date);
  return { ...data, daySummaries: [...others, { date, dailyLimitKopecks }].sort((a, b) => (a.date < b.date ? -1 : 1)) };
}

// Incomes

export function saveIncomeSource(data: AppData, source: IncomeSource, isMain: boolean): AppData {
  const main = data.settings.mainIncomeSourceId;
  const mainIncomeSourceId = isMain && source.dayOfMonth !== null ? source.id : main === source.id ? null : main;
  return { ...data, incomeSources: upsert(data.incomeSources, source), settings: { ...data.settings, mainIncomeSourceId } };
}

/** Removal keeps the source for past operations and stops forecasting it. */
export function removeIncomeSource(data: AppData, id: string): AppData {
  return {
    ...data,
    incomeSources: data.incomeSources.map((s) => (s.id === id ? { ...s, isActive: false } : s)),
    settings: {
      ...data.settings,
      mainIncomeSourceId: data.settings.mainIncomeSourceId === id ? null : data.settings.mainIncomeSourceId,
    },
  };
}

// Payments

export function savePayment(data: AppData, payment: MandatoryPayment): AppData {
  return { ...data, payments: upsert(data.payments, payment) };
}

export function removePayment(data: AppData, id: string): AppData {
  return { ...data, payments: data.payments.map((p) => (p.id === id ? { ...p, isActive: false } : p)) };
}

export function markPaymentPaid(data: AppData, payment: MandatoryPayment, plannedDate: LocalDate, today: LocalDate, now: Date): AppData {
  return withTransaction(data, {
    ...blankTransaction({ type: 'expense', amountKopecks: payment.amountKopecks, date: today, createdAt: now.toISOString() }),
    paymentId: payment.id,
    plannedDate,
    note: payment.name,
  });
}

// Reserves and cushion

export function setReserve(data: AppData, category: ReserveCategory, amountKopecks: number): AppData {
  const key = category === 'groceries' ? 'groceriesKopecks' : 'transportKopecks';
  return { ...data, settings: { ...data.settings, reserves: { ...data.settings.reserves, [key]: amountKopecks } } };
}

export function setCushionFixed(data: AppData, amountKopecks: number): AppData {
  return { ...data, settings: { ...data.settings, cushion: { mode: 'fixed', amountKopecks } } };
}

/**
 * Percent mode starting today. What is already saved stays as the base; today's incomes
 * are counted once, at the new percent.
 */
export function setCushionPercent(data: AppData, percent: number, today: LocalDate, takeKopecks = 0): AppData {
  const savedBeforeToday = cushionSavedBy(data, addDays(today, -1));
  return {
    ...data,
    settings: {
      ...data.settings,
      cushion: { mode: 'percent', percent, baseKopecks: Math.max(0, savedBeforeToday - takeKopecks), sinceDate: today },
    },
  };
}

/** «Взять из подушки X»: the cushion shrinks by X, and the money becomes free. */
export function takeFromCushion(data: AppData, amountKopecks: number, today: LocalDate): AppData {
  const cushion = data.settings.cushion;
  if (cushion.mode === 'fixed') return setCushionFixed(data, Math.max(0, cushion.amountKopecks - amountKopecks));
  return setCushionPercent(data, cushion.percent, today, amountKopecks);
}

// Goals

export function saveGoal(data: AppData, goal: Goal): AppData {
  return { ...data, goals: upsert(data.goals, goal) };
}

/** «Купил»: the purchase is spent from the saved money, not from the limit. */
export function buyGoal(data: AppData, goalId: string, amountKopecks: number, today: LocalDate, now: Date): AppData {
  const goal = data.goals.find((g) => g.id === goalId);
  if (!goal) return data;
  const next = withTransaction(data, {
    ...blankTransaction({ type: 'expense', amountKopecks, date: today, createdAt: now.toISOString() }),
    goalId,
    note: goal.name,
  });
  return saveGoal(next, { ...goal, status: 'done' });
}

export function cancelGoal(data: AppData, goalId: string): AppData {
  const goal = data.goals.find((g) => g.id === goalId);
  return goal ? saveGoal(data, { ...goal, status: 'cancelled' }) : data;
}

// Theme

export function setTheme(data: AppData, theme: AppData['settings']['theme']): AppData {
  return { ...data, settings: { ...data.settings, theme } };
}
