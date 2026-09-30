import type { ReactNode } from 'react';

// 'savings' is the «Копилка» tab of update 2; «Настройки → Функции» can hide it.
export type Tab = 'today' | 'savings' | 'history' | 'finances' | 'settings';

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
    tab: 'savings',
    label: 'Копилка',
    // The outline of a piggy bank facing right: body, snout, ear, eye, coin slot, legs and tail.
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <ellipse cx="11" cy="12.8" rx="8" ry="6" fill="none" strokeWidth="2.2" />
        <path
          d="M19 10.8h1.2a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H19M13.6 7.3l2.2-2.1.7 3.1M7.5 18v2.8M14.5 18v2.8M9 9.6h3.2M3.1 11.6l-1.5-1.2M15.5 11.2h.01"
          fill="none"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
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

/** `hidden`: tabs of features turned off in «Настройки → Функции». */
export function TabBar({ active, onChange, hidden = [] }: { active: Tab; onChange: (tab: Tab) => void; hidden?: Tab[] }) {
  return (
    <nav className="tab-bar">
      {TABS.filter(({ tab }) => !hidden.includes(tab)).map(({ tab, label, icon }) => (
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
