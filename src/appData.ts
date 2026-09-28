import { activeCategories, defaultCategories, MAX_CATEGORIES } from './domain/categories';
import { isRecurring, weekdayIndex } from './domain/dates';
import { rebasedCushion, rebasedGoal } from './domain/savings';
import type {
  AppData,
  Category,
  ExpenseCategory,
  Favorite,
  Goal,
  IncomeSource,
  LocalDate,
  MandatoryPayment,
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
  /** `weekly`: comes every week on the weekday of `date`; otherwise every month on its day. */
  income: { kind: IncomeSource['kind']; amountKopecks: number; date: LocalDate; weekly?: boolean } | null;
  payments: { name: string; amountKopecks: number; date: LocalDate }[];
}

/**
 * Data after onboarding. The balance becomes a starting adjustment. The next income becomes
 * the main one: its day of month (or weekday) defines the period, and it is not expected before `date`.
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
    dayOfMonth: result.income.weekly ? null : dayOf(result.income.date),
    weekday: result.income.weekly ? weekdayIndex(result.income.date) + 1 : null,
    date: null,
    startDate: result.income.date,
    isActive: true,
  };
  return {
    schemaVersion: 5,
    settings: {
      onboardingCompleted: true,
      trackingStartDate: today,
      mainIncomeSourceId: income?.id ?? null,
      categories: defaultCategories(),
      cushion: { mode: 'fixed', amountKopecks: 0 },
      theme: 'auto',
      lastCategory: 'cafe',
      favorites: [],
      targetDailyLimitKopecks: null,
    },
    incomeSources: income ? [income] : [],
    payments: result.payments.map((p) => ({
      id: newId(),
      name: p.name,
      amountKopecks: p.amountKopecks,
      dayOfMonth: dayOf(p.date),
      weekday: null,
      date: null,
      startDate: today,
      isActive: true,
    })),
    goals: [],
    transactions,
    daySummaries: [],
  };
}

export function addExpense(data: AppData, amountKopecks: number, category: Category, today: LocalDate, now: Date, note: string | null = null): AppData {
  const expense = {
    ...blankTransaction({ type: 'expense', amountKopecks, date: today, createdAt: now.toISOString() }),
    category,
    note,
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

/** Only a monthly or weekly income can be the main one: a one-off or irregular one cannot define the period. */
export function saveIncomeSource(data: AppData, source: IncomeSource, isMain: boolean): AppData {
  const main = data.settings.mainIncomeSourceId;
  const mainIncomeSourceId = isMain && isRecurring(source) ? source.id : main === source.id ? null : main;
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

// Categories, reserves and cushion

function withCategories(data: AppData, categories: ExpenseCategory[]): AppData {
  return { ...data, settings: { ...data.settings, categories } };
}

/** Sets the reserve of a category (per full period); null makes its expenses go to the limit. */
export function setReserve(data: AppData, category: Category, amountKopecks: number | null): AppData {
  return withCategories(
    data,
    data.settings.categories.map((c) => (c.id === category ? { ...c, reserveKopecks: amountKopecks } : c)),
  );
}

/** Adds a category at the end or changes one; a new one only while fewer than MAX_CATEGORIES are active. */
export function saveCategory(data: AppData, category: ExpenseCategory): AppData {
  const isNew = !data.settings.categories.some((c) => c.id === category.id);
  if (isNew && activeCategories(data).length >= MAX_CATEGORIES) return data;
  return withCategories(data, upsert(data.settings.categories, category));
}

/** Removes a category from the sheet; its expenses stay, its reserve goes back to the limit. One always stays. */
export function removeCategory(data: AppData, id: Category): AppData {
  if (activeCategories(data).filter((c) => c.id !== id).length === 0) return data;
  return withCategories(
    data,
    data.settings.categories.map((c) => (c.id === id ? { ...c, isActive: false } : c)),
  );
}

/** Brings a removed category back, with its reserve, while there is room. */
export function restoreCategory(data: AppData, id: Category): AppData {
  if (activeCategories(data).length >= MAX_CATEGORIES) return data;
  return withCategories(
    data,
    data.settings.categories.map((c) => (c.id === id ? { ...c, isActive: true } : c)),
  );
}

export function setCushionFixed(data: AppData, amountKopecks: number): AppData {
  return { ...data, settings: { ...data.settings, cushion: { mode: 'fixed', amountKopecks } } };
}

/**
 * Percent mode starting today. What is already saved stays as the base; today's incomes
 * are counted once, at the new percent.
 */
export function setCushionPercent(data: AppData, percent: number, today: LocalDate, takeKopecks = 0): AppData {
  return { ...data, settings: { ...data.settings, cushion: rebasedCushion(data, percent, today, -takeKopecks) } };
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

/** Where «Отложить остаток» puts the money: a goal or the cushion. */
export type SavingsTarget = { goalId: string } | { cushion: true };

/**
 * «Отложить остаток» and «Отправить в копилку»: moves money into savings without an operation, so the
 * balance stays and the limit goes down. What a goal or the cushion holds grows by exactly the amount
 * (a goal up to its target):
 * - a deadline goal is counted afresh from today with what it saved by yesterday plus the amount, and
 *   spreads the smaller rest over the days left, so today's own share shrinks a little;
 * - a percent goal and the percent cushion keep their start and get the amount on top of their base,
 *   so their growth in the period stays as it was (see periodSavings);
 * - a fixed cushion simply grows.
 */
export function setAsideLeftover(data: AppData, target: SavingsTarget, amountKopecks: number, today: LocalDate): AppData {
  if ('goalId' in target) {
    const goal = data.goals.find((g) => g.id === target.goalId);
    if (!goal) return data;
    if (goal.percent !== null) {
      return saveGoal(data, { ...goal, initialSavedKopecks: Math.min(goal.targetKopecks, goal.initialSavedKopecks + amountKopecks) });
    }
    return saveGoal(data, rebasedGoal(data, goal, today, amountKopecks));
  }
  const cushion = data.settings.cushion;
  if (cushion.mode === 'fixed') return setCushionFixed(data, cushion.amountKopecks + amountKopecks);
  return { ...data, settings: { ...data.settings, cushion: { ...cushion, baseKopecks: cushion.baseKopecks + amountKopecks } } };
}

/** «Хочу тратить N в день»; null removes the target. */
export function setTargetDailyLimit(data: AppData, kopecks: number | null): AppData {
  return { ...data, settings: { ...data.settings, targetDailyLimitKopecks: kopecks } };
}

// Theme

// Favourite expenses

export const MAX_FAVORITES = 6;

/** One tap on a favourite: an ordinary expense of its category, named by its label. */
export function addFavoriteExpense(data: AppData, favorite: Favorite, today: LocalDate, now: Date): { data: AppData; transactionId: string } {
  const next = addExpense(data, favorite.amountKopecks, favorite.category, today, now, favorite.label);
  return { data: next, transactionId: next.transactions[next.transactions.length - 1]!.id };
}

/** Adds or changes a favourite; a new one beyond the limit is ignored. */
export function saveFavorite(data: AppData, favorite: Favorite): AppData {
  const list = data.settings.favorites;
  if (!list.some((f) => f.id === favorite.id) && list.length >= MAX_FAVORITES) return data;
  return { ...data, settings: { ...data.settings, favorites: upsert(list, favorite) } };
}

export function removeFavorite(data: AppData, id: string): AppData {
  return { ...data, settings: { ...data.settings, favorites: data.settings.favorites.filter((f) => f.id !== id) } };
}

export function setTheme(data: AppData, theme: AppData['settings']['theme']): AppData {
  return { ...data, settings: { ...data.settings, theme } };
}
