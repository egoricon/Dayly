import { useEffect, useRef, useState } from 'react';
import { setTheme } from '../appData';
import { backupFileName, makeBackup, parseBackup, saveBackupFile, type ParsedBackup } from '../backup';
import { BottomSheet } from '../components/BottomSheet';
import { FormScreen, Segmented } from '../components/Form';
import { InstallSteps, type InstallInfo } from '../components/InstallHint';
import { toLocalDate } from '../domain/dates';
import type { AppData } from '../domain/types';
import { formatDayMonth } from '../ui/labels';
import { ACCENTS, type Accent } from '../uiState';
import type { Update } from './Finances';

export type SettingsRoute = { screen: 'main' } | { screen: 'install' };

export interface SettingsProps {
  data: AppData;
  route: SettingsRoute;
  onNavigate: (route: SettingsRoute) => void;
  update: Update;
  accent: Accent;
  onAccentChange: (accent: Accent) => void;
  install: InstallInfo;
  /** «Анонимная статистика»: launches only, see src/stats.ts. */
  statsEnabled: boolean;
  onStatsChange: (enabled: boolean) => void;
  /** Deletes all data on this device and starts over from onboarding. */
  onReset: () => void;
  /** Replaces the data with a restored backup. */
  onImport: (data: AppData) => void;
}

const SHARE_TEXT = 'Dayly считает, сколько можно тратить каждый день, чтобы денег хватило до стипендии или зарплаты.';

/** App settings only: look, installing, sharing, reset. Money lives in «Финансы». */
export function Settings(props: SettingsProps) {
  const { data, route, onNavigate, update } = props;
  const [copied, setCopied] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [restoring, setRestoring] = useState<ParsedBackup | null>(null);
  const [backupError, setBackupError] = useState(false);
  const previous = useRef(route.screen);
  const cameBack = route.screen === 'main' && previous.current !== 'main';
  useEffect(() => {
    previous.current = route.screen;
  }, [route.screen]);

  if (route.screen === 'install') return <InstallGuide install={props.install} onBack={() => onNavigate({ screen: 'main' })} />;

  const share = () => {
    const url = new URL('./', window.location.href).href;
    if (navigator.share) {
      navigator.share({ title: 'Dayly', text: SHARE_TEXT, url }).catch(() => {
        // Closing the share menu is not an error.
      });
    } else {
      void navigator.clipboard?.writeText(url).then(() => setCopied(true));
    }
  };

  return (
    <main className={`screen settings with-tabs${cameBack ? ' is-back' : ''}`}>
      <h1 className="screen-title">Настройки</h1>

      <span className="section-label">Тема</span>
      <Segmented
        options={[
          { value: 'light', label: 'Светлая' },
          { value: 'dark', label: 'Тёмная' },
          { value: 'auto', label: 'Авто' },
        ]}
        value={data.settings.theme}
        onChange={(theme) => update((d) => setTheme(d, theme))}
      />

      <span className="section-label">Цвет акцента</span>
      <div className="card accent-picker" role="radiogroup" aria-label="Цвет акцента">
        {ACCENTS.map((a) => (
          <button
            key={a.id}
            type="button"
            role="radio"
            aria-checked={props.accent === a.id}
            className={`accent-swatch${props.accent === a.id ? ' is-selected' : ''}`}
            onClick={() => props.onAccentChange(a.id)}
          >
            <span className="accent-swatch-dot" style={{ background: `oklch(0.82 ${a.chroma} ${a.hue})` }} />
            {a.label}
          </button>
        ))}
      </div>

      <span className="section-label">Приложение</span>
      <ul className="card list">
        <li>
          <button type="button" className="list-row" onClick={() => onNavigate({ screen: 'install' })}>
            <span className="list-text">
              <span className="list-name">Как добавить на главный экран</span>
              <span className="list-sub">{props.install.standalone ? 'уже добавлено' : 'чтобы открывать как приложение'}</span>
            </span>
          </button>
        </li>
        <li>
          <button type="button" className="list-row" onClick={share}>
            <span className="list-text">
              <span className="list-name">Поделиться Dayly</span>
              <span className="list-sub">{copied ? 'ссылка скопирована' : 'отправить ссылку другу'}</span>
            </span>
          </button>
        </li>
        <li>
          <button
            type="button"
            role="switch"
            aria-checked={props.statsEnabled}
            className="list-row"
            onClick={() => props.onStatsChange(!props.statsEnabled)}
          >
            <span className="list-text">
              <span className="list-name">Анонимная статистика</span>
              <span className="list-sub">считаем только открытия приложения, без сумм и операций</span>
            </span>
            <span className={`switch${props.statsEnabled ? ' is-on' : ''}`} aria-hidden="true" />
          </button>
        </li>
      </ul>

      <span className="section-label">Данные</span>
      <ul className="card list">
        <li>
          <button
            type="button"
            className="list-row"
            onClick={() => void saveBackupFile(makeBackup(data, new Date()), backupFileName(toLocalDate(new Date())))}
          >
            <span className="list-text">
              <span className="list-name">Сохранить копию</span>
              <span className="list-sub">файл со всеми данными, чтобы перенести на другой телефон</span>
            </span>
          </button>
        </li>
        <li>
          <label className="list-row">
            <span className="list-text">
              <span className="list-name">Восстановить из копии</span>
              <span className={`list-sub${backupError ? ' is-danger' : ''}`}>
                {backupError ? 'это не копия Dayly, выбери другой файл' : 'данные на этом телефоне заменятся'}
              </span>
            </span>
            <input
              type="file"
              accept=".json,application/json"
              className="visually-hidden"
              data-testid="restore-input"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (!file) return;
                const parsed = parseBackup(await file.text());
                setBackupError(parsed === null);
                setRestoring(parsed);
              }}
            />
          </label>
        </li>
      </ul>
      <button type="button" className="button-action is-danger" onClick={() => setConfirmReset(true)}>
        Сбросить всё
      </button>

      {restoring && (
        <BottomSheet onClose={() => setRestoring(null)} className="action-sheet">
          {(close) => (
            <>
              <p className="action-title">
                Восстановить копию{restoring.exportedAt ? ` от ${formatDayMonth(toLocalDate(new Date(restoring.exportedAt)))}` : ''}?
              </p>
              <p className="action-text">
                В копии {restoring.data.transactions.length} операций. Текущие данные на этом телефоне заменятся ею.
              </p>
              <button type="button" className="button-action" onClick={() => props.onImport(restoring.data)}>
                Восстановить
              </button>
              <button type="button" className="button-action" onClick={close}>
                Отмена
              </button>
            </>
          )}
        </BottomSheet>
      )}

      {confirmReset && (
        <BottomSheet onClose={() => setConfirmReset(false)} className="action-sheet">
          {(close) => (
            <>
              <p className="action-title">Удалить все данные?</p>
              <p className="action-text">
                Пропадут траты, доходы, платежи, цели, любимые траты и настройки. Вернуть их будет нельзя, приложение начнётся с начала.
              </p>
              <button type="button" className="button-action is-danger" onClick={props.onReset}>
                Удалить всё
              </button>
              <button type="button" className="button-action" onClick={close}>
                Отмена
              </button>
            </>
          )}
        </BottomSheet>
      )}
    </main>
  );
}

/** Instructions for both platforms; the current device's one comes first. */
function InstallGuide({ install, onBack }: { install: InstallInfo; onBack: () => void }) {
  const ios = (
    <div className="card install-card" key="ios">
      <strong>iPhone, Safari</strong>
      <InstallSteps platform="ios" />
    </div>
  );
  const android = (
    <div className="card install-card" key="android">
      <strong>Android, Chrome</strong>
      <InstallSteps platform={install.platform === 'prompt' ? 'prompt' : 'android'} />
    </div>
  );
  return (
    <FormScreen title="На главный экран" onBack={onBack}>
      {install.standalone && (
        <div className="card status-card">
          <span>Dayly уже открыт с главного экрана.</span>
        </div>
      )}
      {install.platform === 'ios' ? [ios, android] : [android, ios]}
    </FormScreen>
  );
}
