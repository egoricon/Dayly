import { useRef, useState } from 'react';
import { weekdayIndex } from '../domain/dates';
import { parseAmount } from '../domain/money';
import type { IncomeSource, LocalDate } from '../domain/types';
import { incomeKindName, type EventDraft, type EventKind, type Repeat } from '../events';
import { formatDayHeader, scheduleText } from '../ui/labels';
import { BottomSheet } from './BottomSheet';
import { Calendar } from './Calendar';
import { AmountInput, amountText, Field, firstMissing, SubmitButton } from './Form';
import '../styles/events.css';

const INCOME_KINDS: IncomeSource['kind'][] = ['scholarship', 'salary', 'parents', 'other'];
const REPEATS: Repeat[] = ['once', 'monthly', 'weekly'];

/** «Повтор» options as in a phone calendar: 'Не повторять', 'Каждый месяц, 13-го', 'Каждую неделю, по понедельникам'. */
export function repeatLabel(repeat: Repeat, date: LocalDate | null): string {
  switch (repeat) {
    case 'once':
      return 'Не повторять';
    case 'monthly': {
      if (date === null) return 'Каждый месяц';
      const day = Number(date.slice(8, 10));
      // 29–31 fall on the last day of a shorter month.
      return `Каждый месяц, ${day}-го${day > 28 ? ' (или в последний день)' : ''}`;
    }
    case 'weekly':
      return date === null
        ? 'Каждую неделю'
        : `Каждую неделю, ${scheduleText({ dayOfMonth: null, weekday: weekdayIndex(date) + 1, date: null })}`;
  }
}

/** The tapped day, or null to pick the day in a calendar within [minDate, maxDate]. */
type EventDateProps = { date: LocalDate; minDate?: undefined; maxDate?: undefined } | { date: null; minDate: LocalDate; maxDate: LocalDate };

type EventSheetProps = EventDateProps & {
  kind: EventKind;
  /** An existing event to change, or a preset for a new one (a chip like «Общежитие»). Repeat defaults to «Не повторять». */
  initial?: Partial<EventDraft>;
  editing?: boolean;
  onSave: (draft: EventDraft) => void;
  /** Shown as «Удалить» when given. */
  onDelete?: () => void;
  onClose: () => void;
};

/**
 * One form for a planned income or «расход» (a mandatory payment): name, amount and «Повтор».
 * Used by the day sheet of «Календарь» and by the first setup.
 */
export function EventSheet({ kind, date: fixedDate, minDate, maxDate, initial, editing = false, onSave, onDelete, onClose }: EventSheetProps) {
  const [incomeKind, setIncomeKind] = useState<IncomeSource['kind']>(initial?.incomeKind ?? 'other');
  const [name, setName] = useState(initial?.name ?? (kind === 'income' ? incomeKindName(initial?.incomeKind ?? 'other') : ''));
  const [amount, setAmount] = useState(amountText(initial?.amountKopecks ?? 0));
  const [pickedDate, setPickedDate] = useState<LocalDate | null>(initial?.date ?? null);
  const [repeat, setRepeat] = useState<Repeat>(initial?.repeat ?? 'once');
  const date = fixedDate ?? pickedDate;
  const kopecks = parseAmount(amount) ?? 0;
  const nameInput = useRef<HTMLInputElement>(null);
  const amountInput = useRef<HTMLInputElement>(null);
  const calendar = useRef<HTMLDivElement>(null);
  const missing = firstMissing([
    [name.trim() === '', { text: kind === 'income' ? 'Напиши, что это за доход' : 'Напиши, что оплатить', field: nameInput }],
    [kopecks === 0, { text: 'Напиши сумму', field: amountInput }],
    [date === null, { text: 'Выбери день в календаре', field: calendar }],
  ]);

  const title = editing ? (initial?.name ?? '') : kind === 'income' ? 'Доход' : 'Расход';

  return (
    <BottomSheet onClose={onClose} className="form-sheet event-sheet">
      {(close) => (
        <>
          <div className="sheet-body">
            <div className="event-sheet-head">
              <h2 className="sheet-title">{title}</h2>
              {fixedDate && <span className="event-sheet-date">{formatDayHeader(fixedDate)}</span>}
            </div>
            {kind === 'income' && (
              <div className="chips chips-left event-kinds">
                {INCOME_KINDS.map((k) => (
                  <button
                    key={k}
                    type="button"
                    className={`chip${k === incomeKind ? ' is-selected' : ''}`}
                    aria-pressed={k === incomeKind}
                    onClick={() => {
                      // The name follows the kind until the person types their own.
                      if (name.trim() === '' || name === incomeKindName(incomeKind)) setName(incomeKindName(k));
                      setIncomeKind(k);
                    }}
                  >
                    {incomeKindName(k)}
                  </button>
                ))}
              </div>
            )}
            <Field label="Название">
              <input
                ref={nameInput}
                className="input"
                placeholder={kind === 'income' ? 'Например, подработка' : 'Например, общежитие'}
                maxLength={40}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
            <Field label="Сумма">
              <AmountInput value={amount} onChange={setAmount} inputRef={amountInput} />
            </Field>
            {fixedDate === null && (
              <Field label="Когда" group>
                <div ref={calendar}>
                  <Calendar min={minDate!} max={maxDate!} value={pickedDate} onChange={setPickedDate} />
                </div>
              </Field>
            )}
            <Field
              label="Повтор"
              group
              hint={
                kind === 'payment'
                  ? 'Эти деньги отложим заранее, в дневной лимит они не попадут.'
                  : repeat === 'once'
                    ? 'Учтём в прогнозе только в этот день.'
                    : 'Будем ждать эти деньги в каждый повтор.'
              }
            >
              <div className="card list repeat-options" role="radiogroup" aria-label="Повтор">
                {REPEATS.map((r) => (
                  <button
                    key={r}
                    type="button"
                    role="radio"
                    aria-checked={r === repeat}
                    className={`list-row repeat-option${r === repeat ? ' is-selected' : ''}`}
                    onClick={() => setRepeat(r)}
                  >
                    <span className="list-name">{repeatLabel(r, date)}</span>
                    <svg className="repeat-check" width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
                      <path d="M3.5 9.5l3.5 3.5 7.5-8" fill="none" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                ))}
              </div>
            </Field>
            {onDelete && (
              <button
                type="button"
                className="link-danger"
                onClick={() => {
                  onDelete();
                  close();
                }}
              >
                {repeat === 'once' ? 'Удалить' : 'Удалить со всеми повторами'}
              </button>
            )}
          </div>
          <SubmitButton
            missing={missing}
            onClick={() => {
              onSave({ kind, incomeKind, name: name.trim(), amountKopecks: kopecks, date: date!, repeat });
              close();
            }}
          >
            {editing ? 'Сохранить' : 'Добавить'}
          </SubmitButton>
        </>
      )}
    </BottomSheet>
  );
}
