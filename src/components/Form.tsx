import { useState, type ReactNode, type RefObject } from 'react';

// Building blocks for the edit forms in settings («стандартные формы в стилистике макетов»).

export function FormScreen({ title, onBack, children }: { title: string; onBack: () => void; children: ReactNode }) {
  return (
    <main className="screen form-screen">
      <button type="button" className="back-link" onClick={onBack}>
        ‹ Назад
      </button>
      <h1 className="screen-title">{title}</h1>
      <div className="form-body">{children}</div>
    </main>
  );
}

/**
 * A labelled field. `group` is for a set of buttons (segmented choice, calendar): a <label> around
 * them would name the first button after the whole field and press it on a tap on the caption.
 */
export function Field({ label, hint, group = false, children }: { label: string; hint?: string; group?: boolean; children: ReactNode }) {
  const content = (
    <>
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </>
  );
  return group ? (
    <div className="field" role="group" aria-label={label}>
      {content}
    </div>
  ) : (
    <label className="field">{content}</label>
  );
}

/** What a form still needs before its main button works, and the field to show for it. */
export interface Missing {
  text: string;
  field?: RefObject<HTMLElement | null>;
}

/** The first thing still missing, or null when the form is ready. */
export function firstMissing(checks: [boolean, Missing][]): Missing | null {
  return checks.find(([isMissing]) => isMissing)?.[1] ?? null;
}

/**
 * The main button of a form. While something is missing it looks inactive; a tap says what is
 * missing and brings that field into view, instead of silently doing nothing.
 */
export function SubmitButton({ missing, onClick, children }: { missing: Missing | null; onClick: () => void; children: ReactNode }) {
  const [asked, setAsked] = useState(false);
  return (
    <>
      {asked && missing && (
        <p className="form-missing" role="alert" data-testid="form-missing">
          {missing.text}
        </p>
      )}
      <button
        type="button"
        className={`button-primary button-large${missing ? ' is-incomplete' : ''}`}
        aria-disabled={missing !== null}
        onClick={() => {
          if (!missing) {
            onClick();
            return;
          }
          setAsked(true);
          const field = missing.field?.current;
          field?.scrollIntoView({ block: 'center', behavior: 'smooth' });
          if (field instanceof HTMLInputElement) field.focus({ preventScroll: true });
        }}
      >
        {children}
      </button>
    </>
  );
}

/** Money typed as text: '12,40'. The parent parses it with parseAmount. */
export function AmountInput({
  value,
  onChange,
  placeholder = '0,00',
  inputRef,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  inputRef?: RefObject<HTMLInputElement | null>;
}) {
  return (
    <span className="amount-input">
      <input
        ref={inputRef}
        className="input"
        inputMode="decimal"
        autoComplete="off"
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <span className="amount-input-currency">BYN</span>
    </span>
  );
}

export function DaySelect({ value, onChange }: { value: number; onChange: (day: number) => void }) {
  return (
    <select className="input" value={value} onChange={(event) => onChange(Number(event.target.value))}>
      {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
        <option key={day} value={day}>
          {day}-го числа
        </option>
      ))}
    </select>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="segmented" role="radiogroup">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          className={o.value === value ? 'is-selected' : ''}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Amount text from kopecks for a prefilled field: 22000 -> '220', 1250 -> '12,50'. */
export function amountText(kopecks: number): string {
  if (kopecks === 0) return '';
  const cents = kopecks % 100;
  return cents === 0 ? String(kopecks / 100) : `${Math.floor(kopecks / 100)},${String(cents).padStart(2, '0')}`;
}
