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
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {
      // The app works without it, only not offline.
    });
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
