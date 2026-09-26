import '@fontsource/manrope/400.css';
import '@fontsource/manrope/600.css';
import '@fontsource/manrope/700.css';
import '@fontsource/manrope/800.css';
import './styles.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { listenForInstallPrompt } from './install';

listenForInstallPrompt();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Offline work and install to the home screen. In dev the service worker would cache stale code.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  // The first worker takes over a fresh page too; only a later one is a new version.
  const hadWorker = navigator.serviceWorker.controller !== null;
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('sw.js')
      .then((registration) => {
        // An app on the home screen comes back from the background without reloading, so look
        // for a new version every time it is opened.
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') registration.update().catch(() => {});
        });
      })
      .catch(() => {
        // The app works without it, only not offline.
      });
  });
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadWorker) reloadIntoNewVersion();
  });
}

/** Reloads into a new version at once, or when the app is next hidden if something is being entered. */
function reloadIntoNewVersion(): void {
  const busy = () => document.querySelector('[role="dialog"], .form-screen, input:focus') !== null;
  if (document.visibilityState === 'hidden' || !busy()) {
    window.location.reload();
    return;
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') window.location.reload();
  });
}

// iOS leaves the page shifted up after the keyboard closes (a gap under the tab bar, the top under
// the status bar). The page itself never scrolls, so put it back once no field has focus.
function resetPageScroll(): void {
  const field = document.activeElement?.matches('input, textarea, select');
  if (!field && (window.scrollY !== 0 || window.scrollX !== 0)) window.scrollTo(0, 0);
}
window.addEventListener('focusout', () => window.setTimeout(resetPageScroll, 100));
window.visualViewport?.addEventListener('resize', resetPageScroll);

// Asks the browser not to clear localStorage under storage pressure (Safari clears unused sites).
void navigator.storage?.persist?.().catch(() => false);
