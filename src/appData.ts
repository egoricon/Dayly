import { activeCategories, defaultCategories, MAX_CATEGORIES } from './domain/categories';
import { isRecurring, weekdayIndex } from './domain/dates';
import { roundUpKopecks, roundUpTarget, targetGoalId, targetOf, withDeposit, withWithdrawal, type SavingsTarget } from './domain/jars';
import { heldCushion, rebasedCushion } from './domain/savings';
// events.ts builds on this module too; each only calls the other inside functions.
import { saveEvent, type EventDraft, type Repeat } from './events';
import type {
  AppData,
  Category,
  ExpenseCategory,
  Favorite,
  Goal,
  IncomeSource,
  LocalDate,
  MandatoryPayment,
  SavingsMove,
  Transaction,
} from './domain/types';

export type { SavingsTarget } from './domain/jars';

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

/** A regular payment of the first setup: its next day and «Повтор», monthly unless given. */
export type OnboardingPayment = Pick<EventDraft, 'name' | 'amountKopecks' | 'date'> & { repeat?: Repeat };

export interface OnboardingResult {
  balanceKopecks: number;
  /** `weekly`: comes every week on the weekday of `date`; otherwise every month on its day. The name follows the kind unless given. */
  income: { kind: IncomeSource['kind']; name?: string; amountKopecks: number; date: LocalDate; weekly?: boolean } | null;
  payments: OnboardingPayment[];
  /** Reserves of «Продукты» and «Транспорт» per full period; without them (skipped) both stay 0. */
  reserves?: { groceriesKopecks: number; transportKopecks: number };
}

/**
 * Data after onboarding. The balance becomes a starting adjustment. The next income becomes
 * the main one: its day of month (or weekday) defines the period, and it is not expected before `date`.
 * Payments are saved as calendar events from their day on; reserves go to «Продукты» and «Транспорт».
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
    name: result.income.name ?? INCOME_KIND_NAMES[result.income.kind],
    amountKopecks: result.income.amountKopecks,
    dayOfMonth: result.income.weekly ? null : dayOf(result.income.date),
    weekday: result.income.weekly ? weekdayIndex(result.income.date) + 1 : null,
    date: null,
    startDate: result.income.date,
    isActive: true,
  };
  const data: AppData = {
    schemaVersion: 6,
    settings: {
      onboardingCompleted: true,
      trackingStartDate: today,
      mainIncomeSourceId: income?.id ?? null,
      categories: defaultCategories(result.reserves?.groceriesKopecks ?? 0, result.reserves?.transportKopecks ?? 0),
      cushion: { mode: 'fixed', amountKopecks: 0, targetKopecks: null },
      theme: 'auto',
      lastCategory: 'cafe',
      favorites: [],
      targetDailyLimitKopecks: null,
      roundUp: null,
    },
    incomeSources: income ? [income] : [],
    payments: [],
    goals: [],
    transactions,
    daySummaries: [],
    savingsMoves: [],
  };
  // The same payments as «+ Расход» in the calendar makes.
  return result.payments.reduce(
    (next, p) => saveEvent(next, { kind: 'payment', incomeKind: 'other', name: p.name, amountKopecks: p.amountKopecks, date: p.date, repeat: p.repeat ?? 'monthly' }, null),
    data,
  );
}

/**
 * The round-up of an expense already in `data` into `target` (update 2): the rest to whole BYN as a
 * `roundup` move dated like the expense, within what the jar can take without a shortfall today.
 */
function withRoundUp(data: AppData, expense: Transaction, target: SavingsTarget | null, today: LocalDate, meta: Pick<SavingsMove, 'id' | 'createdAt'>): AppData {
  if (target === null || expense.paymentId !== null || expense.goalId !== null) return data;
  const kopecks = roundUpKopecks(data, expense.amountKopecks, target, today);
  return withDeposit(data, target, kopecks, expense.date, today, { ...meta, source: 'roundup', transactionId: expense.id });
}

/** A new expense; with rounding up on, the rest to whole BYN goes into the chosen jar. */
export function addExpense(data: AppData, amountKopecks: number, category: Category, today: LocalDate, now: Date, note: string | null = null): AppData {
  const expense = {
    ...blankTransaction({ type: 'expense', amountKopecks, date: today, createdAt: now.toISOString() }),
    category,
    note,
  };
  const next = { ...withTransaction(data, expense), settings: { ...data.settings, lastCategory: category } };
  return withRoundUp(next, expense, roundUpTarget(data), today, { id: newId(), createdAt: now.toISOString() });
}

function roundUpOf(data: AppData, transactionId: string): SavingsMove | undefined {
  return data.savingsMoves.find((m) => m.source === 'roundup' && m.transactionId === transactionId);
}

function withoutMovesOf(data: AppData, transactionId: string): AppData {
  return roundUpOf(data, transactionId) ? { ...data, savingsMoves: data.savingsMoves.filter((m) => m.transactionId !== transactionId) } : data;
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

/**
 * Deleting an expense deletes its round-up too («Отменить» after «Добавить» is a delete). Deleting a
 * goal purchase makes the goal active again: the money is back in the savings.
 */
export function deleteTransaction(data: AppData, id: string): AppData {
  const removed = data.transactions.find((t) => t.id === id);
  const next = withoutMovesOf({ ...data, transactions: data.transactions.filter((t) => t.id !== id) }, id);
  const goal = removed?.goalId ? next.goals.find((g) => g.id === removed.goalId) : undefined;
  return goal && goal.status === 'done' ? saveGoal(next, { ...goal, status: 'active' }) : next;
}

/**
 * Changes amount and category of an expense; its day and time stay. A rounded-up expense is rounded
 * afresh into the same jar (the move keeps its id), or loses its round-up when the new sum is whole BYN.
 */
export function updateExpense(data: AppData, id: string, amountKopecks: number, category: Category, today: LocalDate): AppData {
  const original = data.transactions.find((t) => t.id === id && t.type === 'expense');
  if (!original) return data;
  const edited = { ...original, amountKopecks, category };
  const next = { ...data, transactions: data.transactions.map((t) => (t === original ? edited : t)) };
  const roundUp = roundUpOf(data, id);
  if (!roundUp) return next;
  return withRoundUp(withoutMovesOf(next, id), edited, targetOf(roundUp.goalId), today, { id: roundUp.id, createdAt: roundUp.createdAt });
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

/** A fixed cushion that holds `amountKopecks` today: what was put in and taken out is counted in. */
export function setCushionFixed(data: AppData, amountKopecks: number, today: LocalDate): AppData {
  return { ...data, settings: { ...data.settings, cushion: heldCushion(data, amountKopecks, today) } };
}

/**
 * Percent mode starting today. What is already saved stays as the base; today's incomes
 * are counted once, at the new percent.
 */
export function setCushionPercent(data: AppData, percent: number, today: LocalDate): AppData {
  return { ...data, settings: { ...data.settings, cushion: rebasedCushion(data, percent, today) } };
}

/** The cushion's target for the piggy and its progress; null: none. The cushion is never capped by it. */
export function setCushionTarget(data: AppData, targetKopecks: number | null): AppData {
  return { ...data, settings: { ...data.settings, cushion: { ...data.settings.cushion, targetKopecks } } };
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

// Savings moves (update 2)

/**
 * «Положить», «Отложить остаток» (`leftover`) and «Отправить в копилку» (`period`): a move into a goal or
 * the cushion without an operation, so the balance stays and the limit goes down. A goal takes no more
 * than it still needs; the limits against a shortfall are the screen's (putInMax in src/ui/savings.ts).
 * A deadline goal spreads the smaller rest over the days left, so today's own share shrinks a little.
 */
export function putIntoJar(
  data: AppData,
  target: SavingsTarget,
  amountKopecks: number,
  today: LocalDate,
  now: Date,
  source: Extract<SavingsMove['source'], 'manual' | 'leftover' | 'period'> = 'manual',
): AppData {
  return withDeposit(data, target, amountKopecks, today, today, { id: newId(), createdAt: now.toISOString(), source, transactionId: null });
}

/**
 * «Забрать» and «Взять из подушки»: a `withdraw` move out of a goal or the cushion, no more than it
 * holds (takeOutMax). The money becomes free, and the limit goes up.
 */
export function takeFromJar(data: AppData, target: SavingsTarget, amountKopecks: number, today: LocalDate, now: Date): AppData {
  return withWithdrawal(data, target, amountKopecks, today, { id: newId(), createdAt: now.toISOString(), source: 'withdraw', transactionId: null });
}

/** Deletes a move from the history of «Копилка». A round-up goes only with its expense. */
export function deleteSavingsMove(data: AppData, id: string): AppData {
  const found = data.savingsMoves.find((m) => m.id === id);
  if (!found || found.source === 'roundup') return data;
  return { ...data, savingsMoves: data.savingsMoves.filter((m) => m !== found) };
}

/** Rounding expenses up to 1 BYN into a goal or the cushion; null turns it off. */
export function setRoundUp(data: AppData, target: SavingsTarget | null): AppData {
  return { ...data, settings: { ...data.settings, roundUp: target === null ? null : { goalId: targetGoalId(target) } } };
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
