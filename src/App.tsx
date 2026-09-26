import { useEffect, useMemo, useState } from 'react';
import { createInitialData, recordDaySummary } from './appData';
import { TabBar, type Tab } from './components/TabBar';
import { calculateBudget } from './domain/budget';
import { toLocalDate } from './domain/dates';
import type { AppData, LocalDate } from './domain/types';
import { FirstLimit } from './screens/FirstLimit';
import { History } from './screens/History';
import { Home } from './screens/Home';
import { Onboarding } from './screens/Onboarding';
import { Settings, type SettingsRoute, type Update } from './screens/Settings';
import { loadData, saveData } from './storage';
import { useInstallInfo } from './components/InstallHint';
import { hideBanner, isBannerHidden, loadUiState, saveUiState, shouldShowInstallHint, type Accent } from './uiState';

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

export function App() {
  const [data, setData] = useState<AppData | null>(() => loadData(localStorage));
  // Each page load counts as a launch; the install hint waits for the second one.
  const [ui, setUi] = useState(() => {
    const state = loadUiState(localStorage);
    return { ...state, launches: state.launches + 1 };
  });
  const install = useInstallInfo();
  const [tab, setTab] = useState<Tab>('today');
  const [settingsRoute, setSettingsRoute] = useState<SettingsRoute>({ screen: 'main' });
  const [showFirstLimit, setShowFirstLimit] = useState(false);
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
      <div className="app-shell">
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
  const openSettings = (route: SettingsRoute) => {
    setSettingsRoute(route);
    setTab('settings');
  };

  if (showFirstLimit) {
    return (
      <div className="app-shell">
        <FirstLimit
          budget={budget}
          onSetupReserves={() => {
            setShowFirstLimit(false);
            openSettings({ screen: 'reserve', category: 'groceries' });
          }}
          onDone={() => setShowFirstLimit(false)}
        />
      </div>
    );
  }

  return (
    <div className="app-shell">
      {tab === 'today' && (
        <Home
          data={data}
          budget={budget}
          today={today}
          update={update}
          isBannerHidden={(key) => isBannerHidden(ui, key, today)}
          onHideBanner={(key) => setUi((state) => hideBanner(state, key, today))}
          installHint={shouldShowInstallHint(ui, install.platform, install.standalone) ? install.platform : null}
          onDismissInstallHint={() => setUi((state) => ({ ...state, installHintDismissed: true }))}
          onOpenSettings={openSettings}
        />
      )}
      {tab === 'history' && <History data={data} budget={budget} today={today} update={update} />}
      {tab === 'settings' && (
        <Settings
          data={data}
          budget={budget}
          today={today}
          route={settingsRoute}
          onNavigate={setSettingsRoute}
          update={update}
          accent={ui.accent}
          onAccentChange={(accent) => setUi((state) => ({ ...state, accent }))}
          install={install}
        />
      )}
      <TabBar
        active={tab}
        onChange={(next) => {
          if (next === 'settings') setSettingsRoute({ screen: 'main' });
          setTab(next);
        }}
      />
    </div>
  );
}
