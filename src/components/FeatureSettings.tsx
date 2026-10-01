import { useState } from 'react';
import { FEATURES, type FeatureKey } from '../uiState';
import { WhatsNewSheet } from './WhatsNew';
import '../styles/intro.css';

interface FeatureSettingsProps {
  features: Record<FeatureKey, boolean>;
  onChange: (key: FeatureKey, on: boolean) => void;
  /** «Начать знакомство заново»: every hint again, when it is next useful, and «Первая неделя» if still recent. */
  onRestartIntro: () => void;
  onOpenSavings: () => void;
}

/** «Настройки → Функции»: a switch per feature of updates 1 and 2, the hints again and «Что нового». */
export function FeatureSettings({ features, onChange, onRestartIntro, onOpenSavings }: FeatureSettingsProps) {
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
          <button type="button" className="list-row" onClick={onRestartIntro}>
            <span className="list-text">
              <span className="list-name">Начать знакомство заново</span>
              <span className="list-sub">подсказки снова появятся, когда пригодятся</span>
            </span>
          </button>
        </li>
        <li>
          <button type="button" className="list-row" onClick={() => setWhatsNew(true)}>
            <span className="list-name">Что нового</span>
          </button>
        </li>
      </ul>
      {whatsNew && <WhatsNewSheet canOpenSavings={features.savings} onOpenSavings={onOpenSavings} onClose={() => setWhatsNew(false)} />}
    </>
  );
}
