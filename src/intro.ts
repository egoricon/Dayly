import { createInitialData, type OnboardingResult } from './appData';
import { calculateBudget } from './domain/budget';
import { addDays, daysInclusive, diffDays, weekdayIndex } from './domain/dates';
import type { LocalDate } from './domain/types';
import { formatDayMonth, formatDays, scheduleText } from './ui/labels';
import { WHATS_NEW_ID, type UiState } from './uiState';

// Getting to know the app (update 1): the first setup, the first-launch tips and «Что нового».

/** «Что нового» on the home screen: for people who used the app before this update, until they close it. */
export function shouldShowWhatsNew(state: UiState, hasData: boolean): boolean {
  return hasData && state.whatsNewSeen !== WHATS_NEW_ID;
}

/** After the first setup: «Что нового» is not for a new person, the first-launch tips are. */
export function afterFirstSetup(state: UiState): UiState {
  return { ...state, whatsNewSeen: WHATS_NEW_ID, tipsShown: false };
}

/**
 * The state a launch starts with. A new person gets «Что нового» marked seen when the first setup
 * completes, so data without it predates update 1: that person gets «Что нового» instead of the
 * first-launch tips (the tips' flag is new in update 1 and reads as «not shown»).
 */
export function atLaunch(state: UiState, hasData: boolean): UiState {
  return hasData && state.whatsNewSeen === null && !state.tipsShown ? { ...state, tipsShown: true } : state;
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
