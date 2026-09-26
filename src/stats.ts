// Anonymous launch counter (GoatCounter, dayly.goatcounter.com). It learns only that the app was
// opened, whether for the first time on this device, and how (home screen, browser, Telegram).
// Never amounts, operations or anything else from the data. Off in Settings → «Анонимная статистика».

export const STATS_ENDPOINT = 'https://dayly.goatcounter.com/count';

/** A return from the background after this long counts as another launch. */
export const RESUME_AS_LAUNCH_MS = 30 * 60 * 1000;

export type LaunchMode = 'app' | 'browser' | 'telegram' | 'in-app';

const MODE_TITLES: Record<LaunchMode, string> = {
  app: 'с главного экрана',
  browser: 'в браузере',
  telegram: 'в Telegram',
  'in-app': 'во встроенном браузере',
};

export function launchMode(standalone: boolean, inApp: 'telegram' | 'other' | null): LaunchMode {
  if (inApp === 'telegram') return 'telegram';
  if (inApp === 'other') return 'in-app';
  return standalone ? 'app' : 'browser';
}

/** The counter's URL for one launch: '/first/app' or '/repeat/browser' and a readable title. */
export function launchHitUrl(first: boolean, mode: LaunchMode, referrer: string, nonce: string): string {
  const params = new URLSearchParams({
    p: `/${first ? 'first' : 'repeat'}/${mode}`,
    t: `${first ? 'Первый запуск' : 'Повторный запуск'}, ${MODE_TITLES[mode]}`,
    r: referrer,
    rnd: nonce,
  });
  return `${STATS_ENDPOINT}?${params.toString()}`;
}

/** Only the published app counts: not development, tests or automated browsers. */
export function canCount(production: boolean, hostname: string, automated: boolean): boolean {
  return production && !automated && hostname !== 'localhost' && hostname !== '127.0.0.1';
}

/** Sends one launch as an image request; offline or blocked, it is simply lost. */
export function countLaunch(first: boolean, mode: LaunchMode): void {
  if (!canCount(import.meta.env.PROD, window.location.hostname, navigator.webdriver === true)) return;
  const image = new Image();
  image.src = launchHitUrl(first, mode, document.referrer, Math.random().toString(36).slice(2));
}
