import { useEffect, useMemo, useRef, useState } from 'react';
import { createInitialData, recordDaySummary } from './appData';
import { TabBar, type Tab } from './components/TabBar';
import { calculateBudget } from './domain/budget';
import { toLocalDate } from './domain/dates';
import type { AppData, LocalDate } from './domain/types';
import type { CalendarFocus } from './screens/CalendarScreen';
import { FirstLimit } from './screens/FirstLimit';
import { History } from './screens/History';
import { Home, type IntroCard } from './screens/Home';
import { Onboarding } from './screens/Onboarding';
import { Finances, type FinanceRoute, type Update } from './screens/Finances';
import { Savings, type SavingsRoute } from './screens/Savings';
import { Settings, type SettingsRoute } from './screens/Settings';
import { DATA_KEY, loadData, saveData } from './storage';
import { InAppBrowserBanner, useInstallInfo } from './components/InstallHint';
import { detectInAppBrowser, isStandalone } from './install';
import { countLaunch, launchMode, RESUME_AS_LAUNCH_MS } from './stats';
import { celebrateJars, dismissCard, hideBanner, isBannerHidden, isCardDismissed, isFeatureOn, loadUiState, saveUiState, setFeature, shouldShowInstallHint, UI_KEY, WHATS_NEW_ID, type Accent, type FeatureKey, type LessonId } from './uiState';
import {
  afterFirstSetup,
  atLaunch,
  firstWeekCard,
  markLessonSeen,
  pickHomeCard,
  pickTabLesson,
  restartIntro,
  shouldShowBackupCard,
  shouldShowWhatsNew,
  withFirstWeekCompleted,
  type GuideSection,
} from './intro';
import { backupFileName, makeBackup, saveBackupFile } from './backup';
import { LessonHint } from './components/LessonHint';

/** Today's date that follows midnight and a return to the app after a pause. */
function useToday(): LocalDate {
  const [today, setToday] = useState(() => toLocalDate(new Date()));
  useEffect(() => {
    const refresh = () => setToday(toLocalDate(new Date()));
    const timer = window.setInterval(refresh, 30_000);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);
  return today;
}

/** Sets the theme on <html>; index.html does the same before the first paint. */
function applyTheme(theme: AppData['settings']['theme']): void {
  document.documentElement.dataset.theme = theme;
  const dark = theme === 'dark' || (theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#121417' : '#F4F3EF');
}

/** Sets the accent palette on <html>; index.html does the same before the first paint. */
function applyAccent(accent: Accent): void {
  document.documentElement.dataset.accent = accent;
}

/** «Крупный текст»: data-text-size="large" on <html> sets --text-scale (styles.css); index.html does it before the first paint. */
function applyTextSize(large: boolean): void {
  if (large) document.documentElement.dataset.textSize = 'large';
  else delete document.documentElement.dataset.textSize;
}

/**
 * Counts this launch, and a return from the background after a long while as another one: an app
 * on the home screen can stay open for days.
 */
function useLaunchCounter(first: boolean, mode: ReturnType<typeof launchMode>, enabled: boolean): void {
  const counted = useRef(false);
  const settings = useRef({ enabled, mode });
  settings.current = { enabled, mode };
  useEffect(() => {
    if (!counted.current && settings.current.enabled) countLaunch(first, settings.current.mode);
    counted.current = true;
    let hiddenAt: number | null = null;
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') hiddenAt = Date.now();
      else if (hiddenAt !== null && Date.now() - hiddenAt >= RESUME_AS_LAUNCH_MS && settings.current.enabled) countLaunch(false, settings.current.mode);
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [first]);
}

export function App() {
  const [data, setData] = useState<AppData | null>(() => loadData(localStorage));
  // Each page load counts as a launch; the install hint waits for the second one.
  const [ui, setUi] = useState(() => {
    // Someone who set the app up before update 1 gets «Что нового», and only the hints about what is new.
    const state = atLaunch(loadUiState(localStorage), data !== null);
    return { ...state, launches: state.launches + 1 };
  });
  const install = useInstallInfo();
  // Inside Telegram and similar apps a banner asks to open the real browser; hidden until the next launch.
  const [inApp] = useState(() => detectInAppBrowser(navigator.userAgent, 'TelegramWebviewProxy' in window));
  const [inAppDismissed, setInAppDismissed] = useState(false);
  useLaunchCounter(ui.launches === 1, launchMode(isStandalone(), inApp), ui.statsEnabled);
  const showInApp = inApp !== null && !inAppDismissed;
  const shellClass = `app-shell${showInApp ? ' has-top-banner' : ''}`;
  const inAppBanner = showInApp && (
    <InAppBrowserBanner app={inApp} ios={install.platform === 'ios'} onDismiss={() => setInAppDismissed(true)} />
  );
  const [tab, setTab] = useState<Tab>('today');
  const [financeRoute, setFinanceRoute] = useState<FinanceRoute>({ screen: 'main' });
  const [savingsRoute, setSavingsRoute] = useState<SavingsRoute>({ screen: 'main' });
  const [settingsRoute, setSettingsRoute] = useState<SettingsRoute>({ screen: 'main' });
  const [showFirstLimit, setShowFirstLimit] = useState(false);
  // The calendar of «Финансы» was asked for: it scrolls into view, on a day's sheet when a date is given.
  const [calendarFocus, setCalendarFocus] = useState<CalendarFocus | null>(null);
  const today = useToday();
  const budget = useMemo(() => (data ? calculateBudget(data, today) : null), [data, today]);

  useEffect(() => {
    if (data) saveData(localStorage, data);
  }, [data]);

  useEffect(() => {
    saveUiState(localStorage, ui);
  }, [ui]);

  const theme = data?.settings.theme ?? 'auto';
  useEffect(() => applyTheme(theme), [theme]);
  useEffect(() => applyAccent(ui.accent), [ui.accent]);
  useEffect(() => applyTextSize(ui.largeText), [ui.largeText]);

  // The app layer, not the calculation, records the day's limit for tomorrow's carry-over.
  useEffect(() => {
    if (!data || !budget) return;
    const next = recordDaySummary(data, today, budget.dailyLimitKopecks);
    if (next !== data) setData(next);
  }, [data, budget, today]);

  // «Первая неделя» remembers the day of its last tick: «Готово» shows that day only.
  useEffect(() => {
    if (data) setUi((state) => withFirstWeekCompleted(state, data, today, install.standalone));
  }, [data, today, install.standalone]);

  if (!data || !budget) {
    return (
      <div className={shellClass}>
        {inAppBanner}
        <Onboarding
          today={today}
          onComplete={(result) => {
            const created = createInitialData(today, result, new Date());
            setData(created);
            // «Что нового» is for people who used the app before; a new one gets the hints and «Первая неделя».
            setUi((state) => afterFirstSetup(state, created, today));
            setShowFirstLimit(true);
          }}
        />
      </div>
    );
  }

  const update: Update = (change) => setData((d) => (d ? change(d) : d));
  // Any move inside «Финансы» forgets the calendar request, so «Назад» from a form opens no day sheet.
  const navigateFinances = (route: FinanceRoute) => {
    setCalendarFocus(null);
    setFinanceRoute(route);
  };
  const openFinances = (route: FinanceRoute) => {
    navigateFinances(route);
    setTab('finances');
  };
  // «Настройки → Функции»: a feature turned off is not shown; its data stays.
  const feature = (key: FeatureKey) => isFeatureOn(ui, key);
  const openCalendar = (date: LocalDate | null) => {
    if (!feature('calendar')) return;
    setFinanceRoute({ screen: 'main' });
    setCalendarFocus({ date });
    setTab('finances');
  };
  const openSavings = (route: SavingsRoute) => {
    if (!feature('savings')) return;
    setSavingsRoute(route);
    setTab('savings');
  };
  // «Сбросить всё»: this device forgets everything and the app starts from onboarding.
  const reset = () => {
    localStorage.removeItem(DATA_KEY);
    localStorage.removeItem(UI_KEY);
    setUi(loadUiState(localStorage));
    setTab('today');
    setFinanceRoute({ screen: 'main' });
    setSavingsRoute({ screen: 'main' });
    setSettingsRoute({ screen: 'main' });
    setCalendarFocus(null);
    setData(null);
  };

  // «Знакомство» (update 2): hints, «Подробнее» into «Как устроен Dayly», one card under the ring.
  const onLessonSeen = (id: LessonId) => setUi((state) => markLessonSeen(state, id));
  const onLessonMore = (section: GuideSection) => {
    setSettingsRoute({ screen: 'guide', section });
    setTab('settings');
  };
  const firstWeek = firstWeekCard(data, ui, today, install.standalone);
  const homeCard = pickHomeCard({
    whatsNew: shouldShowWhatsNew(ui, true),
    firstWeek: firstWeek !== null,
    backup: shouldShowBackupCard(data, ui, today, install.standalone),
  });
  const introCard: IntroCard | null =
    homeCard === 'firstWeek' && firstWeek ? { kind: 'firstWeek', card: firstWeek } : homeCard === 'whatsNew' ? { kind: 'whatsNew' } : homeCard === 'backup' ? { kind: 'backup' } : null;
  const saveBackup = async () => {
    await saveBackupFile(makeBackup(data, new Date()), backupFileName(today));
    setUi((state) => ({ ...state, lastBackupAt: today }));
  };
  // The first visit to «Копилка», the calendar of «Финансы» and «История» have a hint of their own.
  const tabLesson =
    (tab === 'savings' && savingsRoute.screen === 'main') || (tab === 'finances' && financeRoute.screen === 'main') || tab === 'history'
      ? pickTabLesson(tab, data, today, ui.lessonsSeen, feature)
      : null;

  if (showFirstLimit) {
    return (
      <div className={shellClass}>
        {inAppBanner}
        <FirstLimit
          data={data}
          budget={budget}
          today={today}
          onSetupReserves={() => {
            setShowFirstLimit(false);
            openFinances({ screen: 'category', id: 'groceries' });
          }}
          onDone={() => setShowFirstLimit(false)}
        />
      </div>
    );
  }

  return (
    <div className={shellClass}>
        {inAppBanner}
      {tab === 'today' && (
        <Home
          data={data}
          budget={budget}
          today={today}
          update={update}
          isBannerHidden={(key) => isBannerHidden(ui, key, today)}
          onHideBanner={(key) => setUi((state) => hideBanner(state, key, today))}
          // «Первая неделя» has its own install item.
          installHint={inApp === null && homeCard !== 'firstWeek' && shouldShowInstallHint(ui, install.platform, install.standalone) ? install.platform : null}
          onDismissInstallHint={() => setUi((state) => ({ ...state, installHintDismissed: true }))}
          onOpenFinances={openFinances}
          onOpenSavings={openSavings}
          onOpenCalendar={openCalendar}
          feature={feature}
          isCardDismissed={(key) => isCardDismissed(ui, key)}
          onDismissCard={(key) => setUi((state) => dismissCard(state, key))}
          intro={{
            card: introCard,
            lessonsSeen: ui.lessonsSeen,
            onLessonSeen,
            onLessonMore,
            onExplainOpened: () => setUi((state) => (state.firstWeek.seenExplain ? state : { ...state, firstWeek: { ...state.firstWeek, seenExplain: true } })),
            onWhatsNewSeen: () => setUi((state) => ({ ...state, whatsNewSeen: WHATS_NEW_ID })),
            onFirstWeekClose: () => setUi((state) => ({ ...state, firstWeek: { ...state.firstWeek, dismissed: true } })),
            onBackupSave: saveBackup,
            onBackupLater: () => setUi((state) => ({ ...state, backupCardHiddenOn: today })),
            ios: install.platform === 'ios',
            onOpenInstall: () => {
              setSettingsRoute({ screen: 'install' });
              setTab('settings');
            },
          }}
        />
      )}
      {tab === 'savings' && feature('savings') && (
        <Savings
          data={data}
          budget={budget}
          today={today}
          route={savingsRoute}
          onNavigate={setSavingsRoute}
          update={update}
          feature={feature}
          onFeatureChange={(key, on) => setUi((state) => setFeature(state, key, on))}
          celebratedJars={ui.celebratedJars}
          onCelebrate={(keys) => setUi((state) => celebrateJars(state, keys))}
        />
      )}
      {tab === 'history' && <History data={data} budget={budget} today={today} update={update} />}
      {tab === 'finances' && (
        <Finances
          data={data}
          budget={budget}
          today={today}
          route={financeRoute}
          onNavigate={navigateFinances}
          update={update}
          feature={feature}
          calendarFocus={calendarFocus}
        />
      )}
      {tab === 'settings' && (
        <Settings
          data={data}
          budget={budget}
          route={settingsRoute}
          onNavigate={setSettingsRoute}
          update={update}
          accent={ui.accent}
          onAccentChange={(accent) => setUi((state) => ({ ...state, accent }))}
          largeText={ui.largeText}
          onLargeTextChange={(largeText) => setUi((state) => ({ ...state, largeText }))}
          statsEnabled={ui.statsEnabled}
          onStatsChange={(statsEnabled) => setUi((state) => ({ ...state, statsEnabled }))}
          install={install}
          onReset={reset}
          onImport={(restored) => {
            setData(restored);
            setTab('today');
          }}
          features={ui.features}
          onFeatureChange={(key, on) => setUi((state) => setFeature(state, key, on))}
          onRestartIntro={() => {
            setUi((state) => restartIntro(state, today));
            setTab('today');
          }}
          onOpenSavings={() => openSavings({ screen: 'main' })}
          lastBackupAt={ui.lastBackupAt}
          onBackupSaved={() => setUi((state) => ({ ...state, lastBackupAt: toLocalDate(new Date()) }))}
        />
      )}
      {tabLesson && <LessonHint key={`${tab}-${tabLesson.id}`} lesson={tabLesson} onSeen={onLessonSeen} onMore={onLessonMore} />}
      <TabBar
        active={tab}
        hidden={feature('savings') ? [] : ['savings']}
        onChange={(next) => {
          if (next === 'finances') navigateFinances({ screen: 'main' });
          if (next === 'savings') setSavingsRoute({ screen: 'main' });
          if (next === 'settings') setSettingsRoute({ screen: 'main' });
          setTab(next);
        }}
      />
    </div>
  );
}
