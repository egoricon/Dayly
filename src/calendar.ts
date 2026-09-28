import type { BudgetResult } from './domain/budget';
import { addDays, daysInMonth, isRegular, makeDate, maxDate, weekdayIndex, type Schedule } from './domain/dates';
import { forecastDailyLimits } from './domain/forecast';
import { dayResults, type DayStatus } from './domain/history';
import { formatKopecks, formatMoney } from './domain/money';
import { plannedEvents, type PlannedEvent } from './domain/planned';
import type { AppData, LocalDate } from './domain/types';
import { formatDayMonth, scheduleText } from './ui/labels';

// «Календарь» (update 1): the month grid with dots for planned incomes and payments, past days
// tinted by how they went, and the numbers line of a day's sheet. Pure, like src/events.ts.

/** The month a date belongs to, as its first day: '2026-10-13' -> '2026-10-01'. */
export function monthOf(date: LocalDate): LocalDate {
  return `${date.slice(0, 7)}-01`;
}

function lastDayOf(month: LocalDate): LocalDate {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return makeDate(y, m, daysInMonth(y, m));
}

/** The days of a month in whole weeks from Monday; null pads the first and the last week. */
export function monthCells(month: LocalDate): (LocalDate | null)[] {
  const cells: (LocalDate | null)[] = Array.from({ length: weekdayIndex(month) }, () => null);
  for (let date = month, last = lastDayOf(month); date <= last; date = addDays(date, 1)) cells.push(date);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

/** A dot under a day: green for incomes, red for payments; calmer once done (came or paid). */
export interface EventDot {
  kind: PlannedEvent['kind'];
  done: boolean; // every event of this kind on the day is done
}

/** One dot per kind, incomes first: the grid shows that money comes or goes, the sheet shows how much. */
export function eventDots(events: PlannedEvent[]): EventDot[] {
  return (['income', 'payment'] as const).flatMap((kind) => {
    const ofKind = events.filter((e) => e.kind === kind);
    return ofKind.length === 0 ? [] : [{ kind, done: ofKind.every((e) => e.done) }];
  });
}

export interface CalendarDay {
  date: LocalDate;
  isToday: boolean;
  /** Past days since the start of tracking: within the day's limit or over it; null for today and later. */
  result: DayStatus | null;
  dots: EventDot[];
}

/** Every day of the month with its dots and, for past days, whether it stayed within the limit. */
export function calendarMonth(data: AppData, today: LocalDate, month: LocalDate): CalendarDay[] {
  const last = lastDayOf(month);
  const events = new Map<LocalDate, PlannedEvent[]>();
  for (const event of plannedEvents(data, month, last)) events.set(event.date, [...(events.get(event.date) ?? []), event]);
  const from = maxDate(month, data.settings.trackingStartDate);
  const yesterday = addDays(today, -1);
  const to = last < yesterday ? last : yesterday;
  const results = new Map(from <= to ? dayResults(data, from, to).map((r) => [r.date, r.status]) : []);
  return monthCells(month)
    .filter((date): date is LocalDate => date !== null)
    .map((date) => ({ date, isToday: date === today, result: results.get(date) ?? null, dots: eventDots(events.get(date) ?? []) }));
}

/**
 * What a screen reader says for a day cell: '13 октября, доход, расход'. Today is announced by
 * aria-current, so no button besides the tab is named «Сегодня».
 */
export function dayLabel(day: CalendarDay): string {
  const parts = [formatDayMonth(day.date)];
  for (const dot of day.dots) parts.push(dot.kind === 'income' ? 'доход' : 'расход');
  if (day.result === 'in') parts.push('в лимите');
  if (day.result === 'over') parts.push('перерасход');
  return parts.join(', ');
}

/** Whether anything is planned at all; an empty calendar hints how to add something. */
export function hasPlans(data: AppData): boolean {
  return data.incomeSources.some((s) => s.isActive && isRegular(s)) || data.payments.some((p) => p.isActive);
}

/** The line under a day's date in its sheet. */
export interface DayLine {
  text: string;
  danger: boolean;
}

/** «Прогноз: около 27 BYN в день»: whole BYN, rounded down like the limit itself. */
export function forecastText(limitKopecks: number): string {
  if (limitKopecks === 0) return 'Прогноз: 0 BYN в день';
  if (limitKopecks < 100) return 'Прогноз: меньше 1 BYN в день';
  return `Прогноз: около ${Math.floor(limitKopecks / 100)} BYN в день`;
}

/**
 * How the day went (past), what is left of today's limit (today) or the forecast limit (future):
 * «Лимит 27,50 · потрачено 12,00», «Сегодня осталось 18,50 из 27,00», «Прогноз: около 27 BYN в день».
 */
export function dayLine(data: AppData, budget: BudgetResult, date: LocalDate): DayLine {
  const today = budget.today;
  if (date === today) {
    if (budget.status === 'deficit' && budget.shortfall) {
      return { text: `Не хватает ${formatMoney(budget.shortfall.amountKopecks)} до ${formatDayMonth(budget.shortfall.until)}`, danger: true };
    }
    if (budget.remainingTodayKopecks < 0) {
      return { text: `Сегодня перерасход ${formatKopecks(-budget.remainingTodayKopecks)} · лимит ${formatKopecks(budget.dailyLimitKopecks)}`, danger: true };
    }
    return { text: `Сегодня осталось ${formatKopecks(budget.remainingTodayKopecks)} из ${formatKopecks(budget.dailyLimitKopecks)}`, danger: false };
  }
  if (date > today) {
    const forecast = forecastDailyLimits(data, today, date).at(-1);
    return { text: forecast ? forecastText(forecast.limitKopecks) : '', danger: false };
  }
  if (date < data.settings.trackingStartDate) {
    return { text: `Учёт идёт с ${formatDayMonth(data.settings.trackingStartDate)}`, danger: false };
  }
  const [day] = dayResults(data, date, date);
  const spent = formatKopecks(day!.spentFromLimitKopecks);
  if (day!.dailyLimitKopecks === null) {
    return { text: day!.spentFromLimitKopecks > 0 ? `Потрачено ${spent}` : 'В этот день приложение не открывалось', danger: false };
  }
  return { text: `Лимит ${formatKopecks(day!.dailyLimitKopecks)} · потрачено ${spent}`, danger: day!.status === 'over' };
}

/** How an event repeats, in its row of the day sheet: 'каждый месяц, 13-го', 'по понедельникам', 'разово'. */
export function repeatText(schedule: Schedule): string {
  if (schedule.weekday !== null) return scheduleText(schedule);
  if (schedule.dayOfMonth !== null) return `каждый месяц, ${schedule.dayOfMonth}-го`;
  return 'разово';
}

/** 'получено' / 'оплачено' once done; a past one still waiting: 'не отмечено' / 'не оплачено'. */
export function eventStatus(event: PlannedEvent, today: LocalDate): string | null {
  if (event.done) return event.kind === 'income' ? 'получено' : 'оплачено';
  if (event.date < today) return event.kind === 'income' ? 'не отмечено' : 'не оплачено';
  return null;
}

/** '+220,00' for an income, '−45,00' for a payment. */
export function eventAmount(event: PlannedEvent): string {
  return `${event.kind === 'income' ? '+' : '−'}${formatKopecks(event.amountKopecks)}`;
}
