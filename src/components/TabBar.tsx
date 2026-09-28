import type { ReactNode } from 'react';

// 'calendar' is the «Календарь» tab of update 1 (its entry in TABS comes with the calendar screen).
export type Tab = 'today' | 'calendar' | 'history' | 'finances' | 'settings';

const TABS: { tab: Tab; label: string; icon: ReactNode }[] = [
  {
    tab: 'today',
    label: 'Сегодня',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="8.5" fill="none" strokeWidth="3" />
      </svg>
    ),
  },
  {
    tab: 'history',
    label: 'История',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 7h14M5 12h14M5 17h9" fill="none" strokeWidth="2.4" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    tab: 'finances',
    label: 'Финансы',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3.5" y="6" width="17" height="13" rx="3" fill="none" strokeWidth="2.2" />
        <path d="M6 6l9-2.5 1.2 2.5M15.5 12.5h5" fill="none" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    tab: 'settings',
    label: 'Настройки',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 8h9M18 8h1M5 16h1M10 16h9" fill="none" strokeWidth="2.4" strokeLinecap="round" />
        <circle cx="16" cy="8" r="2.2" fill="none" strokeWidth="2.2" />
        <circle cx="8" cy="16" r="2.2" fill="none" strokeWidth="2.2" />
      </svg>
    ),
  },
];

export function TabBar({ active, onChange }: { active: Tab; onChange: (tab: Tab) => void }) {
  return (
    <nav className="tab-bar">
      {TABS.map(({ tab, label, icon }) => (
        <button
          key={tab}
          type="button"
          className={`tab${tab === active ? ' is-active' : ''}`}
          aria-current={tab === active ? 'page' : undefined}
          onClick={() => onChange(tab)}
        >
          {icon}
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}
