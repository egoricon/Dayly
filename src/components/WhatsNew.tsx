import { useState } from 'react';
import { afterLeave } from '../ui/motion';
import { BottomSheet } from './BottomSheet';
import '../styles/intro.css';

// «Что нового» of update 2 (reports/update-2-full-map.md, 3.5): a card on the home screen for people who
// used the app before it, and the same text in «Настройки → Что нового».

const ITEMS = [
  'Копилка: свинка, банки, положить и забрать, округление трат.',
  'Календарь теперь во вкладке «Финансы».',
  'Трату можно изменить обычным нажатием и добавить вчерашнюю.',
  'В «Истории» — итоги по категориям за период.',
  '«Крупный текст» — в «Настройках».',
];

function WhatsNewText() {
  return (
    <>
      <strong className="whats-new-title">Что нового в Dayly</strong>
      <ul className="whats-new-list">
        {ITEMS.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </>
  );
}

interface WhatsNewProps {
  /** «Открыть копилку» is there only while «Копилка» is on in «Настройки → Функции». */
  canOpenSavings: boolean;
  onOpenSavings: () => void;
  onClose: () => void;
}

/** The card on the home screen; × closes it for good. */
export function WhatsNewCard({ canOpenSavings, onOpenSavings, onClose }: WhatsNewProps) {
  const [leaving, setLeaving] = useState(false);
  return (
    <div className={`card whats-new is-entering${leaving ? ' is-leaving' : ''}`} data-testid="whats-new">
      <WhatsNewText />
      {canOpenSavings && (
        <button type="button" className="banner-yes whats-new-open" onClick={onOpenSavings}>
          Открыть копилку
        </button>
      )}
      <button
        type="button"
        className="install-close"
        aria-label="Закрыть «Что нового»"
        onClick={() => {
          setLeaving(true);
          afterLeave(onClose);
        }}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M2 2l10 10M12 2 2 12" />
        </svg>
      </button>
    </div>
  );
}

/** «Настройки → Что нового»: the same text in a sheet. */
export function WhatsNewSheet({ canOpenSavings, onOpenSavings, onClose }: WhatsNewProps) {
  return (
    <BottomSheet onClose={onClose} className="whats-new-sheet">
      {(close) => (
        <>
          <div className="whats-new" data-testid="whats-new-sheet">
            <WhatsNewText />
          </div>
          {canOpenSavings ? (
            <button type="button" className="button-primary button-large" onClick={onOpenSavings}>
              Открыть копилку
            </button>
          ) : (
            <button type="button" className="button-primary button-large" onClick={close}>
              Понятно
            </button>
          )}
        </>
      )}
    </BottomSheet>
  );
}
