import type { SavingsTarget } from '../appData';
import { cushionSavedBy, goalSavedBy, type BudgetResult } from '../domain/budget';
import { addDays, diffDays } from '../domain/dates';
import { depositEffect } from '../domain/jars';
import { formatKopecks } from '../domain/money';
import { upcomingEvents } from '../domain/planned';
import { periodSavings, periodSummary, type IncomeSplit, type PeriodSummary } from '../domain/savings';
import type { AppData, IncomeSource, LocalDate, Transaction } from '../domain/types';
import type { FeatureKey } from '../uiState';
import { plural } from './labels';

// Update 1 «Копилка» on screen: percent rules, the savings ring, where leftover money goes and
// which savings card the home screen shows. Pure, so the choices are tested without a browser.

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

/** A sum inside a sentence, '15,00 BYN', that never breaks before «BYN». */
export function moneyInText(kopecks: number): string {
  return `${formatKopecks(kopecks)}\u00a0BYN`;
}

// Percent rules

/** A rule that sets aside a percent of every income: the percent cushion or an active percent goal. */
export interface PercentRule {
  goalId: string | null; // null for the cushion
  name: string;
  percent: number;
}

/** Together the rules must leave something to live on: at most 99 % of an income. */
export const MAX_TOTAL_PERCENT = 99;

/** The cushion first (when in percent mode), then active percent goals in the order of the data. */
export function percentRules(data: AppData): PercentRule[] {
  const cushion = data.settings.cushion;
  const rules: PercentRule[] = cushion.mode === 'percent' ? [{ goalId: null, name: 'Подушка', percent: cushion.percent }] : [];
  for (const goal of data.goals) {
    if (goal.status === 'active' && goal.percent !== null) rules.push({ goalId: goal.id, name: goal.name, percent: goal.percent });
  }
  return rules;
}

/** What is left «на жизнь» of every income, in percent. */
export function lifePercent(rules: PercentRule[]): number {
  return Math.max(0, 100 - sum(rules.map((r) => r.percent)));
}

/** The most one rule can take while `others` keep theirs; 0 or less when nothing is left. */
export function maxPercent(others: PercentRule[]): number {
  return MAX_TOTAL_PERCENT - sum(others.map((r) => r.percent));
}

/** «подушку», «Наушники», «подушку и «Наушники»», «цели»: where the other percents go. */
function destination(rules: PercentRule[]): string {
  const goals = rules.filter((r) => r.goalId !== null);
  const parts = [
    ...(rules.some((r) => r.goalId === null) ? ['подушку'] : []),
    ...(goals.length === 1 ? [`«${goals[0]!.name}»`] : goals.length > 1 ? ['цели'] : []),
  ];
  return parts.join(' и ');
}

/** Why a percent is too big, for the form's missing text. */
export function percentLimitText(others: PercentRule[]): string {
  const taken = sum(others.map((r) => r.percent));
  const max = maxPercent(others);
  return max >= 1
    ? `Можно не больше ${max}%: ещё ${taken}% уходит в ${destination(others)}`
    : `С поступлений уже уходит ${taken}% в ${destination(others)}. Уменьши там процент`;
}

/** A name inside a sentence: 'Наушники' -> 'наушники', while 'PS5' and 'iPhone' stay as typed. */
function inSentence(name: string): string {
  const second = name.charAt(1);
  const isLowerLetter = second !== '' && second === second.toLowerCase() && second !== second.toUpperCase();
  return isLowerLetter ? name.charAt(0).toLowerCase() + name.slice(1) : name;
}

/** «10% подушка · 15% наушники · 75% на жизнь» */
export function percentLine(rules: PercentRule[]): string {
  return [...rules.map((r) => `${r.percent}% ${inSentence(r.name)}`), `${lifePercent(rules)}% на жизнь`].join(' · ');
}

// The income the hints count with

const FROM_INCOME: Record<IncomeSource['kind'], string> = {
  scholarship: 'со стипендии',
  salary: 'с зарплаты',
  parents: 'с денег от родителей',
  other: 'с поступления',
};

export interface ReferenceIncome {
  source: IncomeSource;
  amountKopecks: number;
}

/** The main income, else the next planned one; null when nothing is planned. */
export function referenceIncome(data: AppData, today: LocalDate): ReferenceIncome | null {
  const main = data.incomeSources.find((s) => s.id === data.settings.mainIncomeSourceId && s.isActive);
  if (main && main.amountKopecks > 0) return { source: main, amountKopecks: main.amountKopecks };
  const next = upcomingEvents(data, today, Number.POSITIVE_INFINITY).find((e) => e.kind === 'income' && e.amountKopecks > 0);
  const source = next && data.incomeSources.find((s) => s.id === next.sourceId);
  return next && source ? { source, amountKopecks: next.amountKopecks } : null;
}

/** «со стипендии 220,00 BYN» */
export function fromIncomeText(income: ReferenceIncome): string {
  return `${FROM_INCOME[income.source.kind]} ${moneyInText(income.amountKopecks)}`;
}

// The split sheet after an income

/** The income an update has just recorded: in `after` and not in `before`. */
export function recordedIncome(before: AppData, after: AppData): Transaction | null {
  const known = new Set(before.transactions.map((t) => t.id));
  return after.transactions.find((t) => t.type === 'income' && !known.has(t.id)) ?? null;
}

/** What an income put into savings: the cushion's and the goals' shares. */
export function savedShares(split: IncomeSplit): number {
  return split.cushionKopecks + sum(split.goals.map((g) => g.kopecks));
}

/** «Стипендия 300,00 BYN разложилась», agreeing with the kind of income as the banner question does. */
export function splitTitle(source: IncomeSource | undefined, amountKopecks: number): string {
  const amount = moneyInText(amountKopecks);
  switch (source?.kind) {
    case 'scholarship':
    case 'salary':
      return `${source.name} ${amount} разложилась`;
    case 'parents':
      return `Деньги от родителей ${amount} разложились`;
    case 'other':
      return `Поступление «${source.name}» ${amount} разложилось`;
    case undefined:
      return `Доход ${amount} разложился`;
  }
}

// The savings ring

export interface SavingsRing {
  savedKopecks: number;
  plannedKopecks: number;
  fraction: number; // saved ÷ planned, 0..1
}

/** The thin outer ring: what the period saved of what it plans. Null when nothing is planned. */
export function savingsRing(data: AppData, today: LocalDate): SavingsRing | null {
  const { savedKopecks, plannedKopecks } = periodSavings(data, today);
  if (plannedKopecks <= 0) return null;
  return { savedKopecks, plannedKopecks, fraction: Math.min(1, Math.max(0, savedKopecks / plannedKopecks)) };
}

/** Whole BYN for a glance, like the goal cards: 4568 -> '45'. */
export function wholeMoney(kopecks: number): string {
  return formatKopecks(Math.floor(kopecks / 100) * 100).slice(0, -3);
}

/** Without zero kopecks: 4500 -> '45', 751 -> '7,51'. */
export function shortMoney(kopecks: number): string {
  return kopecks % 100 === 0 ? wholeMoney(kopecks) : formatKopecks(kopecks);
}

// Setting leftover money aside

export interface TargetOption {
  key: string; // the goal's id or 'cushion'
  target: SavingsTarget;
  name: string;
  roomKopecks: number | null; // how much more it takes; null for the cushion
}

/** «в «Наушники»», «в подушку» */
export function intoTarget(option: TargetOption): string {
  return option.roomKopecks === null ? 'в подушку' : `в «${option.name}»`;
}

/**
 * Where leftover money can go: active goals that still need money, then the cushion when it is in
 * use (a percent one, one with a target or holding money). A student who keeps no savings is not asked.
 */
export function targetOptions(data: AppData, today: LocalDate): TargetOption[] {
  const options: TargetOption[] = [];
  for (const goal of data.goals) {
    const room = goal.targetKopecks - goalSavedBy(data, goal, today);
    if (goal.status === 'active' && room > 0) options.push({ key: goal.id, target: { goalId: goal.id }, name: goal.name, roomKopecks: room });
  }
  const cushion = data.settings.cushion;
  if (cushion.mode === 'percent' || cushion.targetKopecks !== null || cushionSavedBy(data, today) > 0) {
    options.push({ key: 'cushion', target: { cushion: true }, name: 'Подушка', roomKopecks: null });
  }
  return options;
}

/**
 * How much of `offeredKopecks` goes to the option: no more than it still needs and than is free at
 * every checkpoint, so setting money aside never ends in a shortfall (it cannot be taken back from a goal).
 */
export function setAsideAmount(budget: BudgetResult, option: TargetOption, offeredKopecks: number): number {
  const free = Math.min(...budget.checkpoints.map((c) => c.freeKopecks));
  return Math.max(0, Math.min(offeredKopecks, free, option.roomKopecks ?? Number.POSITIVE_INFINITY));
}

/** The daily limit once the amount is set aside, for the line above the button. */
export function limitAfterSetAside(data: AppData, option: TargetOption, amountKopecks: number, today: LocalDate): number {
  return depositEffect(data, option.target, amountKopecks, today).limitKopecks;
}

// «Положить» and «Забрать» in «Копилка» (update 2): the most each can move. Defined next to the moves
// in src/domain/jars.ts, because rounding an expense up is limited the same way.

export { putInMax, takeOutMax } from '../domain/jars';

// Which savings card the home screen shows

/** hiddenBanners key of the leftover card: «Не сейчас» hides it until tomorrow. */
export function leftoverKey(yesterday: LocalDate): string {
  return `leftover|${yesterday}`;
}

/** hiddenBanners key that hides «+8,00 с вчера» once that money is set aside: it is not free any more. */
export function carrySavedKey(yesterday: LocalDate): string {
  return `carry-saved|${yesterday}`;
}

/** dismissedCards key of «Итоги периода»: closed for good for that period. */
export function summaryKey(summary: PeriodSummary): string {
  return `summary|${summary.period.start}`;
}

/** «Итоги периода» show during the first days of a new period. */
export const SUMMARY_DAYS = 3;

export type SavingsCard =
  | { kind: 'summary'; key: string; summary: PeriodSummary }
  | { kind: 'leftover'; key: string; carryKopecks: number };

export interface SavingsCardContext {
  data: AppData;
  budget: BudgetResult;
  today: LocalDate;
  feature: (key: FeatureKey) => boolean;
  isBannerHidden: (key: string) => boolean;
  isCardDismissed: (key: string) => boolean;
}

/**
 * One savings card at a time (a confirmation banner, when there is one, goes before both):
 * «Итоги периода» in the first days of a period until closed, then yesterday's leftover while
 * there is somewhere to put it and it was not put off till tomorrow.
 */
export function pickSavingsCard({ data, budget, today, feature, isBannerHidden, isCardDismissed }: SavingsCardContext): SavingsCard | null {
  if (feature('periodSummary') && diffDays(budget.period.start, today) < SUMMARY_DAYS) {
    const summary = periodSummary(data, today);
    const worthShowing = summary !== null && (summary.daysTracked > 0 || summary.savedKopecks > 0 || summary.leftoverKopecks > 0);
    if (worthShowing && !isCardDismissed(summaryKey(summary))) return { kind: 'summary', key: summaryKey(summary), summary };
  }
  const carry = budget.carryFromYesterdayKopecks;
  const key = leftoverKey(addDays(today, -1));
  if (!feature('leftover') || carry === null || carry <= 0 || isBannerHidden(key)) return null;
  const somewhere = targetOptions(data, today).some((option) => setAsideAmount(budget, option, carry) > 0);
  return somewhere ? { kind: 'leftover', key, carryKopecks: carry } : null;
}

/** «В лимите 22 из 30 дней, отложено 90,00 BYN, осталось 14,00 BYN» */
export function summaryText(summary: PeriodSummary): string {
  const parts: string[] = [];
  if (summary.daysTracked > 0) {
    parts.push(`в лимите ${summary.daysInLimit} из ${summary.daysTracked} ${plural(summary.daysTracked, 'дня', 'дней', 'дней')}`);
  }
  if (summary.savedKopecks > 0) parts.push(`отложено ${moneyInText(summary.savedKopecks)}`);
  parts.push(`осталось ${moneyInText(summary.leftoverKopecks)}`);
  const text = parts.join(', ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}
