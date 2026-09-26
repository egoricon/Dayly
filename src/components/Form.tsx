import type { ReactNode } from 'react';

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

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

/** Money typed as text: '12,40'. The parent parses it with parseAmount. */
export function AmountInput({ value, onChange, placeholder = '0,00' }: { value: string; onChange: (value: string) => void; placeholder?: string }) {
  return (
    <span className="amount-input">
      <input
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
