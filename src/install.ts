import type { InstallPlatform } from './uiState';

// Adding the app to the home screen: iOS has only the Share menu, Chrome fires beforeinstallprompt.

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

/** Called from main.tsx before React mounts: Chrome may fire the event early and only once. */
export function listenForInstallPrompt(): void {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferred = event as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    notify();
  });
}

export function subscribeInstallPrompt(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function canPromptInstall(): boolean {
  return deferred !== null;
}

/** Shows the browser's install dialog; true when the user accepted. */
export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  const event = deferred;
  deferred = null;
  notify();
  await event.prompt();
  return (await event.userChoice).outcome === 'accepted';
}

/** True when the app runs from the home screen rather than in a browser tab. */
export function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
}

export function detectPlatform(userAgent: string, maxTouchPoints: number, hasPrompt: boolean): InstallPlatform {
  // iPadOS reports itself as a Mac; touch points tell them apart.
  if (/iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1)) return 'ios';
  if (hasPrompt) return 'prompt';
  if (/Android/.test(userAgent)) return 'android';
  return 'other';
}

/**
 * Telegram, Instagram and similar apps open links in their own browser: its data is separate
 * from Safari and Chrome, and it cannot add the app to the home screen.
 */
export function detectInAppBrowser(userAgent: string, hasTelegramProxy: boolean): 'telegram' | 'other' | null {
  if (hasTelegramProxy || /Telegram/i.test(userAgent)) return 'telegram';
  if (/Instagram|FBAN|FBAV|VKClient|Line\//.test(userAgent)) return 'other';
  return null;
}
