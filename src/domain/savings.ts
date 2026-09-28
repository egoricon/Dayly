import { balanceOn, cushionSavedBy, expectedIncomes, goalSavedBy, percentShare, periodOf, type Occurrence } from './budget';
import { addDays, type Period } from './dates';
import { dayResults } from './history';
import type { AppData, Cushion, Goal, LocalDate } from './types';

// Savings of update 1: how an income splits by percent rules, what the current period saves
// (the savings ring) and «Итоги периода» of the previous one. Goals count only while active.

/** A date after every operation: «everything recorded so far». */
const ALL_TIME: LocalDate = '9999-12-31';

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function activeGoals(data: AppData): Goal[] {
  return data.goals.filter((g) => g.status === 'active');
}

/** Shares of the given incomes that a percent rule sets aside, each rounded up. */
function sharesOf(incomes: Occurrence[], percent: number): number {
  return sum(incomes.map((i) => percentShare(i.amountKopecks, percent)));
}

export interface IncomeSplit {
  cushionKopecks: number; // the percent cushion's share; 0 for a fixed cushion
  goals: { goalId: string; kopecks: number }[]; // every active percent goal, in the order of the data
  lifeKopecks: number; // the rest, never below 0
}

/**
 * How a new income (not yet in `data`) splits by the percent rules: the percent cushion and every
 * active percent goal take their share rounded up, a goal no more than it still needs after the
 * incomes recorded so far. The rest is «на жизнь».
 */
export function incomeSplit(data: AppData, amountKopecks: number): IncomeSplit {
  const cushion = data.settings.cushion;
  const cushionKopecks = cushion.mode === 'percent' ? percentShare(amountKopecks, cushion.percent) : 0;
  const goals = activeGoals(data)
    .filter((g) => g.percent !== null)
    .map((g) => ({
      goalId: g.id,
      kopecks: Math.max(0, Math.min(percentShare(amountKopecks, g.percent!), g.targetKopecks - goalSavedBy(data, g, ALL_TIME))),
    }));
  const lifeKopecks = Math.max(0, amountKopecks - cushionKopecks - sum(goals.map((g) => g.kopecks)));
  return { cushionKopecks, goals, lifeKopecks };
}

export interface PeriodSavings {
  savedKopecks: number; // what active goals and the cushion grew by since the period started
  plannedKopecks: number; // saved plus what they are going to grow by until the period ends
}

/**
 * The savings ring: what active goals and the cushion saved in the current period so far and what
 * they plan to save by its end. A deadline goal grows by day; a percent goal and the percent cushion
 * grow by their share of the incomes still expected in the period (a goal up to its target).
 * A fixed cushion does not grow.
 */
export function periodSavings(data: AppData, today: LocalDate): PeriodSavings {
  const period = periodOf(data, today);
  const before = addDays(period.start, -1);
  const expected = expectedIncomes(data, today, period);
  let savedKopecks = 0;
  let aheadKopecks = 0;
  for (const goal of activeGoals(data)) {
    const now = goalSavedBy(data, goal, today);
    savedKopecks += now - goalSavedBy(data, goal, before);
    aheadKopecks +=
      goal.percent === null
        ? goalSavedBy(data, goal, period.end) - now
        : Math.min(goal.targetKopecks, now + sharesOf(expected.filter((i) => i.date >= goal.startDate), goal.percent)) - now;
  }
  const cushion = data.settings.cushion;
  savedKopecks += cushionSavedBy(data, today) - cushionSavedBy(data, before);
  if (cushion.mode === 'percent') aheadKopecks += sharesOf(expected, cushion.percent);
  return { savedKopecks, plannedKopecks: savedKopecks + aheadKopecks };
}

export interface PeriodSummary {
  period: Period; // the previous period
  daysInLimit: number; // days with a recorded limit whose spending from the limit stayed within it
  daysTracked: number; // days with a recorded limit
  savedKopecks: number; // what active goals and the cushion grew by over the period
  leftoverKopecks: number; // balance at its end beyond what goals and the cushion held then; never below 0
}

/**
 * «Итоги периода» for the period before the current one. Null when that period ended before
 * tracking started.
 */
export function periodSummary(data: AppData, today: LocalDate): PeriodSummary | null {
  const period = periodOf(data, addDays(periodOf(data, today).start, -1));
  if (period.end < data.settings.trackingStartDate) return null;
  const days = dayResults(data, period.start, period.end).filter((d) => d.status !== 'none');
  const before = addDays(period.start, -1);
  const goals = activeGoals(data);
  const savingsBy = (date: LocalDate) => sum(goals.map((g) => goalSavedBy(data, g, date))) + cushionSavedBy(data, date);
  return {
    period,
    daysInLimit: days.filter((d) => d.status === 'in').length,
    daysTracked: days.length,
    savedKopecks: savingsBy(period.end) - savingsBy(before),
    leftoverKopecks: Math.max(0, balanceOn(data, period.end) - savingsBy(period.end)),
  };
}

/**
 * The goal counted afresh from today: what it saved by yesterday plus `extraKopecks` (up to the target)
 * becomes its initial savings. Used when money is added to it and when its percent changes, so the
 * past is not recounted. Pass the goal as it was; set a new percent or deadline on the result.
 */
export function rebasedGoal(data: AppData, goal: Goal, today: LocalDate, extraKopecks = 0): Goal {
  const savedByYesterday = goalSavedBy(data, goal, addDays(today, -1));
  return { ...goal, startDate: today, initialSavedKopecks: Math.min(goal.targetKopecks, savedByYesterday + extraKopecks) };
}

/**
 * A percent cushion counted afresh from today at `percent`: what the cushion held by yesterday,
 * changed by `changeKopecks` (never below 0), becomes its base; today's incomes count at the new percent.
 */
export function rebasedCushion(data: AppData, percent: number, today: LocalDate, changeKopecks = 0): Extract<Cushion, { mode: 'percent' }> {
  const savedByYesterday = cushionSavedBy(data, addDays(today, -1));
  return { mode: 'percent', percent, baseKopecks: Math.max(0, savedByYesterday + changeKopecks), sinceDate: today };
}
