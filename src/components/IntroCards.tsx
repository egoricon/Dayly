import { useState } from 'react';
import type { FirstWeekCard as FirstWeekCardInfo, FirstWeekKey } from '../intro';
import { afterLeave } from '../ui/motion';
import '../styles/intro.css';

// Cards of «Знакомство» under the ring (update 2, 3.2 and 3.4); at most one of them shows at a time.

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M2 2l10 10M12 2 2 12" />
    </svg>
  );
}

function ItemMark({ done }: { done: boolean }) {
  return (
    <svg className="first-week-mark" width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
      {done ? (
        <>
          <circle cx="11" cy="11" r="10" className="first-week-mark-fill" />
          <path d="M6.5 11.2l3 3 6-6.4" fill="none" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="first-week-mark-tick" />
        </>
      ) : (
        <circle cx="11" cy="11" r="9.5" fill="none" strokeWidth="1.6" className="first-week-mark-ring" />
      )}
    </svg>
  );
}

interface FirstWeekCardProps {
  card: FirstWeekCardInfo;
  /** A tap on an item not done yet: where it can be done. Items without a place stay plain text. */
  onItem: (key: FirstWeekKey) => (() => void) | null;
  /** × or «Готово»: hidden for good. */
  onClose: () => void;
}

/** «Знакомство с Dayly · 2 из 5»: the items tick themselves; all five give «Готово» once. */
export function FirstWeekCard({ card, onItem, onClose }: FirstWeekCardProps) {
  const [leaving, setLeaving] = useState(false);
  const close = () => {
    if (leaving) return;
    setLeaving(true);
    afterLeave(onClose);
  };
  const done = card.items.filter((item) => item.done).length;
  return (
    <section className={`card first-week is-entering${leaving ? ' is-leaving' : ''}`} data-testid="first-week" aria-label="Знакомство с Dayly">
      {card.complete ? (
        <>
          <strong className="first-week-title">Готово, ты знаешь всё главное</strong>
          <span className="banner-sub">Остальное подскажу, когда случится впервые. Всё сразу — в «Настройках → Как устроен Dayly».</span>
        </>
      ) : (
        <>
          <strong className="first-week-title" data-testid="first-week-title">
            Знакомство с Dayly · {done} из {card.items.length}
          </strong>
          <ul className="first-week-list">
            {card.items.map((item) => {
              const open = item.done ? null : onItem(item.key);
              const content = (
                <>
                  <ItemMark done={item.done} />
                  <span>
                    {item.done && <span className="visually-hidden">Сделано: </span>}
                    {item.label}
                  </span>
                </>
              );
              return (
                <li key={item.key} className={item.done ? 'is-done' : undefined} data-testid="first-week-item" data-done={item.done}>
                  {open ? (
                    <button type="button" className="first-week-item" onClick={open}>
                      {content}
                    </button>
                  ) : (
                    <span className="first-week-item">{content}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
      <button type="button" className="install-close" aria-label="Скрыть знакомство" onClick={close}>
        <CloseIcon />
      </button>
    </section>
  );
}

interface BackupCardProps {
  /** Safari on an iPhone; any other browser is just «Браузер». */
  ios: boolean;
  /** «Сохранить»: the backup of «Настройки»; resolves when the file is handed over. */
  onSave: () => Promise<void>;
  /** «Не сейчас»: the card waits two weeks. */
  onLater: () => void;
}

/** «Сохрани копию»: in a browser data can go when the site is not opened for long. */
export function BackupCard({ ios, onSave, onLater }: BackupCardProps) {
  const [leaving, setLeaving] = useState(false);
  const leave = (then: () => void) => {
    if (leaving) return;
    setLeaving(true);
    afterLeave(then);
  };
  return (
    <div className={`card banner backup-card${leaving ? ' is-leaving' : ''}`} data-testid="backup-card">
      <strong>Сохрани копию</strong>
      <span className="banner-sub">
        {ios ? 'Safari' : 'Браузер'} может стереть данные, если долго не открывать Dayly. Сохрани копию — это секунда.
      </span>
      <div className="banner-actions">
        {/* The share sheet needs the tap itself, so the file goes at once; the card goes once it is handed over. */}
        <button type="button" className="banner-yes" onClick={() => void onSave()}>
          Сохранить
        </button>
        <button type="button" className="banner-other" onClick={() => leave(onLater)}>
          Не сейчас
        </button>
      </div>
    </div>
  );
}
