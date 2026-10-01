import { useState } from 'react';
import { putIntoJar, takeFromJar } from '../appData';
import type { SavingsTarget } from '../domain/jars';
import { parseAmount } from '../domain/money';
import type { AppData, LocalDate } from '../domain/types';
import { applyKey } from '../ui/amountInput';
import { putJars, putPreview, takeJars, takePreview } from '../ui/jars';
import { BottomSheet } from './BottomSheet';
import { SubmitButton } from './Form';
import { Keypad } from './Keypad';

export type MoveKind = 'put' | 'take';

interface MoveSheetProps {
  kind: MoveKind;
  data: AppData;
  today: LocalDate;
  /** The jar chosen first, e.g. the cushion for «Взять из подушки» on the home screen. */
  initialKey?: string;
  onSave: (next: AppData) => void;
  onClose: () => void;
}

/**
 * «Положить» and «Забрать» of «Копилка»: an amount on the keypad, the jar, and what it does (the new
 * limit; for «Забрать» also when the jar fills or how much a day it needs). Putting in never goes beyond
 * the free money of the checkpoints, taking out never beyond what the jar holds.
 */
export function MoveSheet({ kind, data, today, initialKey, onSave, onClose }: MoveSheetProps) {
  const jars = kind === 'put' ? putJars(data, today) : takeJars(data, today);
  const [input, setInput] = useState('');
  const [key, setKey] = useState(() => (jars.some((j) => j.key === initialKey) ? initialKey! : (jars[0]?.key ?? null)));
  const jar = jars.find((j) => j.key === key) ?? null;
  const amount = parseAmount(input) ?? 0;
  const preview = jar
    ? (kind === 'put' ? putPreview : takePreview)(data, jar.target, amount, today)
    : { lines: [kind === 'put' ? 'Положить некуда' : 'В копилке пока пусто'], danger: false, missing: 'Нет банки' };
  const move = (target: SavingsTarget) =>
    kind === 'put' ? putIntoJar(data, target, amount, today, new Date()) : takeFromJar(data, target, amount, today, new Date());

  return (
    <BottomSheet onClose={onClose} className="expense-sheet move-sheet">
      {(close) => {
        const submit = () => {
          if (!jar || preview.missing) return;
          onSave(move(jar.target));
          close();
        };
        return (
          <>
            <p className="sheet-title">{kind === 'put' ? 'Положить в копилку' : 'Забрать из копилки'}</p>
            <div className="sheet-amount">
              <div className="sheet-amount-value">
                <span className="sheet-amount-number" data-testid="sheet-amount">
                  {input === '' ? '0' : input}
                </span>
                <span className="sheet-amount-currency">BYN</span>
              </div>
              <span className="move-lines" data-testid="move-preview" aria-live="polite">
                {preview.lines.map((line, index) => (
                  <span key={line} className={`sheet-hint${preview.danger && index === 0 ? ' is-danger' : ''}`}>
                    {line}
                  </span>
                ))}
              </span>
            </div>
            {jars.length > 0 && (
              <div className="chips" role="group" aria-label={kind === 'put' ? 'Куда положить' : 'Откуда забрать'}>
                {jars.map((j) => (
                  <button
                    key={j.key}
                    type="button"
                    className={`chip${j.key === key ? ' is-selected' : ''}`}
                    aria-pressed={j.key === key}
                    onClick={() => setKey(j.key)}
                  >
                    {j.name}
                  </button>
                ))}
              </div>
            )}
            <div className="spacer" />
            <Keypad onKey={(k) => setInput((value) => applyKey(value, k))} onEnter={submit} onEscape={close} />
            <SubmitButton missing={preview.missing === null ? null : { text: preview.missing }} onClick={submit}>
              {kind === 'put' ? 'Положить' : 'Забрать'}
            </SubmitButton>
          </>
        );
      }}
    </BottomSheet>
  );
}
