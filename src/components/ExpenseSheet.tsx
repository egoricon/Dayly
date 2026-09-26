import { useState } from 'react';
import { addExpense, addIncome, updateExpense } from '../appData';
import { calculateBudget, previewExpense, RESERVE_CATEGORIES, type ReserveState } from '../domain/budget';
import { formatMoney, parseAmount } from '../domain/money';
import { occurrenceToClose } from '../domain/planned';
import type { AppData, Category, LocalDate, ReserveCategory, Transaction } from '../domain/types';
import { applyKey } from '../ui/amountInput';
import { CATEGORY_NAMES, CATEGORY_ORDER, RESERVE_NAMES } from '../ui/labels';
import { BottomSheet } from './BottomSheet';
import { amountText, Segmented } from './Form';
import { Keypad } from './Keypad';

export type EntryMode = 'expense' | 'income';

/** Opens the sheet in «Доход» mode for a planned income that came with another amount. */
export interface IncomePreset {
  sourceId: string;
  plannedDate: LocalDate;
}

interface ExpenseSheetProps {
  data: AppData;
  today: LocalDate;
  reserves: ReserveState[];
  dailyLimitKopecks: number;
  incomePreset?: IncomePreset;
  /** «+ Доход» on the home screen opens the sheet in income mode. */
  initialMode?: EntryMode;
  /** An expense to change instead of adding a new one (long press → «Изменить»). */
  editing?: Transaction;
  onSave: (next: AppData) => void;
  onClose: () => void;
}

function isReserve(category: Category): category is ReserveCategory {
  return (RESERVE_CATEGORIES as readonly Category[]).includes(category);
}

const OTHER_INCOME = 'other';

/**
 * 2g: amount, live preview, categories, keypad. «+ Трата» → amount → «Добавить». Also records
 * incomes and changes an existing expense.
 */
export function ExpenseSheet({ data, today, reserves, dailyLimitKopecks, incomePreset, initialMode, editing, onSave, onClose }: ExpenseSheetProps) {
  const [mode, setMode] = useState<EntryMode>(incomePreset ? 'income' : (initialMode ?? 'expense'));
  const [input, setInput] = useState(() => (editing ? amountText(editing.amountKopecks) : ''));
  const [category, setCategory] = useState<Category>(editing?.category ?? data.settings.lastCategory);
  const [incomeSource, setIncomeSource] = useState(incomePreset?.sourceId ?? OTHER_INCOME);
  const amount = parseAmount(input) ?? 0;
  const sources = data.incomeSources.filter((s) => s.isActive);

  let hint: string;
  let danger = false;
  let next: AppData;
  const now = new Date();

  if (mode === 'expense') {
    const preview = previewExpense(data, today, amount, category, editing?.id ?? null);
    next = editing ? updateExpense(data, editing.id, amount, category) : addExpense(data, amount, category, today, now);
    if (isReserve(category) && preview.fromLimitKopecks === 0) {
      hint = `Из резерва ${RESERVE_NAMES[category]} · дневной лимит не изменится`;
    } else if (isReserve(category)) {
      const configured = reserves.some((r) => r.category === category && r.budgetKopecks > 0);
      hint = configured
        ? `Резерв ${RESERVE_NAMES[category]} кончился, ${formatMoney(preview.fromLimitKopecks)} из лимита`
        : `Резерв ${RESERVE_NAMES[category]} не задан, трата идёт из лимита`;
      danger = preview.remainingTodayKopecks < 0;
    } else if (preview.remainingTodayKopecks >= 0) {
      hint = `Останется на сегодня ${formatMoney(preview.remainingTodayKopecks)}`;
    } else {
      hint = `Перерасход сегодня: ${formatMoney(-preview.remainingTodayKopecks)}`;
      danger = true;
    }
  } else {
    const sourceId = incomeSource === OTHER_INCOME ? null : incomeSource;
    const plannedDate =
      sourceId === null
        ? null
        : incomePreset?.sourceId === sourceId
          ? incomePreset.plannedDate
          : occurrenceToClose(data, sourceId, today);
    next = addIncome(data, amount, sourceId, plannedDate, today, now);
    const newLimit = amount === 0 ? dailyLimitKopecks : calculateBudget(next, today).dailyLimitKopecks;
    if (newLimit !== dailyLimitKopecks) hint = `Лимит станет ${formatMoney(newLimit)} в день`;
    else if (plannedDate && amount > 0) hint = 'Лимит не изменится: эти деньги уже учтены';
    else hint = 'Дневной лимит не изменится';
  }

  return (
    <BottomSheet onClose={onClose} className="expense-sheet">
      {(close) => {
        const submit = () => {
          if (amount === 0) return;
          onSave(next);
          close();
        };
        return (
          <>
            {editing ? (
              <p className="sheet-title">Изменить трату</p>
            ) : (
              <Segmented
                options={[
                  { value: 'expense', label: 'Трата' },
                  { value: 'income', label: 'Доход' },
                ]}
                value={mode}
                onChange={setMode}
              />
            )}
            <div className="sheet-amount">
              <div className="sheet-amount-value">
                <span className="sheet-amount-number" data-testid="sheet-amount">
                  {input === '' ? '0' : input}
                </span>
                <span className="sheet-amount-currency">BYN</span>
              </div>
              <span className={`sheet-hint${danger ? ' is-danger' : ''}`} data-testid="sheet-hint">
                {hint}
              </span>
            </div>
            <div className="chips">
              {mode === 'expense'
                ? CATEGORY_ORDER.map((c) => (
                    <button
                      key={c}
                      type="button"
                      className={`chip${c === category ? ' is-selected' : ''}${isReserve(c) ? ' is-reserve' : ''}`}
                      aria-pressed={c === category}
                      onClick={() => setCategory(c)}
                    >
                      {isReserve(c) ? `${CATEGORY_NAMES[c]} · резерв` : CATEGORY_NAMES[c]}
                    </button>
                  ))
                : [...sources.map((s) => ({ id: s.id, name: s.name })), { id: OTHER_INCOME, name: 'Другое' }].map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      className={`chip${s.id === incomeSource ? ' is-selected' : ''}`}
                      aria-pressed={s.id === incomeSource}
                      onClick={() => setIncomeSource(s.id)}
                    >
                      {s.name}
                    </button>
                  ))}
            </div>
            <div className="spacer" />
            <Keypad keyHeight={50} onKey={(key) => setInput((value) => applyKey(value, key))} onEnter={submit} onEscape={close} />
            <button type="button" className="button-primary button-add" disabled={amount === 0} onClick={submit}>
              {editing ? 'Сохранить' : 'Добавить'}
            </button>
          </>
        );
      }}
    </BottomSheet>
  );
}
