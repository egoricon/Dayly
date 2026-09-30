import { calculateDay, cushionSavedBy, goalSavedBy, goalScheduleDates, goalUnclampedBy, percentShare } from './budget';
import { addDays, addMonths, daysInclusive } from './dates';
import { plannedEvents } from './planned';
import { goalWithinTarget } from './savings';
import type { AppData, Goal, LocalDate, SavingsMove } from './types';

// «Копилка» of update 2: the cushion and the active goals as jars, the piggy's fill, when a jar gets
// full, money put in and taken out (savings moves) with their limits, rounding expenses up, and what
// a move does to the limit and the plan. Pure; the app layer adds ids and times (src/appData.ts).

/** A goal or the cushion. */
export type SavingsTarget = { goalId: string } | { cushion: true };

export type JarKind = 'cushion' | 'deadline' | 'percent' | 'schedule' | 'manual';

export const CUSHION_NAME = 'Подушка';

/** How far ahead a fill forecast looks. */
const FORECAST_MONTHS = 36;

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

/** How a goal saves: by a date, a percent of every income, an amount on a schedule or by hand. */
export function goalKind(goal: Goal): Exclude<JarKind, 'cushion'> {
  if (goal.deadline !== null) return 'deadline';
  if (goal.percent !== null) return 'percent';
  if (goal.schedule !== null) return 'schedule';
  return 'manual';
}

export function targetGoalId(target: SavingsTarget): string | null {
  return 'goalId' in target ? target.goalId : null;
}

/** The jar a move or the round-up setting points to: a goal by its id, the cushion for null. */
export function targetOf(goalId: string | null): SavingsTarget {
  return goalId === null ? { cushion: true } : { goalId };
}

function goalOf(data: AppData, target: SavingsTarget): Goal | undefined {
  return 'goalId' in target ? data.goals.find((g) => g.id === target.goalId) : undefined;
}

/** What a jar holds by the end of `date`: the cushion or a goal (0 for an unknown one). */
export function jarSavedBy(data: AppData, target: SavingsTarget, date: LocalDate): number {
  if ('cushion' in target) return cushionSavedBy(data, date);
  const goal = goalOf(data, target);
  return goal ? goalSavedBy(data, goal, date) : 0;
}

export interface Jar {
  key: string; // the goal's id or 'cushion'
  target: SavingsTarget;
  name: string;
  kind: JarKind;
  savedKopecks: number;
  targetKopecks: number | null; // null: the cushion without a target
  progress: number | null; // saved ÷ target, 0–1; null without a target
}

function progressOf(savedKopecks: number, targetKopecks: number | null): number | null {
  if (targetKopecks === null || targetKopecks <= 0) return null;
  return Math.min(1, Math.max(0, savedKopecks / targetKopecks));
}

function cushionJar(data: AppData, today: LocalDate): Jar {
  const savedKopecks = cushionSavedBy(data, today);
  const targetKopecks = data.settings.cushion.targetKopecks;
  return { key: 'cushion', target: { cushion: true }, name: CUSHION_NAME, kind: 'cushion', savedKopecks, targetKopecks, progress: progressOf(savedKopecks, targetKopecks) };
}

function goalJar(data: AppData, goal: Goal, today: LocalDate): Jar {
  const savedKopecks = goalSavedBy(data, goal, today);
  return {
    key: goal.id,
    target: { goalId: goal.id },
    name: goal.name,
    kind: goalKind(goal),
    savedKopecks,
    targetKopecks: goal.targetKopecks,
    progress: progressOf(savedKopecks, goal.targetKopecks),
  };
}

/** The jars of «Копилка»: the cushion first, then the active goals in the order of the data. */
export function jarsOf(data: AppData, today: LocalDate): Jar[] {
  return [cushionJar(data, today), ...data.goals.filter((g) => g.status === 'active').map((g) => goalJar(data, g, today))];
}

/** One jar, the cushion or a goal of any status; null for an unknown goal. */
export function jarOf(data: AppData, target: SavingsTarget, today: LocalDate): Jar | null {
  if ('cushion' in target) return cushionJar(data, today);
  const goal = goalOf(data, target);
  return goal ? goalJar(data, goal, today) : null;
}

export interface PiggyFill {
  savedKopecks: number; // in all jars together
  targetKopecks: number | null; // the targets of the jars that have one, together; null when none has
  fill: number | null; // 0–1: what those jars hold, each up to its target, of their targets together
}

/**
 * How full the piggy is: the jars with a target against the sum of their targets (Егор 30.09.2026);
 * the cushion without a target counts only in the total saved.
 */
export function piggyFill(data: AppData, today: LocalDate): PiggyFill {
  const jars = jarsOf(data, today);
  const savedKopecks = sum(jars.map((j) => j.savedKopecks));
  const withTarget = jars.filter((j) => j.targetKopecks !== null && j.targetKopecks > 0);
  if (withTarget.length === 0) return { savedKopecks, targetKopecks: null, fill: null };
  const targetKopecks = sum(withTarget.map((j) => j.targetKopecks!));
  const held = sum(withTarget.map((j) => Math.min(j.savedKopecks, j.targetKopecks!)));
  return { savedKopecks, targetKopecks, fill: Math.min(1, held / targetKopecks) };
}

/** The first planned income from today on at which a percent rule brings `savedKopecks` to the target. */
function fullByIncomes(data: AppData, savedKopecks: number, targetKopecks: number, percent: number, since: LocalDate, today: LocalDate): LocalDate | null {
  let total = savedKopecks;
  for (const event of plannedEvents(data, today, addMonths(today, FORECAST_MONTHS))) {
    if (event.kind !== 'income' || event.done || event.date < since) continue;
    total += percentShare(event.amountKopecks, percent);
    if (total >= targetKopecks) return event.date;
  }
  return null;
}

/**
 * The day a jar reaches its target: the deadline for a deadline goal; the planned income (active
 * regular incomes, as in the calendar) or the scheduled day that fills it for a percent or scheduled
 * jar, up to three years ahead; today when it is already full. Null for a jar by hand, a fixed
 * cushion, a jar without a target and one that does not fill within three years.
 */
export function fillForecast(data: AppData, target: SavingsTarget, today: LocalDate): LocalDate | null {
  const jar = jarOf(data, target, today);
  if (!jar || jar.targetKopecks === null) return null;
  if (jar.savedKopecks >= jar.targetKopecks) return today;
  if ('cushion' in target) {
    const cushion = data.settings.cushion;
    return cushion.mode === 'percent' ? fullByIncomes(data, jar.savedKopecks, jar.targetKopecks, cushion.percent, cushion.sinceDate, today) : null;
  }
  const goal = goalOf(data, target)!;
  if (goal.deadline !== null) return goal.deadline;
  if (goal.percent !== null) return fullByIncomes(data, jar.savedKopecks, goal.targetKopecks, goal.percent, goal.startDate, today);
  if (goal.schedule === null || goal.schedule.amountKopecks <= 0) return null;
  let total = jar.savedKopecks;
  // Today's occurrence is already in what the goal holds.
  for (const date of goalScheduleDates(goal.schedule, addDays(today, 1), addMonths(today, FORECAST_MONTHS))) {
    total += goal.schedule.amountKopecks;
    if (total >= goal.targetKopecks) return date;
  }
  return null;
}

export const MILESTONES = [25, 50, 75, 100] as const;
export type Milestone = (typeof MILESTONES)[number];

/** The highest of 25 / 50 / 75 / 100 % a jar has reached; null below 25 % or without a target. */
export function milestone(progress: number | null): Milestone | null {
  if (progress === null) return null;
  return [...MILESTONES].reverse().find((m) => progress >= m / 100) ?? null;
}

// Moves

/** Everything of a move but the jar, the amount and the day: the app layer gives the id and time. */
export type MoveMeta = Pick<SavingsMove, 'id' | 'createdAt' | 'source' | 'transactionId'>;

function withMove(data: AppData, target: SavingsTarget, amountKopecks: number, date: LocalDate, meta: MoveMeta): AppData {
  const saved: SavingsMove = { ...meta, goalId: targetGoalId(target), amountKopecks, date };
  return { ...data, savingsMoves: [...data.savingsMoves, saved] };
}

/** What a jar can still take today: a goal what it needs to its target (0 unless active); the cushion has no cap. */
export function jarRoom(data: AppData, target: SavingsTarget, today: LocalDate): number {
  if ('cushion' in target) return Number.POSITIVE_INFINITY;
  const goal = goalOf(data, target);
  if (!goal || goal.status !== 'active') return 0;
  return Math.max(0, goal.targetKopecks - goalSavedBy(data, goal, today));
}

/**
 * «Положить»: no more than the jar still needs and than is free at every checkpoint of today, so
 * putting money in never ends in a shortfall.
 */
export function putInMax(data: AppData, target: SavingsTarget, today: LocalDate): number {
  const free = Math.min(...calculateDay(data, today).checkpoints.map((c) => c.freeKopecks));
  return Math.max(0, Math.min(jarRoom(data, target, today), free));
}

/**
 * «Забрать»: what the jar holds now. Nothing from a goal that is not active, and nothing from a deadline
 * goal on or after its deadline: its plan asks for the whole target then, so the money would come right back.
 */
export function takeOutMax(data: AppData, target: SavingsTarget, today: LocalDate): number {
  const goal = goalOf(data, target);
  if ('goalId' in target && (!goal || goal.status !== 'active' || (goal.deadline !== null && goal.deadline <= today))) return 0;
  return jarSavedBy(data, target, today);
}

/** Money put into a jar by a move dated `date`, no more than the jar still needs today. */
export function withDeposit(data: AppData, target: SavingsTarget, amountKopecks: number, date: LocalDate, today: LocalDate, meta: MoveMeta): AppData {
  const amount = Math.min(amountKopecks, jarRoom(data, target, today));
  return amount > 0 ? withMove(data, target, amount, date, meta) : data;
}

/**
 * Money taken out of a jar today, no more than it holds. A goal that is full on paper is first counted
 * afresh at its target (goalWithinTarget), so exactly the amount leaves it.
 */
export function withWithdrawal(data: AppData, target: SavingsTarget, amountKopecks: number, today: LocalDate, meta: MoveMeta): AppData {
  const amount = Math.min(amountKopecks, takeOutMax(data, target, today));
  if (amount <= 0) return data;
  const goal = goalOf(data, target);
  const within = goal && goalWithinTarget(data, goal, today);
  const next = goal && within !== goal ? { ...data, goals: data.goals.map((g) => (g.id === goal.id ? within! : g)) } : data;
  return withMove(next, target, -amount, today, meta);
}

// Rounding expenses up

/** The jar of `settings.roundUp`; null when rounding up is off. */
export function roundUpTarget(data: AppData): SavingsTarget | null {
  const roundUp = data.settings.roundUp;
  return roundUp === null ? null : targetOf(roundUp.goalId);
}

/** What rounds an expense up to whole BYN: 4,30 → 0,70; a whole sum → 0. */
export function roundUpRest(amountKopecks: number): number {
  return Math.ceil(amountKopecks / 100) * 100 - amountKopecks;
}

/**
 * The round-up of an expense that is already in `data`: the rest to whole BYN, no more than the jar can
 * take without a shortfall after the expense (putInMax). 0 for a goal that is not active or is full.
 */
export function roundUpKopecks(data: AppData, amountKopecks: number, target: SavingsTarget, today: LocalDate): number {
  const rest = roundUpRest(amountKopecks);
  return rest > 0 ? Math.min(rest, putInMax(data, target, today)) : 0;
}

// What a move does, for the line in the «Положить» / «Забрать» sheet

/** What a deadline goal takes a day from today on, as the plan counts it afresh on the day of a move. */
export function deadlineDailyKopecks(data: AppData, goal: Goal, today: LocalDate): number {
  if (goal.deadline === null) return 0;
  const daysLeft = daysInclusive(today, goal.deadline);
  if (daysLeft <= 0) return 0;
  const movedToday = sum(data.savingsMoves.filter((m) => m.goalId === goal.id && m.date === today).map((m) => m.amountKopecks));
  const base = goalUnclampedBy(data, goal, addDays(today, -1)) + movedToday;
  return Math.max(0, Math.ceil((goal.targetKopecks - base) / daysLeft));
}

export interface MoveEffect {
  amountKopecks: number; // what actually moves, within putInMax's room or takeOutMax
  limitKopecks: number; // today's daily limit after the move
  dailyKopecks: { before: number; after: number } | null; // a deadline goal: «в день будет уходить 3,10 вместо 2,80»
  fillDate: { before: LocalDate | null; after: LocalDate | null } | null; // a percent or scheduled jar: «наполнится позже»
}

const PREVIEW: MoveMeta = { id: 'preview', createdAt: '', source: 'manual', transactionId: null };

function moveEffect(before: AppData, after: AppData, target: SavingsTarget, today: LocalDate): MoveEffect {
  const goalBefore = goalOf(before, target);
  const goalAfter = goalOf(after, target);
  const moved = after.savingsMoves.length > before.savingsMoves.length ? after.savingsMoves[after.savingsMoves.length - 1]!.amountKopecks : 0;
  const cushion = before.settings.cushion;
  const forecasts =
    goalBefore === undefined
      ? cushion.mode === 'percent' && cushion.targetKopecks !== null
      : goalBefore.percent !== null || goalBefore.schedule !== null;
  return {
    amountKopecks: Math.abs(moved),
    limitKopecks: calculateDay(after, today).dailyLimitKopecks,
    dailyKopecks:
      goalBefore?.deadline != null && goalAfter
        ? { before: deadlineDailyKopecks(before, goalBefore, today), after: deadlineDailyKopecks(after, goalAfter, today) }
        : null,
    fillDate: forecasts ? { before: fillForecast(before, target, today), after: fillForecast(after, target, today) } : null,
  };
}

/** «Положить»: the daily limit after, and for a deadline goal the daily amount, for a percent or scheduled jar the fill date. */
export function depositEffect(data: AppData, target: SavingsTarget, amountKopecks: number, today: LocalDate): MoveEffect {
  return moveEffect(data, withDeposit(data, target, amountKopecks, today, today, PREVIEW), target, today);
}

/** «Забрать»: the warning before it, the same shape as depositEffect. */
export function withdrawEffect(data: AppData, target: SavingsTarget, amountKopecks: number, today: LocalDate): MoveEffect {
  return moveEffect(data, withWithdrawal(data, target, amountKopecks, today, { ...PREVIEW, source: 'withdraw' }), target, today);
}
