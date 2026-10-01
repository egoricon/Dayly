import { useLayoutEffect, useRef, useState } from 'react';
import { addExpense, addIncome, updateExpense } from '../appData';
import { calculateBudget, previewExpense, type ReserveState } from '../domain/budget';
import { activeCategories, findCategory, isReserveCategory, startCategory } from '../domain/categories';
import { addDays } from '../domain/dates';
import { formatMoney, parseAmount } from '../domain/money';
import { occurrenceToClose } from '../domain/planned';
import type { AppData, Category, LocalDate, Transaction } from '../domain/types';
import { applyKey } from '../ui/amountInput';
import { BottomSheet } from './BottomSheet';
import { amountText, Segmented } from './Form';
import { Keypad } from './Keypad';

export type EntryMode = 'expense' | 'income';

/** «Сегодня / Вчера» under the amount of a new expense: a forgotten one goes to yesterday. */
type ExpenseDay = 'today' | 'yesterday';

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
  /** An expense to change instead of adding a new one (a tap on it → «Изменить»). */
  editing?: Transaction;
  onSave: (next: AppData) => void;
  onClose: () => void;
}

const OTHER_INCOME = 'other';

/**
 * 2g: amount, live preview, categories, keypad. «+ Трата» → amount → «Добавить». Also records
 * incomes and changes an existing expense.
 */
export function ExpenseSheet({ data, today, reserves, dailyLimitKopecks, incomePreset, initialMode, editing, onSave, onClose }: ExpenseSheetProps) {
  const [mode, setMode] = useState<EntryMode>(incomePreset ? 'income' : (initialMode ?? 'expense'));
  const [input, setInput] = useState(() => (editing ? amountText(editing.amountKopecks) : ''));
  const [category, setCategory] = useState<Category>(editing?.category ?? startCategory(data));
  const [incomeSource, setIncomeSource] = useState(incomePreset?.sourceId ?? OTHER_INCOME);
  // Every opening starts on «Сегодня»; «Вчера» only for a new expense and not before tracking started.
  const [day, setDay] = useState<ExpenseDay>('today');
  const yesterday = addDays(today, -1);
  const canYesterday = !editing && yesterday >= data.settings.trackingStartDate;
  const expenseDate = editing ? editing.date : day === 'yesterday' && canYesterday ? yesterday : today;
  const amount = parseAmount(input) ?? 0;
  // With «Крупный текст» on a short screen the chips scroll sideways (styles.css): show the chosen one.
  const chips = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const strip = chips.current;
    const chosen = strip?.querySelector('.chip.is-selected');
    if (!strip || !chosen || strip.scrollWidth <= strip.clientWidth) return;
    const box = strip.getBoundingClientRect();
    const chip = chosen.getBoundingClientRect();
    strip.scrollLeft += chip.left - box.left - (box.width - chip.width) / 2;
  }, [mode]);
  const sources = data.incomeSources.filter((s) => s.isActive);
  // An edited expense of a removed category still shows its category.
  const edited = findCategory(data, editing?.category ?? null);
  const categories = edited && !edited.isActive ? [...activeCategories(data), edited] : activeCategories(data);
  const isReserve = (id: Category) => isReserveCategory(data, id);
  const name = findCategory(data, category)?.name ?? '';

  let hint: string;
  let danger = false;
  let next: AppData;
  const now = new Date();

  if (mode === 'expense') {
    const preview = previewExpense(data, today, amount, category, editing?.id ?? null, expenseDate);
    next = editing ? updateExpense(data, editing.id, amount, category) : addExpense(data, amount, category, today, now, null, expenseDate);
    if (expenseDate < today) {
      // An earlier day's expense leaves less money for the days ahead: say what today's limit becomes.
      const limit =
        preview.dailyLimitKopecks === dailyLimitKopecks ? 'не изменится' : `станет ${formatMoney(preview.dailyLimitKopecks)}`;
      if (amount === 0) hint = `Лимит на сегодня ${formatMoney(dailyLimitKopecks)}`;
      else if (isReserve(category) && preview.fromLimitKopecks === 0) hint = `Из резерва «${name}» · лимит на сегодня ${limit}`;
      else hint = `Лимит на сегодня ${limit}`;
      danger = preview.remainingTodayKopecks < 0;
    } else if (isReserve(category) && preview.fromLimitKopecks === 0) {
      hint = `Из резерва «${name}» · дневной лимит не изменится`;
    } else if (isReserve(category)) {
      const configured = reserves.some((r) => r.category === category && r.budgetKopecks > 0);
      hint = configured
        ? `Резерв «${name}» кончился, ${formatMoney(preview.fromLimitKopecks)} из лимита`
        : `Резерв «${name}» не задан, трата идёт из лимита`;
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
              {mode === 'expense' && canYesterday && (
                <div className="day-switch" data-testid="day-switch">
                  <Segmented
                    label="День траты"
                    options={[
                      { value: 'today', label: 'Сегодня' },
                      { value: 'yesterday', label: 'Вчера' },
                    ]}
                    value={day}
                    onChange={setDay}
                  />
                </div>
              )}
              <span className={`sheet-hint${danger ? ' is-danger' : ''}`} data-testid="sheet-hint">
                {hint}
              </span>
            </div>
            <div className="chips" ref={chips}>
              {mode === 'expense'
                ? categories.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className={`chip${c.id === category ? ' is-selected' : ''}${isReserve(c.id) ? ' is-reserve' : ''}`}
                      aria-pressed={c.id === category}
                      onClick={() => setCategory(c.id)}
                    >
                      {isReserve(c.id) ? `${c.name} · резерв` : c.name}
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
            <Keypad onKey={(key) => setInput((value) => applyKey(value, key))} onEnter={submit} onEscape={close} />
            <button type="button" className="button-primary button-add" disabled={amount === 0} onClick={submit}>
              {editing ? 'Сохранить' : 'Добавить'}
            </button>
          </>
        );
      }}
    </BottomSheet>
  );
}
