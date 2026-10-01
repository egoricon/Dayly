import { createInitialData, type OnboardingResult } from './appData';
import { calculateBudget, type BudgetResult } from './domain/budget';
import { addDays, daysInclusive, diffDays, weekdayIndex } from './domain/dates';
import { recentOperations } from './domain/history';
import { formatMoney } from './domain/money';
import type { AppData, LocalDate, Transaction } from './domain/types';
import { formatDayMonth, formatDays, scheduleText } from './ui/labels';
import { LESSONS_KNOWN_BEFORE_UPDATE_2, WHATS_NEW_ID, type FeatureKey, type FirstWeekState, type LessonId, type UiState } from './uiState';

// Getting to know the app. Update 1: the first setup and «Что нового». Update 2 («Знакомство»,
// reports/update-2-full-map.md, section 3): hints at the moment something first happens, «Первая неделя»,
// «Сохрани копию» and one card under the ring. Every decision here is pure; the screens only show it.

/** «Что нового» on the home screen: for people who used the app before this update, until they close it. */
export function shouldShowWhatsNew(state: UiState, hasData: boolean): boolean {
  return hasData && state.whatsNewSeen !== WHATS_NEW_ID;
}

/**
 * After the first setup: «Что нового» is not for a new person; the hints start from the ring, and
 * «Первая неделя» remembers what the setup planned, so only what comes later ticks «календарь».
 */
export function afterFirstSetup(state: UiState, data: AppData, today: LocalDate): UiState {
  return {
    ...state,
    whatsNewSeen: WHATS_NEW_ID,
    lessonsSeen: [],
    firstWeek: {
      startedOn: today,
      dismissed: false,
      seenExplain: false,
      setupPlanIds: [...data.incomeSources, ...data.payments].map((x) => x.id),
      completedOn: null,
    },
  };
}

/**
 * The state a launch starts with. A new person gets «Что нового» marked seen when the first setup
 * completes, so data without it predates update 1: that person knows the app, and only the hints
 * about what is new in update 2 are left for them.
 */
export function atLaunch(state: UiState, hasData: boolean): UiState {
  if (!hasData || state.whatsNewSeen !== null || state.tipsShown) return state;
  return { ...state, tipsShown: true, lessonsSeen: withLessons(state.lessonsSeen, LESSONS_KNOWN_BEFORE_UPDATE_2) };
}

function withLessons(seen: LessonId[], ids: LessonId[]): LessonId[] {
  return [...seen, ...ids.filter((id) => !seen.includes(id))];
}

export function markLessonSeen(state: UiState, id: LessonId): UiState {
  return state.lessonsSeen.includes(id) ? state : { ...state, lessonsSeen: [...state.lessonsSeen, id] };
}

/** «Первая неделя» stays this many days after the first setup. */
export const FIRST_WEEK_DAYS = 14;

/**
 * «Начать знакомство заново»: every hint again, when it is next useful, and «Первая неделя» back if
 * the first setup was less than FIRST_WEEK_DAYS ago.
 */
export function restartIntro(state: UiState, today: LocalDate): UiState {
  const week = state.firstWeek;
  const recent = week.startedOn !== null && diffDays(week.startedOn, today) < FIRST_WEEK_DAYS;
  return { ...state, lessonsSeen: [], firstWeek: recent ? { ...week, dismissed: false, completedOn: null } : week };
}

// Hints (3.1): one at a time, each once, next to what it explains.

/** A page of «Как устроен Dayly» that «Подробнее» on a hint opens. */
export type GuideSection = 'limit' | 'reserves' | 'carry' | 'savings' | 'calendar' | 'data';

/** What a hint points at; LessonHint finds it on the screen. */
export type LessonTarget =
  | { kind: 'ring' }
  | { kind: 'row'; transactionId: string }
  | { kind: 'banner' }
  | { kind: 'leftoverCard' }
  | { kind: 'summaryCard' }
  | { kind: 'deficitHints' }
  | { kind: 'piggy' }
  | { kind: 'calendar' };

export interface Lesson {
  id: LessonId;
  text: string;
  target: LessonTarget;
  more: GuideSection | null;
}

/** What the home screen shows above the ring right now: a confirmation banner or a savings card. */
export interface HomeLessonContext {
  banner: 'income' | 'payment' | null;
  savingsCard: { kind: 'leftover' } | { kind: 'summary'; leftoverKopecks: number } | null;
}

/** The day the money has to last to: the next main income, or the day after the period. */
function lastsUntil(budget: BudgetResult): LocalDate {
  return addDays(budget.period.end, 1);
}

const TAP_ROW_TEXT = 'Нажми на трату, чтобы изменить или удалить';

function newestExpense(transactions: Transaction[]): Transaction | null {
  const expenses = transactions.filter((t) => t.type === 'expense');
  expenses.sort((a, b) => (a.date !== b.date ? (a.date < b.date ? 1 : -1) : a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
  return expenses[0] ?? null;
}

/**
 * The hint the home screen shows now, or null. The most pressing event goes first: a banner waits for
 * an answer, a deficit or the end of a period changes everything, then today's ring.
 */
export function pickHomeLesson(data: AppData, budget: BudgetResult, today: LocalDate, seen: LessonId[], context: HomeLessonContext): Lesson | null {
  const candidates = homeLessons(data, budget, today, context);
  return candidates.find((lesson) => !seen.includes(lesson.id)) ?? null;
}

function homeLessons(data: AppData, budget: BudgetResult, today: LocalDate, { banner, savingsCard }: HomeLessonContext): Lesson[] {
  const lessons: Lesson[] = [];
  const ok = budget.status === 'ok';
  const overspent = ok && budget.remainingTodayKopecks < 0;
  if (banner === 'income') {
    lessons.push({ id: 'banner', text: 'Отметь, когда деньги придут: без этого я не знаю, что они уже у тебя', target: { kind: 'banner' }, more: 'calendar' });
  } else if (banner === 'payment') {
    lessons.push({ id: 'banner', text: 'Отметь, когда оплатишь: до этого деньги на платёж я держу в стороне', target: { kind: 'banner' }, more: 'calendar' });
  }
  if (budget.status === 'deficit' && budget.shortfall) {
    lessons.push({
      id: 'deficit',
      text: `До ${formatDayMonth(budget.shortfall.until)} не хватает ${formatMoney(budget.shortfall.amountKopecks)}, поэтому лимит пока 0. Вот что можно сделать`,
      target: { kind: 'deficitHints' },
      more: 'limit',
    });
  }
  if (savingsCard?.kind === 'summary') {
    lessons.push({
      id: 'periodEnd',
      text:
        savingsCard.leftoverKopecks > 0
          ? 'Так прошёл твой первый период. Остаток можно отправить в копилку'
          : 'Так прошёл твой первый период. Новый лимит считается до следующего поступления',
      target: { kind: 'summaryCard' },
      more: 'savings',
    });
  }
  if (savingsCard?.kind === 'leftover') {
    lessons.push({
      id: 'leftover',
      text: 'Остаток можно отложить в копилку или оставить — тогда лимит на следующие дни чуть вырастет',
      target: { kind: 'leftoverCard' },
      more: 'carry',
    });
  }
  if (overspent) {
    lessons.push({
      id: 'overspend',
      text: `Ничего страшного: перерасход разойдётся по оставшимся дням. Завтра можно ${formatMoney(budget.tomorrowLimitKopecks)}`,
      target: { kind: 'ring' },
      more: 'carry',
    });
  }
  if (ok && !overspent) {
    lessons.push({
      id: 'ring',
      text: `Это твоя сумма на сегодня. Тратишь не больше — денег хватит до ${formatDayMonth(lastsUntil(budget))}. Нажми на круг, покажу, как считается`,
      target: { kind: 'ring' },
      more: 'limit',
    });
    if (data.transactions.some((t) => t.type === 'expense' && t.date === today)) {
      lessons.push({
        id: 'firstExpense',
        text:
          budget.remainingTodayKopecks > 0
            ? `Осталось ${formatMoney(budget.remainingTodayKopecks)}. Не потратишь сегодня — завтра можно будет больше`
            : `Лимит на сегодня потрачен ровно. Завтра снова можно ${formatMoney(budget.tomorrowLimitKopecks)}`,
        target: { kind: 'ring' },
        more: 'carry',
      });
    }
  }
  const row = newestExpense(recentOperations(data, today, 7).map((e) => e.transaction));
  if (row) lessons.push({ id: 'tapRow', text: TAP_ROW_TEXT, target: { kind: 'row', transactionId: row.id }, more: null });
  return lessons;
}

/** The tabs with a hint of their own. */
export type LessonTab = 'savings' | 'finances' | 'history';

/** The hint of a tab on its first visit: the piggy of «Копилка», the calendar of «Финансы», a row of «История». */
export function pickTabLesson(tab: LessonTab, data: AppData, today: LocalDate, seen: LessonId[], feature: (key: FeatureKey) => boolean): Lesson | null {
  let lesson: Lesson | null = null;
  if (tab === 'savings' && feature('savings')) {
    lesson = {
      id: 'savings',
      text: 'Отложенное остаётся на твоей карте, просто лимит считается без него. Положи первую сумму или заведи банку',
      target: { kind: 'piggy' },
      more: 'savings',
    };
  } else if (tab === 'finances' && feature('calendar')) {
    lesson = { id: 'finances', text: 'Нажми на день, чтобы запланировать доход или расход', target: { kind: 'calendar' }, more: 'calendar' };
  } else if (tab === 'history') {
    const row = newestExpense(data.transactions.filter((t) => t.date <= today));
    if (row) lesson = { id: 'tapRow', text: TAP_ROW_TEXT, target: { kind: 'row', transactionId: row.id }, more: null };
  }
  return lesson && !seen.includes(lesson.id) ? lesson : null;
}

// «Первая неделя» (3.2): five things worth doing once, ticked from data.

export type FirstWeekKey = 'expense' | 'explain' | 'calendar' | 'jar' | 'install';

export interface FirstWeekItem {
  key: FirstWeekKey;
  label: string;
  done: boolean;
}

export function firstWeekItems(data: AppData, week: FirstWeekState, standalone: boolean): FirstWeekItem[] {
  // Anything planned after the setup: a payment, or an income with a day (the main one came from the setup).
  const planned =
    data.payments.some((p) => p.isActive && !week.setupPlanIds.includes(p.id)) ||
    data.incomeSources.some(
      (s) => s.isActive && !week.setupPlanIds.includes(s.id) && s.id !== data.settings.mainIncomeSourceId && (s.dayOfMonth !== null || s.weekday !== null || s.date !== null),
    );
  return [
    { key: 'expense', label: 'Добавь первую трату', done: data.transactions.some((t) => t.type === 'expense') },
    { key: 'explain', label: 'Посмотри, как считается лимит', done: week.seenExplain },
    { key: 'calendar', label: 'Запланируй платёж или доход в календаре', done: planned },
    { key: 'jar', label: 'Заведи банку в копилке', done: data.goals.some((g) => g.status === 'active') },
    { key: 'install', label: 'Установи Dayly на экран «Домой»', done: standalone },
  ];
}

export interface FirstWeekCard {
  items: FirstWeekItem[];
  /** Every item ticked: «Готово, ты знаешь всё главное». */
  complete: boolean;
}

/** The card, or null: only after a setup from update 2 on, until ×, for FIRST_WEEK_DAYS, and «Готово» one day. */
export function firstWeekCard(data: AppData, state: UiState, today: LocalDate, standalone: boolean): FirstWeekCard | null {
  const week = state.firstWeek;
  if (week.startedOn === null || week.dismissed || diffDays(week.startedOn, today) >= FIRST_WEEK_DAYS) return null;
  const items = firstWeekItems(data, week, standalone);
  const complete = items.every((item) => item.done);
  if (complete && week.completedOn !== null && week.completedOn !== today) return null;
  return { items, complete };
}

/** Remembers the day «Первая неделя» got its last tick, so «Готово» shows that day only. */
export function withFirstWeekCompleted(state: UiState, data: AppData, today: LocalDate, standalone: boolean): UiState {
  const card = firstWeekCard(data, state, today, standalone);
  if (!card?.complete || state.firstWeek.completedOn !== null) return state;
  return { ...state, firstWeek: { ...state.firstWeek, completedOn: today } };
}

// «Сохрани копию» (3.4).

/** The card asks again this many days after the last copy or «Не сейчас». */
export const BACKUP_EVERY_DAYS = 14;
/** A copy is worth asking for once the app has this many days of data. */
export const BACKUP_AFTER_DAYS = 7;

/**
 * Only in a browser or Telegram (an installed app keeps its data), once there is a week of data, and
 * BACKUP_EVERY_DAYS after the last copy or «Не сейчас».
 */
export function shouldShowBackupCard(data: AppData, state: UiState, today: LocalDate, standalone: boolean): boolean {
  if (standalone || diffDays(data.settings.trackingStartDate, today) < BACKUP_AFTER_DAYS) return false;
  const recent = (day: LocalDate | null) => day !== null && diffDays(day, today) < BACKUP_EVERY_DAYS;
  return !recent(state.lastBackupAt) && !recent(state.backupCardHiddenOn);
}

export type HomeCard = 'whatsNew' | 'firstWeek' | 'backup';

/** At most one card under the ring, so a small phone still shows the whole ring: in this order. */
export function pickHomeCard(shows: Record<HomeCard, boolean>): HomeCard | null {
  return (['whatsNew', 'firstWeek', 'backup'] as const).find((card) => shows[card]) ?? null;
}

/** Under the calendar of the first setup: '5 октября, через 9 дней, дальше каждый месяц 5-го'. */
export function nextIncomeCaption(today: LocalDate, date: LocalDate, weekly: boolean): string {
  const day = Number(date.slice(8, 10));
  const repeat = weekly
    ? scheduleText({ dayOfMonth: null, weekday: weekdayIndex(date) + 1, date: null })
    : `каждый месяц ${day}-го${day > 28 ? ' или в последний день' : ''}`;
  return `${formatDayMonth(date)}, через ${formatDays(diffDays(today, date))}, дальше ${repeat}`;
}

/** What the reserves of the first setup set aside now: a partial first period takes its share of the days. */
export interface ReservesPreview {
  kopecks: number;
  /** The next main income, or a month from today without one. */
  until: LocalDate;
  /** Days from today to the end of the period, and the whole period. */
  days: number;
  periodDays: number;
}

/** The first limit's reserves for `result`, counted exactly as the app will count them. */
export function reservesPreview(today: LocalDate, result: OnboardingResult): ReservesPreview {
  const budget = calculateBudget(createInitialData(today, result, new Date(`${today}T12:00:00`)), today);
  const { start, end } = budget.period;
  return {
    kopecks: budget.reserves.reduce((sum, r) => sum + r.budgetKopecks, 0),
    until: addDays(end, 1),
    days: daysInclusive(today, end),
    periodDays: daysInclusive(start, end),
  };
}
