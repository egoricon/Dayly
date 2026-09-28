import { useEffect, useMemo, useRef, useState } from 'react';
import { createInitialData, recordDaySummary } from './appData';
import { TabBar, type Tab } from './components/TabBar';
import { calculateBudget } from './domain/budget';
import { toLocalDate } from './domain/dates';
import type { AppData, LocalDate } from './domain/types';
import { CalendarScreen } from './screens/CalendarScreen';
import { FirstLimit } from './screens/FirstLimit';
import { History } from './screens/History';
import { Home } from './screens/Home';
import { Onboarding } from './screens/Onboarding';
import { Finances, type FinanceRoute, type Update } from './screens/Finances';
import { Settings, type SettingsRoute } from './screens/Settings';
import { DATA_KEY, loadData, saveData } from './storage';
import { InAppBrowserBanner, useInstallInfo } from './components/InstallHint';
import { detectInAppBrowser, isStandalone } from './install';
import { countLaunch, launchMode, RESUME_AS_LAUNCH_MS } from './stats';
import { dismissCard, hideBanner, isBannerHidden, isCardDismissed, isFeatureOn, loadUiState, saveUiState, shouldShowInstallHint, UI_KEY, type Accent, type FeatureKey } from './uiState';

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
    const state = loadUiState(localStorage);
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
  const [settingsRoute, setSettingsRoute] = useState<SettingsRoute>({ screen: 'main' });
  const [showFirstLimit, setShowFirstLimit] = useState(false);
  // The day the «Календарь» tab opens on (null: today's month, no day sheet).
  const [calendarDate, setCalendarDate] = useState<LocalDate | null>(null);
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

  // The app layer, not the calculation, records the day's limit for tomorrow's carry-over.
  useEffect(() => {
    if (!data || !budget) return;
    const next = recordDaySummary(data, today, budget.dailyLimitKopecks);
    if (next !== data) setData(next);
  }, [data, budget, today]);

  if (!data || !budget) {
    return (
      <div className={shellClass}>
        {inAppBanner}
        <Onboarding
          today={today}
          onComplete={(result) => {
            setData(createInitialData(today, result, new Date()));
            setShowFirstLimit(true);
          }}
        />
      </div>
    );
  }

  const update: Update = (change) => setData((d) => (d ? change(d) : d));
  const openFinances = (route: FinanceRoute) => {
    setFinanceRoute(route);
    setTab('finances');
  };
  // «Настройки → Функции»: a feature turned off is not shown; its data stays.
  const feature = (key: FeatureKey) => isFeatureOn(ui, key);
  const openCalendar = (date: LocalDate | null) => {
    if (!feature('calendar')) return;
    setCalendarDate(date);
    setTab('calendar');
  };
  // «Сбросить всё»: this device forgets everything and the app starts from onboarding.
  const reset = () => {
    localStorage.removeItem(DATA_KEY);
    localStorage.removeItem(UI_KEY);
    setUi(loadUiState(localStorage));
    setTab('today');
    setFinanceRoute({ screen: 'main' });
    setSettingsRoute({ screen: 'main' });
    setData(null);
  };

  if (showFirstLimit) {
    return (
      <div className={shellClass}>
        {inAppBanner}
        <FirstLimit
          budget={budget}
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
          installHint={inApp === null && shouldShowInstallHint(ui, install.platform, install.standalone) ? install.platform : null}
          onDismissInstallHint={() => setUi((state) => ({ ...state, installHintDismissed: true }))}
          onOpenFinances={openFinances}
          onOpenCalendar={openCalendar}
          feature={feature}
          isCardDismissed={(key) => isCardDismissed(ui, key)}
          onDismissCard={(key) => setUi((state) => dismissCard(state, key))}
        />
      )}
      {tab === 'calendar' && feature('calendar') && (
        <CalendarScreen data={data} budget={budget} today={today} update={update} initialDate={calendarDate} />
      )}
      {tab === 'history' && <History data={data} budget={budget} today={today} update={update} />}
      {tab === 'finances' && (
        <Finances data={data} budget={budget} today={today} route={financeRoute} onNavigate={setFinanceRoute} update={update} feature={feature} />
      )}
      {tab === 'settings' && (
        <Settings
          data={data}
          route={settingsRoute}
          onNavigate={setSettingsRoute}
          update={update}
          accent={ui.accent}
          onAccentChange={(accent) => setUi((state) => ({ ...state, accent }))}
          statsEnabled={ui.statsEnabled}
          onStatsChange={(statsEnabled) => setUi((state) => ({ ...state, statsEnabled }))}
          install={install}
          onReset={reset}
          onImport={(restored) => {
            setData(restored);
            setTab('today');
          }}
        />
      )}
      <TabBar
        active={tab}
        hidden={feature('calendar') ? [] : ['calendar']}
        onChange={(next) => {
          if (next === 'finances') setFinanceRoute({ screen: 'main' });
          if (next === 'settings') setSettingsRoute({ screen: 'main' });
          if (next === 'calendar') setCalendarDate(null);
          setTab(next);
        }}
      />
    </div>
  );
}
