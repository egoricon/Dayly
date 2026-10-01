import { transactionName } from '../components/TransactionRow';
import type { BudgetResult } from '../domain/budget';
import { categoryName } from '../domain/categories';
import { diffDays, weekdayIndex } from '../domain/dates';
import type { LimitLever } from '../domain/levers';
import { formatKopecks, formatMoney } from '../domain/money';
import type { PlannedEvent } from '../domain/planned';
import type { AppData, LocalDate, Transaction } from '../domain/types';
import { formatDayMonth, plural, WEEKDAY_SHORT } from './labels';

// Texts and thresholds of the home screen in update 1: the early warning of the ring, «Завтра будет…»,
// the target daily limit and «Как дотянуть», the week strip, «Ближайшее» and «Отменить».

/** Money without «,00» for whole BYN: 30000 → '300', 1250 → '12,50', 102000 → '1 020'. */
export function compactKopecks(kopecks: number): string {
  return formatKopecks(kopecks).replace(/,00$/, '');
}

// The ring warns early

/** The ring turns yellow when less than this share of today's limit is left, i.e. more than 80 % is spent. */
export const LOW_LEFT_PERCENT = 20;

/** More than 80 % of today's limit is spent, up to all of it; never when overspent or short of money. */
export function isRunningLow(budget: BudgetResult): boolean {
  const left = budget.remainingTodayKopecks;
  const limit = budget.dailyLimitKopecks;
  return budget.status === 'ok' && limit > 0 && left >= 0 && left * 100 < limit * LOW_LEFT_PERCENT;
}

/** The label over the number while the ring is yellow: «Осталось меньше 20%», and «На сегодня всё» at 0,00. */
export function runningLowLabel(budget: BudgetResult): string {
  return budget.remainingTodayKopecks === 0 ? 'На сегодня всё' : `Осталось меньше ${LOW_LEFT_PERCENT}%`;
}

export type RingTone = 'accent' | 'warning' | 'danger';

/** Red when overspent or short of money; yellow when running low and «Жёлтое кольцо на 80%» is on. */
export function ringTone(budget: BudgetResult, earlyWarning: boolean): RingTone {
  if (budget.status === 'deficit' || budget.remainingTodayKopecks < 0) return 'danger';
  return earlyWarning && isRunningLow(budget) ? 'warning' : 'accent';
}

/**
 * What the ring says to a screen reader, the state and the amount in one phrase: «Сегодня можно 28,54 BYN»,
 * «Сегодня перерасход 3,20 BYN», «Не хватает денег 12,00 BYN до 5 октября». The ring adds what a tap does.
 */
export function ringLabel(budget: BudgetResult, tone: RingTone): string {
  if (budget.status === 'deficit' && budget.shortfall) {
    return `Не хватает денег ${formatMoney(budget.shortfall.amountKopecks)} до ${formatDayMonth(budget.shortfall.until)}`;
  }
  const left = budget.remainingTodayKopecks;
  if (left < 0) return `Сегодня перерасход ${formatMoney(-left)}`;
  if (tone === 'warning') return left === 0 ? `На сегодня всё, осталось ${formatMoney(0)}` : `${runningLowLabel(budget)}: сегодня можно ${formatMoney(left)}`;
  return `Сегодня можно ${formatMoney(left)}`;
}

// «Завтра будет…»

export interface TomorrowIfStopped {
  limitKopecks: number; // tomorrow's limit if nothing more is spent today
  deltaKopecks: number; // against today's limit
}

/** Tomorrow's limit if the student stops now; only while money is left today and there is no deficit. */
export function tomorrowIfStopped(budget: BudgetResult): TomorrowIfStopped | null {
  if (budget.status !== 'ok' || budget.remainingTodayKopecks <= 0) return null;
  return { limitKopecks: budget.tomorrowLimitKopecks, deltaKopecks: budget.tomorrowLimitKopecks - budget.dailyLimitKopecks };
}

/** «(+3,70)» when tomorrow is more than today, else nothing. */
export function tomorrowGain(tomorrow: TomorrowIfStopped): string {
  return tomorrow.deltaKopecks > 0 ? `(+${formatKopecks(tomorrow.deltaKopecks)})` : '';
}

// «Хочу тратить N в день»

/** How much today's limit is below the target; 0 once it is reached. Null without a target. */
export function targetShortfall(data: AppData, budget: BudgetResult): number | null {
  const target = data.settings.targetDailyLimitKopecks;
  return target === null ? null : Math.max(0, target - budget.dailyLimitKopecks);
}

export interface TargetLineInfo {
  reached: boolean;
  text: string;
}

/**
 * The home line about the target: «До 30,00 BYN в день не хватает 4,20» (it opens «Как дотянуть»), or
 * «Цель 30,00 BYN в день достигнута» on a day that is not overspent. None without a target and when
 * short of money: the deficit hints come first then.
 */
export function targetLine(data: AppData, budget: BudgetResult): TargetLineInfo | null {
  const target = data.settings.targetDailyLimitKopecks;
  const short = targetShortfall(data, budget);
  if (target === null || short === null || budget.status === 'deficit') return null;
  if (short > 0) return { reached: false, text: `До ${formatMoney(target)} в день не хватает ${formatKopecks(short)}` };
  return budget.remainingTodayKopecks < 0 ? null : { reached: true, text: `Цель ${formatMoney(target)} в день достигнута` };
}

/** '20 декабря', with the year when it is not this year: '20 января 2027'. */
function dayMonthYear(date: LocalDate, today: LocalDate): string {
  return date.slice(0, 4) === today.slice(0, 4) ? formatDayMonth(date) : `${formatDayMonth(date)} ${date.slice(0, 4)}`;
}

/** A lever of «Как дотянуть» in plain words: «Резерв «Продукты» 450 вместо 500». */
export function leverTitle(lever: LimitLever, data: AppData, today: LocalDate): string {
  const goal = () => data.goals.find((g) => g.id === lever.targetId)?.name ?? 'цель';
  switch (lever.kind) {
    case 'goalDeadline':
      return `Сдвинуть «${goal()}» на ${dayMonthYear(lever.newValue, today)}`;
    case 'goalPercent':
      return `Откладывать на «${goal()}» ${lever.newValue}% вместо ${lever.oldValue}%`;
    case 'reserve':
      return `Резерв «${categoryName(data, lever.targetId)}» ${compactKopecks(lever.newValue)} вместо ${compactKopecks(lever.oldValue)}`;
    case 'cushion':
      return lever.mode === 'fixed'
        ? `Подушка ${compactKopecks(lever.newValue)} вместо ${compactKopecks(lever.oldValue)}`
        : `Откладывать в подушку ${lever.newValue}% вместо ${lever.oldValue}%`;
  }
}

/** What a lever does to today's limit: «+1,67 в день · станет 30,21». */
export function leverEffect(lever: LimitLever): string {
  return `+${formatKopecks(lever.deltaKopecks)} в день · станет ${formatKopecks(lever.newLimitKopecks)}`;
}

// The week strip

/** «В лимите 3 дня подряд»; «Вчера в лимите» for one day; nothing without a streak. */
export function streakText(days: number): string | null {
  if (days <= 0) return null;
  if (days === 1) return 'Вчера в лимите';
  return `В лимите ${days} ${plural(days, 'день', 'дня', 'дней')} подряд`;
}

// «Ближайшее»

const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

/** When an upcoming event is: 'Сегодня', 'Завтра', a weekday within a week ('Пт') or the date ('5 окт'). */
export function upcomingDay(date: LocalDate, today: LocalDate): string {
  const days = diffDays(today, date);
  if (days === 0) return 'Сегодня';
  if (days === 1) return 'Завтра';
  if (days > 1 && days < 7) return WEEKDAY_SHORT[weekdayIndex(date)]!;
  return `${Number(date.slice(8, 10))} ${MONTHS_SHORT[Number(date.slice(5, 7)) - 1]}`;
}

export interface UpcomingItem {
  date: LocalDate;
  day: string | null; // null when it is the same day as the item before
  text: string; // «Стипендия +300», «Общежитие −120»
}

function eventText(event: PlannedEvent, data: AppData): string {
  const name =
    event.kind === 'income'
      ? (data.incomeSources.find((s) => s.id === event.sourceId)?.name ?? 'Доход')
      : (data.payments.find((p) => p.id === event.sourceId)?.name ?? 'Платёж');
  return `${name} ${event.kind === 'income' ? '+' : '−'}${compactKopecks(event.amountKopecks)}`;
}

/** The line as one text: «Пт: Стипендия +300 · 5 окт: Общежитие −120». */
export function upcomingText(items: UpcomingItem[]): string {
  return items.map((item) => (item.day === null ? item.text : `${item.day}: ${item.text}`)).join(' · ');
}

/** «Ближайшее» from planned events in date order; an event on the same day as the one before goes without its day. */
export function upcomingItems(events: PlannedEvent[], data: AppData, today: LocalDate): UpcomingItem[] {
  return events.map((event, i) => ({
    date: event.date,
    day: i > 0 && events[i - 1]!.date === event.date ? null : upcomingDay(event.date, today),
    text: eventText(event, data),
  }));
}

// «Отменить»

/** The operation that saving the input sheet added (a new expense or income); null for an edit. */
export function addedTransaction(before: AppData, after: AppData): Transaction | null {
  const known = new Set(before.transactions.map((t) => t.id));
  return after.transactions.find((t) => !known.has(t.id)) ?? null;
}

/** What «Отменить» takes back: «Кафе −4,50», «Стипендия +220,00», «Кафе −4,50 · вчера» for a forgotten one. */
export function undoText(t: Transaction, data: AppData, today: LocalDate = t.date): string {
  const text = `${transactionName(t, data)} ${t.type === 'expense' ? '−' : '+'}${formatKopecks(t.amountKopecks)}`;
  return t.date < today ? `${text} · вчера` : text;
}
