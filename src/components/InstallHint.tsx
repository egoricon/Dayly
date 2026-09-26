import { useEffect, useState } from 'react';
import { afterLeave } from '../ui/motion';
import { canPromptInstall, detectPlatform, isStandalone, promptInstall, subscribeInstallPrompt } from '../install';
import type { InstallPlatform } from '../uiState';

export interface InstallInfo {
  platform: InstallPlatform;
  standalone: boolean;
}

/** The platform follows beforeinstallprompt, which Chrome may fire after the first render. */
export function useInstallInfo(): InstallInfo {
  const [hasPrompt, setHasPrompt] = useState(canPromptInstall);
  useEffect(() => subscribeInstallPrompt(() => setHasPrompt(canPromptInstall())), []);
  return {
    platform: detectPlatform(navigator.userAgent, navigator.maxTouchPoints ?? 0, hasPrompt),
    standalone: isStandalone(),
  };
}

function ShareIcon() {
  return (
    <svg className="install-icon" width="16" height="18" viewBox="0 0 16 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-label="значок «Поделиться»">
      <path d="M8 11V1.5M4.5 5 8 1.5 11.5 5" />
      <path d="M5 7.5H3a1 1 0 0 0-1 1V16a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V8.5a1 1 0 0 0-1-1h-2" />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg className="install-icon" width="6" height="18" viewBox="0 0 6 18" fill="currentColor" aria-label="значок меню">
      <circle cx="3" cy="3" r="1.8" />
      <circle cx="3" cy="9" r="1.8" />
      <circle cx="3" cy="15" r="1.8" />
    </svg>
  );
}

/** Steps for one platform; «Установить» calls the browser dialog where Chrome offers it. */
export function InstallSteps({ platform }: { platform: InstallPlatform }) {
  if (platform === 'prompt') {
    return (
      <button type="button" className="banner-yes" onClick={() => void promptInstall()}>
        Установить
      </button>
    );
  }
  if (platform === 'ios') {
    return (
      <ol className="install-steps" data-testid="install-steps-ios">
        <li>
          Нажми <strong>«Поделиться»</strong> <ShareIcon /> в панели Safari.
        </li>
        <li>
          Выбери <strong>«На экран „Домой“»</strong>, при необходимости пролистай список.
        </li>
        <li>
          Нажми <strong>«Добавить»</strong>.
        </li>
      </ol>
    );
  }
  return (
    <ol className="install-steps" data-testid="install-steps-android">
      <li>
        Открой меню <MenuIcon /> в правом верхнем углу Chrome.
      </li>
      <li>
        Выбери <strong>«Добавить на гл. экран»</strong> или <strong>«Установить приложение»</strong>.
      </li>
      <li>
        Нажми <strong>«Установить»</strong>.
      </li>
    </ol>
  );
}

/** Card on the home screen. */
export function InstallHint({ platform, onDismiss }: { platform: InstallPlatform; onDismiss: () => void }) {
  const [leaving, setLeaving] = useState(false);
  return (
    <div className={`install-card is-entering${leaving ? ' is-leaving' : ''}`} data-testid="install-hint">
      <strong>Добавь Dayly на главный экран</strong>
      <span className="banner-sub">Будет открываться как приложение, без адресной строки, и работать без интернета.</span>
      <InstallSteps platform={platform} />
      <button type="button" className="install-close" aria-label="Скрыть подсказку"
        onClick={() => {
          setLeaving(true);
          afterLeave(onDismiss);
        }}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M2 2l10 10M12 2 2 12" />
        </svg>
      </button>
    </div>
  );
}

/** On top of every screen inside Telegram and similar apps: open Dayly in the real browser. */
export function InAppBrowserBanner({ app, ios, onDismiss }: { app: 'telegram' | 'other'; ios: boolean; onDismiss: () => void }) {
  const where = app === 'telegram' ? 'Внутри Telegram' : 'Во встроенном браузере';
  return (
    <div className="in-app-banner" role="note" data-testid="in-app-banner">
      <strong>Открой Dayly в {ios ? 'Safari' : 'браузере'}</strong>
      <span>{where} данные хранятся отдельно и могут пропасть, а на главный экран приложение не добавить.</span>
      <span>
        {ios ? (
          <>
            Нажми <strong>•••</strong> и выбери <strong>«Открыть в Safari»</strong>.
          </>
        ) : (
          <>
            Нажми <MenuIcon /> и выбери <strong>«Открыть в браузере»</strong>.
          </>
        )}
      </span>
      <button type="button" className="install-close" aria-label="Скрыть подсказку" onClick={onDismiss}>
        <svg width="14" height="14" viewBox="0 0 14 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M2 2l10 10M12 2 2 12" />
        </svg>
      </button>
    </div>
  );
}
