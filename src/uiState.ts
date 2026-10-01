import type { LocalDate } from './domain/types';

// Interface state, kept apart from AppData under its own key.

export const UI_KEY = 'dayly:ui';

export type Accent = 'amber' | 'mint' | 'sky' | 'lavender' | 'coral';

/** Accent palettes for Settings; the CSS takes hue and chroma from data-accent on <html>. */
export const ACCENTS: { id: Accent; label: string; hue: number; chroma: number }[] = [
  { id: 'amber', label: 'Янтарь', hue: 85, chroma: 0.14 },
  { id: 'mint', label: 'Мята', hue: 170, chroma: 0.12 },
  { id: 'sky', label: 'Небо', hue: 235, chroma: 0.11 },
  { id: 'lavender', label: 'Лаванда', hue: 300, chroma: 0.11 },
  { id: 'coral', label: 'Коралл', hue: 45, chroma: 0.13 },
];

/** Features of updates 1 and 2 that «Настройки → Функции» can turn off. Off only hides them; data stays. */
export type FeatureKey =
  | 'savings'
  | 'calendar'
  | 'savingsRing'
  | 'leftover'
  | 'periodSummary'
  | 'weekStrip'
  | 'tomorrowHint'
  | 'earlyWarning'
  | 'undo'
  | 'upcoming';

/**
 * The switches in the order of «Настройки → Функции»: the «Копилка» tab and what goes with it first,
 * then the calendar block of «Финансы», then the extras of the home screen.
 */
export const FEATURES: { key: FeatureKey; label: string }[] = [
  { key: 'savings', label: 'Копилка' },
  { key: 'savingsRing', label: 'Кольцо копилки' },
  { key: 'leftover', label: 'Остаток дня в копилку' },
  { key: 'periodSummary', label: 'Итоги периода' },
  { key: 'calendar', label: 'Календарь в «Финансах»' },
  { key: 'weekStrip', label: 'Полоска недели и серия' },
  { key: 'tomorrowHint', label: '«Завтра будет…»' },
  { key: 'earlyWarning', label: 'Жёлтое кольцо на 80%' },
  { key: 'undo', label: 'Отмена траты' },
  { key: 'upcoming', label: '«Ближайшее»' },
];

/** Id of the current «Что нового»; the card shows until the user has seen this one. */
export const WHATS_NEW_ID = 'update-2';

/**
 * Hints shown once, when their event first happens (update 2, «Знакомство»): the ring after the first
 * setup, the first expense, the first row in a list, the first overspend, the first leftover card, the
 * first confirmation banner, the first visit to «Копилка» and to the calendar of «Финансы», the first
 * deficit and the end of the first period.
 */
export type LessonId =
  | 'ring'
  | 'firstExpense'
  | 'tapRow'
  | 'overspend'
  | 'leftover'
  | 'banner'
  | 'savings'
  | 'finances'
  | 'deficit'
  | 'periodEnd';

/**
 * What someone who saw the first-launch tips of update 1 has lived through already. «Копилка», the
 * calendar in «Финансы» and a tap on an operation are new in update 2, so their hints show to everybody.
 */
export const LESSONS_KNOWN_BEFORE_UPDATE_2: LessonId[] = ['ring', 'firstExpense', 'overspend', 'leftover', 'banner', 'deficit', 'periodEnd'];

/** «Первая неделя» under the ring: for people who finish the first setup from update 2 on. */
export interface FirstWeekState {
  /** The day of the first setup; null for people who set the app up before update 2 (no card). */
  startedOn: LocalDate | null;
  /** × on the card: hidden for good. */
  dismissed: boolean;
  /** «Как считается» was opened. */
  seenExplain: boolean;
  /** Incomes and payments of the first setup: anything else planned later ticks «календарь». */
  setupPlanIds: string[];
  /** The day every item got ticked: «Готово» shows that day only. */
  completedOn: LocalDate | null;
}

export interface UiState {
  /** Banners answered «Ещё нет»: banner key → the day it was hidden. */
  hiddenBanners: Record<string, LocalDate>;
  accent: Accent;
  /** How many times the app has been opened; the install hint waits for the second. */
  launches: number;
  installHintDismissed: boolean;
  /** Settings → «Анонимная статистика»: count launches (src/stats.ts). On unless turned off. */
  statsEnabled: boolean;
  /** «Настройки → Функции»: every feature is on unless turned off. */
  features: Record<FeatureKey, boolean>;
  /** Id of the last «Что нового» the user closed; null when none. */
  whatsNewSeen: string | null;
  /**
   * The first-launch tips of update 1 were seen. Since update 2 it is only read to tell who knows the
   * app already: their `lessonsSeen` starts with LESSONS_KNOWN_BEFORE_UPDATE_2.
   */
  tipsShown: boolean;
  /** Hints already shown (update 2); «Начать знакомство заново» clears them. */
  lessonsSeen: LessonId[];
  firstWeek: FirstWeekState;
  /** The day of the last «Сохранить копию», from «Настройки» or the home card; null when never. */
  lastBackupAt: LocalDate | null;
  /** «Не сейчас» on «Сохрани копию»: the card waits BACKUP_EVERY_DAYS from this day. */
  backupCardHiddenOn: LocalDate | null;
  /** Cards closed for good, like «Итоги периода» of one period; the newest MAX_DISMISSED_CARDS. */
  dismissedCards: string[];
  /** «Крупный текст» in «Настройки → Тема»: every font size 1.2×, through data-text-size on <html>. */
  largeText: boolean;
}

/** How many closed cards are remembered: older ones belong to periods long gone. */
export const MAX_DISMISSED_CARDS = 20;

function isAccent(value: unknown): value is Accent {
  return ACCENTS.some((a) => a.id === value);
}

function allFeaturesOn(): Record<FeatureKey, boolean> {
  return Object.fromEntries(FEATURES.map((f) => [f.key, true])) as Record<FeatureKey, boolean>;
}

/** The state of a first launch. */
export function defaultUiState(): UiState {
  return {
    hiddenBanners: {},
    accent: 'amber',
    launches: 0,
    installHintDismissed: false,
    statsEnabled: true,
    features: allFeaturesOn(),
    whatsNewSeen: null,
    tipsShown: false,
    lessonsSeen: [],
    firstWeek: defaultFirstWeek(),
    lastBackupAt: null,
    backupCardHiddenOn: null,
    dismissedCards: [],
    largeText: false,
  };
}

function defaultFirstWeek(): FirstWeekState {
  return { startedOn: null, dismissed: false, seenExplain: false, setupPlanIds: [], completedOn: null };
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function dateOrNull(value: unknown): LocalDate | null {
  return typeof value === 'string' && DATE_PATTERN.test(value) ? value : null;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((x): x is string => typeof x === 'string') : [];
}

function loadFirstWeek(value: unknown): FirstWeekState {
  if (typeof value !== 'object' || value === null) return defaultFirstWeek();
  const saved = value as Partial<Record<keyof FirstWeekState, unknown>>;
  return {
    startedOn: dateOrNull(saved.startedOn),
    dismissed: saved.dismissed === true,
    seenExplain: saved.seenExplain === true,
    setupPlanIds: stringList(saved.setupPlanIds),
    completedOn: dateOrNull(saved.completedOn),
  };
}

/** Reads the saved state; fields saved by older versions or missing get their defaults. */
export function loadUiState(storage: Storage): UiState {
  try {
    const parsed = JSON.parse(storage.getItem(UI_KEY) ?? '{}') as Partial<UiState>;
    const savedFeatures: Partial<Record<FeatureKey, unknown>> = typeof parsed.features === 'object' && parsed.features !== null ? parsed.features : {};
    return {
      hiddenBanners: parsed.hiddenBanners ?? {},
      accent: isAccent(parsed.accent) ? parsed.accent : 'amber',
      launches: typeof parsed.launches === 'number' ? parsed.launches : 0,
      installHintDismissed: parsed.installHintDismissed === true,
      statsEnabled: parsed.statsEnabled !== false,
      features: Object.fromEntries(FEATURES.map((f) => [f.key, savedFeatures[f.key] !== false])) as Record<FeatureKey, boolean>,
      whatsNewSeen: typeof parsed.whatsNewSeen === 'string' ? parsed.whatsNewSeen : null,
      tipsShown: parsed.tipsShown === true,
      // Saved before update 2: whoever saw the tips of update 1 knows the ring and the first expense.
      lessonsSeen: Array.isArray(parsed.lessonsSeen)
        ? (stringList(parsed.lessonsSeen) as LessonId[])
        : parsed.tipsShown === true
          ? [...LESSONS_KNOWN_BEFORE_UPDATE_2]
          : [],
      firstWeek: loadFirstWeek(parsed.firstWeek),
      lastBackupAt: dateOrNull(parsed.lastBackupAt),
      backupCardHiddenOn: dateOrNull(parsed.backupCardHiddenOn),
      dismissedCards: Array.isArray(parsed.dismissedCards)
        ? parsed.dismissedCards.filter((key): key is string => typeof key === 'string').slice(-MAX_DISMISSED_CARDS)
        : [],
      largeText: parsed.largeText === true,
    };
  } catch {
    return defaultUiState();
  }
}

export function saveUiState(storage: Storage, state: UiState): void {
  storage.setItem(UI_KEY, JSON.stringify(state));
}

/** Hides a banner until tomorrow and forgets older answers. */
export function hideBanner(state: UiState, key: string, today: LocalDate): UiState {
  const kept = Object.fromEntries(Object.entries(state.hiddenBanners).filter(([, day]) => day === today));
  return { ...state, hiddenBanners: { ...kept, [key]: today } };
}

export function isBannerHidden(state: UiState, key: string, today: LocalDate): boolean {
  return state.hiddenBanners[key] === today;
}

/** Closes a card for good; only the newest MAX_DISMISSED_CARDS are kept. */
export function dismissCard(state: UiState, key: string): UiState {
  if (state.dismissedCards.includes(key)) return state;
  return { ...state, dismissedCards: [...state.dismissedCards, key].slice(-MAX_DISMISSED_CARDS) };
}

export function isCardDismissed(state: UiState, key: string): boolean {
  return state.dismissedCards.includes(key);
}

export function isFeatureOn(state: UiState, key: FeatureKey): boolean {
  return state.features[key];
}

export function setFeature(state: UiState, key: FeatureKey, on: boolean): UiState {
  return { ...state, features: { ...state.features, [key]: on } };
}

/** The home-screen hint: from the second launch, until dismissed, never inside the installed app. */
export function shouldShowInstallHint(state: UiState, platform: InstallPlatform, standalone: boolean): boolean {
  return !standalone && platform !== 'other' && !state.installHintDismissed && state.launches >= 2;
}

export type InstallPlatform = 'ios' | 'android' | 'prompt' | 'other';
