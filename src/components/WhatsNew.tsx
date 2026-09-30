import { useState } from 'react';
import { afterLeave } from '../ui/motion';
import { BottomSheet } from './BottomSheet';
import '../styles/intro.css';

// «Что нового» of update 1 (reports/update-1-map.md, 1.6): a card on the home screen for people who
// used the app before it, and the same text in «Настройки → Что нового».

const ITEMS = [
  'Календарь: нажми на дату и добавь доход или расход, разово или с повтором.',
  'Копилка: откладывай процент с каждого поступления, кольцо покажет, сколько уже отложено.',
  'Цель по лимиту: скажи, сколько хочешь тратить в день, и мы подскажем, как дотянуть.',
  'Неделя под кругом, отмена траты и итоги периода.',
  'Лишнее можно выключить в «Настройках → Функции».',
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
  /** «Открыть календарь» (in «Финансы») is there only while the calendar is on in «Настройки → Функции». */
  canOpenCalendar: boolean;
  onOpenCalendar: () => void;
  onClose: () => void;
}

/** The card on the home screen; × closes it for good. */
export function WhatsNewCard({ canOpenCalendar, onOpenCalendar, onClose }: WhatsNewProps) {
  const [leaving, setLeaving] = useState(false);
  return (
    <div className={`card whats-new is-entering${leaving ? ' is-leaving' : ''}`} data-testid="whats-new">
      <WhatsNewText />
      {canOpenCalendar && (
        <button type="button" className="banner-yes whats-new-open" onClick={onOpenCalendar}>
          Открыть календарь
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
export function WhatsNewSheet({ canOpenCalendar, onOpenCalendar, onClose }: WhatsNewProps) {
  return (
    <BottomSheet onClose={onClose} className="whats-new-sheet">
      {(close) => (
        <>
          <div className="whats-new" data-testid="whats-new-sheet">
            <WhatsNewText />
          </div>
          {canOpenCalendar ? (
            <button type="button" className="button-primary button-large" onClick={onOpenCalendar}>
              Открыть календарь
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
