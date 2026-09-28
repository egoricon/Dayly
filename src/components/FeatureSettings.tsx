import { useState } from 'react';
import { FEATURES, type FeatureKey } from '../uiState';
import { WhatsNewSheet } from './WhatsNew';
import '../styles/intro.css';

interface FeatureSettingsProps {
  features: Record<FeatureKey, boolean>;
  onChange: (key: FeatureKey, on: boolean) => void;
  /** «Показать подсказки снова»: the first-launch tips show on the home screen again. */
  onShowTips: () => void;
  onOpenCalendar: () => void;
}

/** «Настройки → Функции»: a switch per feature of update 1, the tips again and «Что нового». */
export function FeatureSettings({ features, onChange, onShowTips, onOpenCalendar }: FeatureSettingsProps) {
  const [whatsNew, setWhatsNew] = useState(false);
  return (
    <>
      <span className="section-label">Функции</span>
      <ul className="card list" data-testid="settings-features">
        {FEATURES.map(({ key, label }) => (
          <li key={key}>
            <button type="button" role="switch" aria-checked={features[key]} className="list-row" onClick={() => onChange(key, !features[key])}>
              <span className="list-name">{label}</span>
              <span className={`switch${features[key] ? ' is-on' : ''}`} aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
      <p className="form-note">Выключенное просто не показывается, данные остаются.</p>
      <ul className="card list">
        <li>
          <button type="button" className="list-row" onClick={onShowTips}>
            <span className="list-text">
              <span className="list-name">Показать подсказки снова</span>
              <span className="list-sub">{features.calendar ? 'про круг, траты и календарь' : 'про круг и траты'}</span>
            </span>
          </button>
        </li>
        <li>
          <button type="button" className="list-row" onClick={() => setWhatsNew(true)}>
            <span className="list-name">Что нового</span>
          </button>
        </li>
      </ul>
      {whatsNew && <WhatsNewSheet canOpenCalendar={features.calendar} onOpenCalendar={onOpenCalendar} onClose={() => setWhatsNew(false)} />}
    </>
  );
}
