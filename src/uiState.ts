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

export interface UiState {
  /** Banners answered «Ещё нет»: banner key → the day it was hidden. */
  hiddenBanners: Record<string, LocalDate>;
  accent: Accent;
  /** How many times the app has been opened; the install hint waits for the second. */
  launches: number;
  installHintDismissed: boolean;
}

function isAccent(value: unknown): value is Accent {
  return ACCENTS.some((a) => a.id === value);
}

export function loadUiState(storage: Storage): UiState {
  try {
    const parsed = JSON.parse(storage.getItem(UI_KEY) ?? '{}') as Partial<UiState>;
    return {
      hiddenBanners: parsed.hiddenBanners ?? {},
      accent: isAccent(parsed.accent) ? parsed.accent : 'amber',
      launches: typeof parsed.launches === 'number' ? parsed.launches : 0,
      installHintDismissed: parsed.installHintDismissed === true,
    };
  } catch {
    return { hiddenBanners: {}, accent: 'amber', launches: 0, installHintDismissed: false };
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

/** The home-screen hint: from the second launch, until dismissed, never inside the installed app. */
export function shouldShowInstallHint(state: UiState, platform: InstallPlatform, standalone: boolean): boolean {
  return !standalone && platform !== 'other' && !state.installHintDismissed && state.launches >= 2;
}

export type InstallPlatform = 'ios' | 'android' | 'prompt' | 'other';
