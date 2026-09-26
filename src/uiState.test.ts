import { describe, expect, it } from 'vitest';
import { detectInAppBrowser, detectPlatform } from './install';
import { hideBanner, loadUiState, shouldShowInstallHint, UI_KEY, type UiState } from './uiState';

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
    expect(state).toEqual({ hiddenBanners: { a: '2026-09-26' }, accent: 'amber', launches: 0, installHintDismissed: false });
  });

  it('ignores an unknown accent', () => {
    expect(loadUiState(storageWith(JSON.stringify({ accent: 'neon' }))).accent).toBe('amber');
    expect(loadUiState(storageWith(JSON.stringify({ accent: 'mint' }))).accent).toBe('mint');
  });

  it('keeps the accent when a banner is hidden', () => {
    const state: UiState = { hiddenBanners: {}, accent: 'sky', launches: 3, installHintDismissed: false };
    expect(hideBanner(state, 'x', '2026-09-26').accent).toBe('sky');
  });
});

describe('install hint', () => {
  const base: UiState = { hiddenBanners: {}, accent: 'amber', launches: 2, installHintDismissed: false };

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
