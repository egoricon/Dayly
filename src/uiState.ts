import type { LocalDate } from './domain/types';

// Interface state, kept apart from AppData under its own key.

export const UI_KEY = 'dayly:ui';

export interface UiState {
  /** Banners answered «Ещё нет»: banner key → the day it was hidden. */
  hiddenBanners: Record<string, LocalDate>;
}

export function loadUiState(storage: Storage): UiState {
  try {
    const parsed = JSON.parse(storage.getItem(UI_KEY) ?? '{}') as Partial<UiState>;
    return { hiddenBanners: parsed.hiddenBanners ?? {} };
  } catch {
    return { hiddenBanners: {} };
  }
}

export function saveUiState(storage: Storage, state: UiState): void {
  storage.setItem(UI_KEY, JSON.stringify(state));
}

/** Hides a banner until tomorrow and forgets older answers. */
export function hideBanner(state: UiState, key: string, today: LocalDate): UiState {
  const kept = Object.fromEntries(Object.entries(state.hiddenBanners).filter(([, day]) => day === today));
  return { hiddenBanners: { ...kept, [key]: today } };
}

export function isBannerHidden(state: UiState, key: string, today: LocalDate): boolean {
  return state.hiddenBanners[key] === today;
}
