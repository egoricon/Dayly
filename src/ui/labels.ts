import { addDays, diffDays } from '../domain/dates';
import type { BudgetResult } from '../domain/budget';
import type { AppData, IncomeSource, LocalDate } from '../domain/types';

const UNTIL_INCOME: Record<IncomeSource['kind'], string> = {
  scholarship: 'до стипендии',
  salary: 'до зарплаты',
  parents: 'до денег от родителей',
  other: 'до поступления',
};

const WEEKDAYS = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const MONTHS_GENITIVE = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];

function parse(date: LocalDate): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!));
}

/** '2026-10-05' -> '5 октября' */
export function formatDayMonth(date: LocalDate): string {
  const d = parse(date);
  return `${d.getUTCDate()} ${MONTHS_GENITIVE[d.getUTCMonth()]}`;
}

/** '2026-09-26' -> 'Сб, 26 сентября' */
export function formatDayHeader(date: LocalDate): string {
  return `${WEEKDAYS[parse(date).getUTCDay()]}, ${formatDayMonth(date)}`;
}

/** History day header: 'Сегодня', 'Вчера, пт', '24 сентября, чт' */
export function formatHistoryDay(date: LocalDate, today: LocalDate): string {
  if (date === today) return 'Сегодня';
  const weekday = WEEKDAYS[parse(date).getUTCDay()]!.toLowerCase();
  if (date === addDays(today, -1)) return `Вчера, ${weekday}`;
  const year = date.slice(0, 4) === today.slice(0, 4) ? '' : ` ${date.slice(0, 4)}`;
  return `${formatDayMonth(date)}${year}, ${weekday}`;
}

/** When an operation was entered, for the home list: '09:12', 'вчера, 09:12', '24 сентября, 09:12'. */
export function formatOperationTime(date: LocalDate, createdAt: string, today: LocalDate): string {
  const time = formatTime(createdAt);
  if (date === today) return time;
  if (date === addDays(today, -1)) return `вчера, ${time}`;
  return `${formatDayMonth(date)}, ${time}`;
}

/** Local time of an ISO timestamp: '09:12' */
export function formatTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** 'до стипендии', 'до зарплаты'…; without a source — the end of the calendar month. */
export function untilIncome(source: IncomeSource | undefined): string {
  return source ? UNTIL_INCOME[source.kind] : 'до конца месяца';
}

/** Right side of the home header: 'до стипендии 9 дн.' */
export function untilPeriodEnd(data: AppData, budget: BudgetResult): string {
  const main = data.incomeSources.find((s) => s.id === data.settings.mainIncomeSourceId);
  const days = diffDays(budget.today, addDays(budget.period.end, 1));
  const label = untilIncome(main);
  return `${label} ${days} дн.`;
}

/** Weekday 1 = Monday … 7 = Sunday, short: 'Пн'. */
export const WEEKDAY_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const WEEKDAY_EVERY = ['по понедельникам', 'по вторникам', 'по средам', 'по четвергам', 'по пятницам', 'по субботам', 'по воскресеньям'];

/** How often an income comes: '5-го', 'по пятницам', 'нерегулярно'. */
export function incomeScheduleText(source: { dayOfMonth: number | null; weekday: number | null }): string {
  if (source.weekday !== null) return WEEKDAY_EVERY[source.weekday - 1]!;
  if (source.dayOfMonth !== null) return `${source.dayOfMonth}-го`;
  return 'нерегулярно';
}

const MONTHS_NOMINATIVE = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
];

/** 10 -> 'Октябрь' */
export function monthName(month: number): string {
  return MONTHS_NOMINATIVE[month - 1]!;
}

/** Russian plural: plural(5, 'день', 'дня', 'дней') -> 'дней' */
export function plural(n: number, one: string, few: string, many: string): string {
  const n10 = Math.abs(n) % 10;
  const n100 = Math.abs(n) % 100;
  if (n10 === 1 && n100 !== 11) return one;
  if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return few;
  return many;
}

/** 9 -> '9 дней' */
export function formatDays(n: number): string {
  return `${n} ${plural(n, 'день', 'дня', 'дней')}`;
}
