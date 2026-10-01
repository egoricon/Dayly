import { addDays, daysInclusive, diffDays, getPeriod, isRecurring, isRegular, maxDate, scheduleOccurrences, type Period } from './dates';
import { reserveCategories } from './categories';
import type { AppData, Category, ExpenseCategory, Goal, LocalDate, Transaction } from './types';

// Daily limit model: CLAUDE.md «Модель расчёта», full algorithm in PROJECT_MAP.md section 2.

export interface ReserveState {
  category: Category;
  budgetKopecks: number;
  usedKopecks: number;
  remainingKopecks: number;
}

/** A planned occurrence of an income source or a mandatory payment. */
export interface Occurrence {
  sourceId: string;
  date: LocalDate;
  amountKopecks: number;
}

export interface CheckpointBreakdown {
  date: LocalDate;
  kind: 'income' | 'periodEnd';
  incomeSourceId: string | null;
  days: number;
  startOfDayKopecks: number;
  incomeKopecks: number;
  paymentsKopecks: number;
  reservesKopecks: number;
  goalsKopecks: number;
  cushionKopecks: number;
  freeKopecks: number;
  limitKopecks: number;
  // Terms behind the sums, for «Как считается»
  incomes: Occurrence[];
  payments: Occurrence[];
  reserveTerms: { category: Category; kopecks: number }[];
  goalTerms: { goalId: string; kopecks: number }[];
}

export interface ExpenseSplit {
  transactionId: string;
  fromLimitKopecks: number;
  fromReserveKopecks: number;
}

export interface BudgetResult {
  today: LocalDate;
  period: Period;
  balanceKopecks: number;
  startOfDayKopecks: number;
  dailyLimitKopecks: number;
  tomorrowLimitKopecks: number;
  spentTodayKopecks: number;
  remainingTodayKopecks: number; // < 0 means overspent
  carryFromYesterdayKopecks: number | null;
  status: 'ok' | 'deficit';
  shortfall: { amountKopecks: number; until: LocalDate } | null;
  bindingCheckpoint: { date: LocalDate; incomeSourceId: string | null };
  breakdown: CheckpointBreakdown; // terms of the binding checkpoint
  checkpoints: CheckpointBreakdown[];
  reserves: ReserveState[];
  expectedIncomes: Occurrence[];
  unpaidPayments: Occurrence[];
}

function byTime(a: Transaction, b: Transaction): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function ceilDiv(numerator: number, denominator: number): number {
  return Math.ceil(numerator / denominator);
}

/** The period containing `date`. */
export function periodOf(data: AppData, date: LocalDate): Period {
  const main = data.incomeSources.find((s) => s.id === data.settings.mainIncomeSourceId);
  // Without a main income the money stretches over a month from the day tracking started (26.09.2026).
  // A one-off main income cannot define a period either.
  if (!main || !isRecurring(main)) {
    return getPeriod(date, Number(data.settings.trackingStartDate.slice(8, 10)));
  }
  return getPeriod(date, main.dayOfMonth, main.weekday);
}

/** Reserve budget for a period; the first partial period is proportional to the tracked days. */
function reserveBudget(data: AppData, category: ExpenseCategory, period: Period): number {
  const full = category.reserveKopecks ?? 0;
  const from = maxDate(period.start, data.settings.trackingStartDate);
  if (from > period.end) return 0;
  if (from === period.start) return full;
  return ceilDiv(full * daysInclusive(from, period.end), daysInclusive(period.start, period.end));
}

/** Walks the period's expenses in order: reserve categories spend their reserve, overflow goes to the limit. */
function splitPeriodExpenses(data: AppData, period: Period): { splits: Map<string, ExpenseSplit>; reserves: ReserveState[] } {
  const remaining = new Map<Category, number>();
  const reserves: ReserveState[] = reserveCategories(data).map((category) => {
    const budgetKopecks = reserveBudget(data, category, period);
    remaining.set(category.id, budgetKopecks);
    return { category: category.id, budgetKopecks, usedKopecks: 0, remainingKopecks: budgetKopecks };
  });
  const splits = new Map<string, ExpenseSplit>();
  const expenses = data.transactions
    .filter((t) => t.type === 'expense' && t.date >= period.start && t.date <= period.end)
    .sort(byTime);
  for (const t of expenses) {
    let fromLimit = t.amountKopecks;
    let fromReserve = 0;
    if (t.paymentId !== null || t.goalId !== null) {
      fromLimit = 0;
    } else if (t.category !== null && remaining.has(t.category)) {
      const left = remaining.get(t.category)!;
      fromReserve = Math.min(left, t.amountKopecks);
      fromLimit = t.amountKopecks - fromReserve;
      remaining.set(t.category, left - fromReserve);
    }
    splits.set(t.id, { transactionId: t.id, fromLimitKopecks: fromLimit, fromReserveKopecks: fromReserve });
  }
  for (const reserve of reserves) {
    reserve.remainingKopecks = remaining.get(reserve.category)!;
    reserve.usedKopecks = reserve.budgetKopecks - reserve.remainingKopecks;
  }
  return { splits, reserves };
}

/** Splits of every expense, period by period (for history). */
export function splitAllExpenses(data: AppData): Map<string, ExpenseSplit> {
  const result = new Map<string, ExpenseSplit>();
  const periodStarts = new Set<LocalDate>();
  for (const t of data.transactions) {
    if (t.type !== 'expense') continue;
    const period = periodOf(data, t.date);
    if (periodStarts.has(period.start)) continue;
    periodStarts.add(period.start);
    for (const [id, split] of splitPeriodExpenses(data, period).splits) result.set(id, split);
  }
  return result;
}

/** How each expense of `date` splits between the daily limit and reserves (for history). */
export function splitExpenses(data: AppData, date: LocalDate): ExpenseSplit[] {
  const { splits } = splitPeriodExpenses(data, periodOf(data, date));
  return data.transactions
    .filter((t) => t.type === 'expense' && t.date === date)
    .sort(byTime)
    .map((t) => splits.get(t.id)!);
}

/** Balance at the end of `date`: incomes and adjustments with their sign, expenses subtracted. */
export function balanceOn(data: AppData, date: LocalDate): number {
  return sum(data.transactions.filter((t) => t.date <= date).map((t) => (t.type === 'expense' ? -t.amountKopecks : t.amountKopecks)));
}

function spentFromLimit(data: AppData, date: LocalDate): number {
  return sum(splitExpenses(data, date).map((s) => s.fromLimitKopecks));
}

/** What a percent rule sets aside from one income, rounded up. */
export function percentShare(amountKopecks: number, percent: number): number {
  return ceilDiv(amountKopecks * percent, 100);
}

/** Percent shares of every income operation dated from `from` to `to`: the percent cushion and percent goals. */
function incomeShares(data: AppData, percent: number, from: LocalDate, to: LocalDate): number {
  return sum(
    data.transactions
      .filter((t) => t.type === 'income' && t.date >= from && t.date <= to)
      .map((t) => percentShare(t.amountKopecks, percent)),
  );
}

/**
 * How much of a goal is saved by the end of day `date`. A deadline goal saves evenly by day;
 * a percent goal saves its percent of every income since `startDate`. Never above the target.
 */
export function goalSavedBy(data: AppData, goal: Goal, date: LocalDate): number {
  if (goal.percent !== null) {
    return Math.min(goal.targetKopecks, goal.initialSavedKopecks + incomeShares(data, goal.percent, goal.startDate, date));
  }
  if (goal.deadline === null) return goal.initialSavedKopecks;
  const totalDays = daysInclusive(goal.startDate, goal.deadline);
  if (totalDays <= 0) return goal.targetKopecks;
  const elapsed = Math.min(Math.max(daysInclusive(goal.startDate, date), 0), totalDays);
  const rest = goal.targetKopecks - goal.initialSavedKopecks;
  return Math.min(goal.targetKopecks, goal.initialSavedKopecks + ceilDiv(rest * elapsed, totalDays));
}

/**
 * What a goal holds at a checkpoint whose last day is `lastDay`. A percent goal adds its share of the
 * expected incomes before the checkpoint to what it holds today.
 */
function goalAtCheckpoint(data: AppData, goal: Goal, today: LocalDate, lastDay: LocalDate, incomesBefore: Occurrence[]): number {
  if (goal.percent === null) return goalSavedBy(data, goal, lastDay);
  const percent = goal.percent;
  const expected = sum(incomesBefore.filter((i) => i.date >= goal.startDate).map((i) => percentShare(i.amountKopecks, percent)));
  return Math.min(goal.targetKopecks, goalSavedBy(data, goal, today) + expected);
}

/** Cushion saved by the end of day `date` (the percent mode counts incomes up to that day). */
export function cushionSavedBy(data: AppData, date: LocalDate): number {
  const cushion = data.settings.cushion;
  if (cushion.mode === 'fixed') return cushion.amountKopecks;
  return cushion.baseKopecks + incomeShares(data, cushion.percent, cushion.sinceDate, date);
}

function occurrenceKey(sourceId: string, date: LocalDate): string {
  return `${sourceId}|${date}`;
}

/** Unconfirmed occurrences of planned incomes from `today` to the end of `period`. */
export function expectedIncomes(data: AppData, today: LocalDate, period: Period): Occurrence[] {
  const confirmed = new Set(
    data.transactions
      .filter((t) => t.type === 'income' && t.incomeSourceId !== null && t.plannedDate !== null)
      .map((t) => occurrenceKey(t.incomeSourceId!, t.plannedDate!)),
  );
  const result: Occurrence[] = [];
  for (const source of data.incomeSources) {
    if (!source.isActive || !isRegular(source)) continue;
    const from = maxDate(today, maxDate(source.startDate, data.settings.trackingStartDate));
    for (const date of scheduleOccurrences(source, from, period.end)) {
      if (!confirmed.has(occurrenceKey(source.id, date))) {
        result.push({ sourceId: source.id, date, amountKopecks: source.amountKopecks });
      }
    }
  }
  return result.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** Occurrences of payments in `period` (monthly, weekly or one-off) without a paying operation, overdue ones too. */
export function unpaidPayments(data: AppData, period: Period): Occurrence[] {
  const paid = new Set(
    data.transactions
      .filter((t) => t.type === 'expense' && t.paymentId !== null && t.plannedDate !== null)
      .map((t) => occurrenceKey(t.paymentId!, t.plannedDate!)),
  );
  const result: Occurrence[] = [];
  for (const payment of data.payments) {
    if (!payment.isActive) continue;
    const from = maxDate(period.start, maxDate(payment.startDate, data.settings.trackingStartDate));
    for (const date of scheduleOccurrences(payment, from, period.end)) {
      if (!paid.has(occurrenceKey(payment.id, date))) {
        result.push({ sourceId: payment.id, date, amountKopecks: payment.amountKopecks });
      }
    }
  }
  return result.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** The day's budget without the look at tomorrow and yesterday. */
export type DayBudget = Omit<BudgetResult, 'tomorrowLimitKopecks' | 'carryFromYesterdayKopecks'>;

/** calculateBudget for one day only: the limit, checkpoints and reserves, without tomorrow and the carry. */
export function calculateDay(data: AppData, today: LocalDate): DayBudget {
  const period = periodOf(data, today);
  const { splits, reserves } = splitPeriodExpenses(data, period);

  const balanceKopecks = balanceOn(data, today);
  const spentTodayKopecks = sum(
    data.transactions
      .filter((t) => t.type === 'expense' && t.date === today)
      .map((t) => splits.get(t.id)?.fromLimitKopecks ?? 0),
  );
  const startOfDayKopecks = balanceKopecks + spentTodayKopecks;

  const incomes = expectedIncomes(data, today, period);
  const payments = unpaidPayments(data, period);
  const daysToEnd = daysInclusive(today, period.end);
  const cushionNow = cushionSavedBy(data, today);
  const cushionPercent = data.settings.cushion.mode === 'percent' ? data.settings.cushion.percent : 0;
  const activeGoals = data.goals.filter((g) => g.status === 'active');
  const periodEndCheckpoint = addDays(period.end, 1);

  const checkpointDates = [...new Set([...incomes.map((i) => i.date).filter((d) => d > today), periodEndCheckpoint])].sort();

  const checkpoints = checkpointDates.map((date): CheckpointBreakdown => {
    const days = diffDays(today, date);
    const incomesBefore = incomes.filter((i) => i.date < date);
    const incomeKopecks = sum(incomesBefore.map((i) => i.amountKopecks));
    const paymentsBefore = payments.filter((p) => p.date < date);
    const paymentsKopecks = sum(paymentsBefore.map((p) => p.amountKopecks));
    const reserveTerms = reserves.map((r) => ({ category: r.category, kopecks: ceilDiv(r.remainingKopecks * days, daysToEnd) }));
    const reservesKopecks = sum(reserveTerms.map((r) => r.kopecks));
    const goalTerms = activeGoals.map((g) => ({ goalId: g.id, kopecks: goalAtCheckpoint(data, g, today, addDays(date, -1), incomesBefore) }));
    const goalsKopecks = sum(goalTerms.map((g) => g.kopecks));
    const cushionKopecks = cushionNow + sum(incomesBefore.map((i) => percentShare(i.amountKopecks, cushionPercent)));
    const freeKopecks = startOfDayKopecks + incomeKopecks - paymentsKopecks - reservesKopecks - goalsKopecks - cushionKopecks;
    const isEnd = date === periodEndCheckpoint;
    return {
      date,
      kind: isEnd ? 'periodEnd' : 'income',
      incomeSourceId: isEnd ? data.settings.mainIncomeSourceId : incomes.find((i) => i.date === date)!.sourceId,
      days,
      startOfDayKopecks,
      incomeKopecks,
      paymentsKopecks,
      reservesKopecks,
      goalsKopecks,
      cushionKopecks,
      freeKopecks,
      limitKopecks: Math.floor(freeKopecks / days),
      incomes: incomesBefore,
      payments: paymentsBefore,
      reserveTerms,
      goalTerms,
    };
  });

  // Binding checkpoint: minimal limit, the earliest on ties.
  const binding = checkpoints.reduce((min, c) => (c.limitKopecks < min.limitKopecks ? c : min));
  const deficit = checkpoints
    .filter((c) => c.freeKopecks < 0)
    .reduce<CheckpointBreakdown | null>((worst, c) => (worst === null || c.freeKopecks < worst.freeKopecks ? c : worst), null);

  const dailyLimitKopecks = Math.max(0, binding.limitKopecks);
  return {
    today,
    period,
    balanceKopecks,
    startOfDayKopecks,
    dailyLimitKopecks,
    spentTodayKopecks,
    remainingTodayKopecks: dailyLimitKopecks - spentTodayKopecks,
    status: deficit ? 'deficit' : 'ok',
    shortfall: deficit ? { amountKopecks: -deficit.freeKopecks, until: deficit.date } : null,
    bindingCheckpoint: { date: binding.date, incomeSourceId: binding.incomeSourceId },
    breakdown: binding,
    checkpoints,
    reserves,
    expectedIncomes: incomes,
    unpaidPayments: payments,
  };
}

/** Incomes expected today count as arrived when looking at tomorrow. */
function withTodayIncomesArrived(data: AppData, day: DayBudget): AppData {
  const arrived: Transaction[] = day.expectedIncomes
    .filter((i) => i.date === day.today)
    .map((i) => ({
      id: `forecast:${i.sourceId}:${i.date}`,
      type: 'income',
      amountKopecks: i.amountKopecks,
      date: day.today,
      createdAt: '',
      category: null,
      incomeSourceId: i.sourceId,
      paymentId: null,
      goalId: null,
      plannedDate: i.date,
      note: null,
    }));
  return arrived.length === 0 ? data : { ...data, transactions: [...data.transactions, ...arrived] };
}

export function calculateBudget(data: AppData, today: LocalDate): BudgetResult {
  const day = calculateDay(data, today);
  const tomorrow = calculateDay(withTodayIncomesArrived(data, day), addDays(today, 1));

  const yesterday = addDays(today, -1);
  const summary = data.daySummaries.find((s) => s.date === yesterday);
  const carryFromYesterdayKopecks = summary ? summary.dailyLimitKopecks - spentFromLimit(data, yesterday) : null;

  return { ...day, tomorrowLimitKopecks: tomorrow.dailyLimitKopecks, carryFromYesterdayKopecks };
}

export interface ExpensePreview {
  fromLimitKopecks: number;
  fromReserveKopecks: number;
  remainingTodayKopecks: number; // after the expense; < 0 means overspent
  dailyLimitKopecks: number; // today's limit after the expense: an expense of an earlier day changes it
}

/**
 * What a new expense would do, for the live preview in the input sheet. With `editId` it
 * previews a change of that expense instead: same day and place in the order. A new expense is of
 * `date`, today unless given («Вчера»).
 */
export function previewExpense(
  data: AppData,
  today: LocalDate,
  amountKopecks: number,
  category: Category,
  editId: string | null = null,
  date: LocalDate = today,
): ExpensePreview {
  const original = editId === null ? undefined : data.transactions.find((t) => t.id === editId);
  const draft: Transaction = original
    ? { ...original, amountKopecks, category }
    : {
        id: 'preview',
        type: 'expense',
        amountKopecks,
        date,
        createdAt: '￿', // sorts after every real expense of the day
        category,
        incomeSourceId: null,
        paymentId: null,
        goalId: null,
        plannedDate: null,
        note: null,
      };
  const next = original
    ? { ...data, transactions: data.transactions.map((t) => (t.id === original.id ? draft : t)) }
    : { ...data, transactions: [...data.transactions, draft] };
  const split = splitExpenses(next, draft.date).find((s) => s.transactionId === draft.id)!;
  const result = calculateDay(next, today);
  return {
    fromLimitKopecks: split.fromLimitKopecks,
    fromReserveKopecks: split.fromReserveKopecks,
    remainingTodayKopecks: result.remainingTodayKopecks,
    dailyLimitKopecks: result.dailyLimitKopecks,
  };
}
