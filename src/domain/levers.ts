import { calculateBudget } from './budget';
import { reserveCategories } from './categories';
import { addMonths } from './dates';
import { rebasedCushion, rebasedGoal } from './savings';
import type { AppData, Category, Goal, LocalDate } from './types';

// «Как дотянуть» (update 1): one-step changes that raise the daily limit. The effect of each is
// calculateBudget on the changed copy of the data, so it is exactly what applying it gives.

/** A deadline goal moves by a month. */
export const DEADLINE_STEP_MONTHS = 1;
/** A percent goal or the percent cushion gives up this many percentage points, down to MIN_PERCENT. */
export const PERCENT_STEP = 5;
export const MIN_PERCENT = 1;
/** A reserve shrinks by 10 %, a fixed cushion by 25 %; the new sum is rounded up to whole BYN. */
const RESERVE_KEEP_PERCENT = 90;
const CUSHION_KEEP_PERCENT = 75;

export type LeverChange =
  | { kind: 'goalDeadline'; targetId: string; oldValue: LocalDate; newValue: LocalDate }
  | { kind: 'goalPercent'; targetId: string; oldValue: number; newValue: number } // percent of every income
  | { kind: 'reserve'; targetId: Category; oldValue: number; newValue: number } // kopecks per full period
  | { kind: 'cushion'; targetId: null; mode: 'fixed'; oldValue: number; newValue: number } // kopecks
  | { kind: 'cushion'; targetId: null; mode: 'percent'; oldValue: number; newValue: number }; // percent of every income

export type LimitLever = LeverChange & {
  apply: (data: AppData) => AppData; // the change, to pass to the app's update
  newLimitKopecks: number; // today's limit after the change
  deltaKopecks: number; // how much the limit grows, > 0
};

type Candidate = LeverChange & { apply: (data: AppData) => AppData };

/** `kopecks × percent / 100`, rounded up to whole BYN. */
function keepRoundedUp(kopecks: number, percent: number): number {
  return Math.ceil((kopecks * percent) / 10_000) * 100;
}

function withGoal(data: AppData, id: string, change: (goal: Goal) => Goal): AppData {
  return { ...data, goals: data.goals.map((g) => (g.id === id ? change(g) : g)) };
}

function candidates(data: AppData, today: LocalDate): Candidate[] {
  const result: Candidate[] = [];
  for (const goal of data.goals) {
    if (goal.status !== 'active') continue;
    if (goal.deadline !== null) {
      const newValue = addMonths(goal.deadline, DEADLINE_STEP_MONTHS);
      result.push({
        kind: 'goalDeadline',
        targetId: goal.id,
        oldValue: goal.deadline,
        newValue,
        apply: (d) => withGoal(d, goal.id, (g) => ({ ...g, deadline: newValue })),
      });
    } else if (goal.percent !== null && goal.percent > MIN_PERCENT) {
      const newValue = Math.max(MIN_PERCENT, goal.percent - PERCENT_STEP);
      result.push({
        kind: 'goalPercent',
        targetId: goal.id,
        oldValue: goal.percent,
        newValue,
        // What is already saved stays; the new percent counts from today.
        apply: (d) => withGoal(d, goal.id, (g) => ({ ...rebasedGoal(d, g, today), percent: newValue })),
      });
    }
  }
  for (const category of reserveCategories(data)) {
    const oldValue = category.reserveKopecks!;
    const newValue = keepRoundedUp(oldValue, RESERVE_KEEP_PERCENT);
    if (newValue >= oldValue) continue;
    result.push({
      kind: 'reserve',
      targetId: category.id,
      oldValue,
      newValue,
      apply: (d) => ({
        ...d,
        settings: { ...d.settings, categories: d.settings.categories.map((c) => (c.id === category.id ? { ...c, reserveKopecks: newValue } : c)) },
      }),
    });
  }
  const cushion = data.settings.cushion;
  if (cushion.mode === 'fixed') {
    const newValue = keepRoundedUp(cushion.amountKopecks, CUSHION_KEEP_PERCENT);
    if (newValue < cushion.amountKopecks) {
      result.push({
        kind: 'cushion',
        targetId: null,
        mode: 'fixed',
        oldValue: cushion.amountKopecks,
        newValue,
        apply: (d) => ({ ...d, settings: { ...d.settings, cushion: { mode: 'fixed', amountKopecks: newValue } } }),
      });
    }
  } else if (cushion.percent > MIN_PERCENT) {
    const newValue = Math.max(MIN_PERCENT, cushion.percent - PERCENT_STEP);
    result.push({
      kind: 'cushion',
      targetId: null,
      mode: 'percent',
      oldValue: cushion.percent,
      newValue,
      apply: (d) => ({ ...d, settings: { ...d.settings, cushion: rebasedCushion(d, newValue, today) } }),
    });
  }
  return result;
}

/**
 * Ways to raise today's daily limit, the biggest effect first. Only changes that raise it are
 * listed: a deadline goal a month later, a percent goal or the percent cushion 5 points lower
 * (not below 1 %), a reserve 10 % smaller, a fixed cushion 25 % smaller.
 */
export function limitLevers(data: AppData, today: LocalDate): LimitLever[] {
  const current = calculateBudget(data, today).dailyLimitKopecks;
  return candidates(data, today)
    .map((c): LimitLever => {
      const newLimitKopecks = calculateBudget(c.apply(data), today).dailyLimitKopecks;
      return { ...c, newLimitKopecks, deltaKopecks: newLimitKopecks - current };
    })
    .filter((lever) => lever.deltaKopecks > 0)
    .sort((a, b) => b.deltaKopecks - a.deltaKopecks);
}
