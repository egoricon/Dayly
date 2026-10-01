import { describe, expect, it } from 'vitest';
import { detectInAppBrowser, detectPlatform } from './install';
import {
  defaultUiState,
  FEATURES,
  hideBanner,
  isFeatureOn,
  loadUiState,
  setFeature,
  shouldShowInstallHint,
  UI_KEY,
  LESSONS_KNOWN_BEFORE_UPDATE_2,
  WHATS_NEW_ID,
  type UiState,
} from './uiState';
import { canCount, launchHitUrl, launchMode } from './stats';

function storageWith(value: string | null): Storage {
  const map = new Map<string, string>();
  if (value !== null) map.set(UI_KEY, value);
  return { getItem: (k: string) => map.get(k) ?? null } as Storage;
}

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1';
const IPAD = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/128.0 Mobile Safari/537.36';
const DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0 Safari/537.36';

describe('ui state', () => {
  it('fills defaults for state saved before accents and the install hint', () => {
    const state = loadUiState(storageWith(JSON.stringify({ hiddenBanners: { a: '2026-09-26' } })));
    expect(state).toEqual({ ...defaultUiState(), hiddenBanners: { a: '2026-09-26' } });
    expect(state).toMatchObject({ accent: 'amber', launches: 0, installHintDismissed: false, statsEnabled: true });
  });

  it('ignores an unknown accent', () => {
    expect(loadUiState(storageWith(JSON.stringify({ accent: 'neon' }))).accent).toBe('amber');
    expect(loadUiState(storageWith(JSON.stringify({ accent: 'mint' }))).accent).toBe('mint');
  });

  it('keeps the accent when a banner is hidden', () => {
    const state: UiState = { ...defaultUiState(), accent: 'sky', launches: 3 };
    expect(hideBanner(state, 'x', '2026-09-26').accent).toBe('sky');
  });

  it('«Крупный текст» is off by default and only true turns it on', () => {
    expect(defaultUiState().largeText).toBe(false);
    expect(loadUiState(storageWith(JSON.stringify({ accent: 'mint' }))).largeText).toBe(false);
    expect(loadUiState(storageWith(JSON.stringify({ largeText: 'yes' }))).largeText).toBe(false);
    expect(loadUiState(storageWith(JSON.stringify({ largeText: true }))).largeText).toBe(true);
  });
});

describe('features and «Что нового» (update 1)', () => {
  it('every feature is on by default, in the order of «Настройки → Функции»', () => {
    expect(FEATURES.map((f) => [f.key, f.label])).toEqual([
      ['savings', 'Копилка'],
      ['savingsRing', 'Кольцо копилки'],
      ['leftover', 'Остаток дня в копилку'],
      ['periodSummary', 'Итоги периода'],
      ['calendar', 'Календарь в «Финансах»'],
      ['weekStrip', 'Полоска недели и серия'],
      ['tomorrowHint', '«Завтра будет…»'],
      ['earlyWarning', 'Жёлтое кольцо на 80%'],
      ['undo', 'Отмена траты'],
      ['upcoming', '«Ближайшее»'],
    ]);
    const state = defaultUiState();
    expect(FEATURES.every((f) => isFeatureOn(state, f.key))).toBe(true);
    expect(state).toMatchObject({ whatsNewSeen: null, tipsShown: false });
  });

  it('state saved before update 1 loads with every feature on, «Что нового» not seen and no tips shown', () => {
    const old = { hiddenBanners: {}, accent: 'mint', launches: 7, installHintDismissed: true, statsEnabled: false };
    expect(loadUiState(storageWith(JSON.stringify(old)))).toEqual({
      ...old,
      features: defaultUiState().features,
      whatsNewSeen: null,
      tipsShown: false,
      lessonsSeen: [],
      firstWeek: { startedOn: null, dismissed: false, seenExplain: false, setupPlanIds: [], completedOn: null },
      lastBackupAt: null,
      backupCardHiddenOn: null,
      dismissedCards: [],
      largeText: false,
    });
  });

  it('a feature turned off stays off; the others and unknown values stay on', () => {
    const off = setFeature(defaultUiState(), 'calendar', false);
    expect(isFeatureOn(off, 'calendar')).toBe(false);
    expect(isFeatureOn(off, 'undo')).toBe(true);
    expect(isFeatureOn(setFeature(off, 'calendar', true), 'calendar')).toBe(true);
    const loaded = loadUiState(storageWith(JSON.stringify({ features: { calendar: false, undo: 'no', unknown: false } })));
    expect(loaded.features).toEqual({ ...defaultUiState().features, calendar: false });
  });

  it('«Копилка» (update 2) is on for state saved before it, and keeps the switches saved then', () => {
    // The switches of update 1, the calendar turned off.
    const update1 = { calendar: false, savingsRing: true, leftover: true, periodSummary: true, weekStrip: true, tomorrowHint: true, earlyWarning: true, undo: true, upcoming: true };
    const loaded = loadUiState(storageWith(JSON.stringify({ ...defaultUiState(), features: update1 })));
    expect(isFeatureOn(loaded, 'savings')).toBe(true);
    expect(isFeatureOn(loaded, 'calendar')).toBe(false);
    expect(isFeatureOn(loadUiState(storageWith(JSON.stringify({ features: { savings: false } }))), 'savings')).toBe(false);
  });

  it('keeps which «Что нового» was seen and whether the tips were shown', () => {
    const saved = { ...defaultUiState(), whatsNewSeen: WHATS_NEW_ID, tipsShown: true };
    expect(loadUiState(storageWith(JSON.stringify(saved)))).toEqual(saved);
    expect(WHATS_NEW_ID).toBe('update-2');
    expect(loadUiState(storageWith(JSON.stringify({ whatsNewSeen: 5 }))).whatsNewSeen).toBeNull();
    expect(loadUiState(storageWith('{broken'))).toEqual(defaultUiState());
  });
});

describe('install hint', () => {
  const base: UiState = { ...defaultUiState(), launches: 2 };

  it('shows from the second launch on a phone in the browser', () => {
    expect(shouldShowInstallHint({ ...base, launches: 1 }, 'ios', false)).toBe(false);
    expect(shouldShowInstallHint(base, 'ios', false)).toBe(true);
    expect(shouldShowInstallHint(base, 'android', false)).toBe(true);
  });

  it('hides once dismissed, in the installed app and on unknown desktops', () => {
    expect(shouldShowInstallHint({ ...base, installHintDismissed: true }, 'ios', false)).toBe(false);
    expect(shouldShowInstallHint(base, 'ios', true)).toBe(false);
    expect(shouldShowInstallHint(base, 'other', false)).toBe(false);
  });

  it('detects the platform', () => {
    expect(detectPlatform(IPHONE, 5, false)).toBe('ios');
    expect(detectPlatform(IPAD, 5, false)).toBe('ios');
    expect(detectPlatform(IPAD, 0, false)).toBe('other');
    expect(detectPlatform(ANDROID, 5, false)).toBe('android');
    expect(detectPlatform(ANDROID, 5, true)).toBe('prompt');
    expect(detectPlatform(DESKTOP, 0, true)).toBe('prompt');
    expect(detectPlatform(DESKTOP, 0, false)).toBe('other');
  });
});

describe('in-app browsers', () => {
  it('recognises Telegram by its webview bridge or user agent, and other apps by theirs', () => {
    expect(detectInAppBrowser(IPHONE, true)).toBe('telegram');
    expect(detectInAppBrowser(`${ANDROID} Telegram-Android/11.2.3`, false)).toBe('telegram');
    expect(detectInAppBrowser(`${IPHONE} Instagram 300.0`, false)).toBe('other');
    expect(detectInAppBrowser(IPHONE, false)).toBeNull();
    expect(detectInAppBrowser(ANDROID, false)).toBeNull();
  });
});

describe('anonymous statistics', () => {
  it('is on unless turned off', () => {
    expect(loadUiState(storageWith('{}')).statsEnabled).toBe(true);
    expect(loadUiState(storageWith(JSON.stringify({ statsEnabled: false }))).statsEnabled).toBe(false);
  });

  it('sends only how the app was opened', () => {
    const url = new URL(launchHitUrl(true, launchMode(true, null), 'https://t.me/', 'x1'));
    expect(url.origin + url.pathname).toBe('https://dayly.goatcounter.com/count');
    expect(Object.fromEntries(['p', 't', 'r', 'rnd'].map((key) => [key, url.searchParams.get(key)]))).toEqual({
      p: '/first/app',
      t: 'Первый запуск, с главного экрана',
      r: 'https://t.me/',
      rnd: 'x1',
    });
    expect(url.search.split('&')).toHaveLength(4);
    expect(new URL(launchHitUrl(false, launchMode(false, 'telegram'), '', 'x2')).searchParams.get('p')).toBe('/repeat/telegram');
    expect(launchMode(false, null)).toBe('browser');
    expect(launchMode(true, 'other')).toBe('in-app');
  });

  it('counts only the published app', () => {
    expect(canCount(true, 'egoricon.github.io', false)).toBe(true);
    expect(canCount(false, 'egoricon.github.io', false)).toBe(false);
    expect(canCount(true, 'localhost', false)).toBe(false);
    expect(canCount(true, 'egoricon.github.io', true)).toBe(false);
  });
});

describe('«Знакомство» (update 2)', () => {
  it('whoever saw the tips of update 1 knows the ring and the first expense; the hints of update 2 are new to them', () => {
    const update1 = { whatsNewSeen: 'update-1', tipsShown: true };
    const loaded = loadUiState(storageWith(JSON.stringify(update1)));
    expect(loaded.lessonsSeen).toEqual(LESSONS_KNOWN_BEFORE_UPDATE_2);
    expect(loaded.lessonsSeen).toEqual(expect.arrayContaining(['ring', 'firstExpense']));
    expect(loaded.lessonsSeen).not.toEqual(expect.arrayContaining(['savings']));
    expect(loaded.lessonsSeen.some((id) => id === 'finances' || id === 'tapRow' || id === 'savings')).toBe(false);
    // Tips of update 1 not finished: every hint is still to come.
    expect(loadUiState(storageWith(JSON.stringify({ whatsNewSeen: 'update-1', tipsShown: false }))).lessonsSeen).toEqual([]);
  });

  it('keeps what was saved since update 2, even an emptied list after «Начать знакомство заново»', () => {
    const saved: UiState = {
      ...defaultUiState(),
      tipsShown: true,
      lessonsSeen: [],
      firstWeek: { startedOn: '2026-09-26', dismissed: true, seenExplain: true, setupPlanIds: ['a', 'b'], completedOn: '2026-09-30' },
      lastBackupAt: '2026-09-20',
      backupCardHiddenOn: '2026-09-21',
    };
    expect(loadUiState(storageWith(JSON.stringify(saved)))).toEqual(saved);
    const odd = loadUiState(storageWith(JSON.stringify({ lessonsSeen: ['ring', 5], firstWeek: { startedOn: 'вчера', setupPlanIds: [1, 'x'] }, lastBackupAt: 20 })));
    expect(odd.lessonsSeen).toEqual(['ring']);
    expect(odd.firstWeek).toEqual({ startedOn: null, dismissed: false, seenExplain: false, setupPlanIds: ['x'], completedOn: null });
    expect(odd.lastBackupAt).toBeNull();
  });
});
