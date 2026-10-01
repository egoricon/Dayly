import { useRef, useState } from 'react';
import {
  deleteTransaction,
  INCOME_KIND_NAMES,
  markPaymentPaid,
  newId,
  reconcileBalance,
  removeCategory,
  removeFavorite,
  removeIncomeSource,
  removePayment,
  saveCategory,
  saveFavorite,
  saveIncomeSource,
  savePayment,
} from '../appData';
import { ChoiceRows } from '../components/EventSheet';
import { AmountInput, amountText, DaySelect, Field, firstMissing, FormScreen, Segmented, SubmitButton, type Missing } from '../components/Form';
import { calculateBudget } from '../domain/budget';
import { activeCategories, findCategory, startCategory } from '../domain/categories';
import { addDays, maxDate, nextOccurrence, weekdayIndex, type Schedule } from '../domain/dates';
import { formatKopecks, formatMoney, parseAmount } from '../domain/money';
import { paymentOccurrence, paymentTransaction } from '../domain/planned';
import type { Category, ExpenseCategory, IncomeSource, LocalDate, MandatoryPayment } from '../domain/types';
import { isCurrentPlan, startDateAfterSave } from '../events';
import { formatDayMonth, scheduleText, WEEKDAY_SHORT } from '../ui/labels';
import type { FinanceProps } from './Finances';

type FormProps = Omit<FinanceProps, 'route'> & { onBack: () => void };

const INCOME_KINDS: IncomeSource['kind'][] = ['scholarship', 'salary', 'parents', 'other'];

/** How often an income comes or a payment is due; incomes can also be irregular. */
type Repeat = 'monthly' | 'weekly' | 'once' | 'irregular';

const REPEAT_OPTIONS: { value: Repeat; label: string }[] = [
  { value: 'monthly', label: 'Раз в месяц' },
  { value: 'weekly', label: 'Раз в неделю' },
  { value: 'once', label: 'Один раз' },
  { value: 'irregular', label: 'Нерегулярно' },
];

function repeatOf(schedule: Schedule): Repeat {
  if (schedule.weekday !== null) return 'weekly';
  if (schedule.dayOfMonth !== null) return 'monthly';
  return schedule.date !== null ? 'once' : 'irregular';
}

/** The schedule being edited in a form: how often, and the day of the month, the weekday or the date. */
function useSchedule(existing: Schedule | undefined, today: LocalDate, trackingStartDate: LocalDate) {
  const [repeat, setRepeat] = useState<Repeat>(existing ? repeatOf(existing) : 'monthly');
  const [day, setDay] = useState(existing?.dayOfMonth ?? Number(today.slice(8)));
  const [weekday, setWeekday] = useState(existing?.weekday ?? weekdayIndex(today) + 1);
  const [date, setDate] = useState(existing?.date ?? '');
  const dateInput = useRef<HTMLInputElement>(null);
  const schedule: Schedule = {
    dayOfMonth: repeat === 'monthly' ? day : null,
    weekday: repeat === 'weekly' ? weekday : null,
    date: repeat === 'once' ? date : null,
  };
  const missing: [boolean, Missing][] = [
    [repeat === 'once' && date === '', { text: 'Выбери дату', field: dateInput }],
    // Days before the start of tracking are not counted, so the entry would never show.
    [repeat === 'once' && date !== '' && date < trackingStartDate, { text: `Выбери дату не раньше ${formatDayMonth(trackingStartDate)}`, field: dateInput }],
  ];
  // A one-off in the past starts on its day, anything else today; a change of name or amount keeps the start.
  const from = repeat === 'once' && date !== '' && date < today ? date : today;
  return { repeat, setRepeat, day, setDay, weekday, setWeekday, date, setDate, dateInput, trackingStartDate, schedule, missing, from };
}

/** «Когда приходит» / «Когда платить»: the same rows as «Повтор» in the calendar, then the day, the weekday or the date. */
function ScheduleFields({ label, hint, repeats, when }: { label: string; hint?: string; repeats: Repeat[]; when: ReturnType<typeof useSchedule> }) {
  return (
    <>
      <Field label={label} group hint={hint}>
        <ChoiceRows label={label} options={REPEAT_OPTIONS.filter((o) => repeats.includes(o.value))} value={when.repeat} onChange={when.setRepeat} />
      </Field>
      {when.repeat === 'monthly' && (
        <Field label="Число месяца">
          <DaySelect value={when.day} onChange={when.setDay} />
        </Field>
      )}
      {when.repeat === 'weekly' && (
        <Field label="День недели" group>
          <Segmented
            options={WEEKDAY_SHORT.map((label, i) => ({ value: String(i + 1), label }))}
            value={String(when.weekday)}
            onChange={(v) => when.setWeekday(Number(v))}
          />
        </Field>
      )}
      {when.repeat === 'once' && (
        <Field label="Дата">
          <input
            ref={when.dateInput}
            className="input"
            type="date"
            min={when.trackingStartDate}
            value={when.date}
            onChange={(e) => when.setDate(e.target.value)}
          />
        </Field>
      )}
    </>
  );
}

export function IncomeForm({ data, today, update, id, onBack }: FormProps & { id: string | null }) {
  const existing = data.incomeSources.find((s) => s.id === id);
  const [kind, setKind] = useState(existing?.kind ?? 'salary');
  const [name, setName] = useState(existing?.name ?? INCOME_KIND_NAMES.salary);
  const [amount, setAmount] = useState(amountText(existing?.amountKopecks ?? 0));
  const when = useSchedule(existing, today, data.settings.trackingStartDate);
  // Only a monthly or weekly income can set the period.
  const recurring = when.repeat === 'monthly' || when.repeat === 'weekly';
  const [isMain, setIsMain] = useState(existing ? data.settings.mainIncomeSourceId === existing.id : data.settings.mainIncomeSourceId === null);
  const kopecks = parseAmount(amount) ?? 0;
  const nameInput = useRef<HTMLInputElement>(null);
  const amountInput = useRef<HTMLInputElement>(null);
  const missing = firstMissing([
    [name.trim() === '', { text: 'Напиши название дохода', field: nameInput }],
    [kopecks === 0, { text: 'Напиши сумму', field: amountInput }],
    ...when.missing,
  ]);

  const save = () => {
    update((d) =>
      saveIncomeSource(
        d,
        {
          id: existing?.id ?? newId(),
          kind,
          name: name.trim(),
          amountKopecks: kopecks,
          ...when.schedule,
          startDate: startDateAfterSave(existing, when.schedule, when.from),
          isActive: true,
        },
        recurring && isMain,
      ),
    );
    onBack();
  };

  return (
    <FormScreen title={existing ? existing.name : 'Новый доход'} onBack={onBack}>
      <div className="chips chips-left">
        {INCOME_KINDS.map((k) => (
          <button
            key={k}
            type="button"
            className={`chip${k === kind ? ' is-selected' : ''}`}
            onClick={() => {
              if (name === INCOME_KIND_NAMES[kind] || name === '') setName(INCOME_KIND_NAMES[k]);
              setKind(k);
            }}
          >
            {INCOME_KIND_NAMES[k]}
          </button>
        ))}
      </div>
      <Field label="Название">
        <input ref={nameInput} className="input" value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Сумма">
        <AmountInput value={amount} onChange={setAmount} inputRef={amountInput} />
      </Field>
      <ScheduleFields
        label="Когда приходит"
        repeats={['monthly', 'weekly', 'once', 'irregular']}
        when={when}
        hint={
          when.repeat === 'irregular'
            ? 'Нерегулярные деньги не входят в прогноз. Внеси их в «Доход», когда придут.'
            : when.repeat === 'once'
              ? 'Учтём в прогнозе только в этот день.'
              : undefined
        }
      />
      {recurring && (
        <label className="checkbox-row">
          <input type="checkbox" checked={isMain} onChange={(e) => setIsMain(e.target.checked)} />
          <span>Основное поступление: бюджет растягивается до него</span>
        </label>
      )}
      <SubmitButton missing={missing} onClick={save}>
        Сохранить
      </SubmitButton>
      {existing && (
        <button
          type="button"
          className="link-danger"
          onClick={() => {
            update((d) => removeIncomeSource(d, existing.id));
            onBack();
          }}
        >
          Удалить доход
        </button>
      )}
    </FormScreen>
  );
}

export function PaymentsList({ data, budget, onNavigate, onBack }: FormProps) {
  // By the date shown: this period's occurrence, else the next one after it. One-off payments of
  // earlier periods are history and stay only in the calendar.
  const shownDate = (p: MandatoryPayment) =>
    paymentOccurrence(data, p.id, budget.period) ?? nextOccurrence(p, addDays(budget.period.end, 1)) ?? '9999-12-31';
  const payments = data.payments
    .filter((p) => p.isActive && isCurrentPlan(p, budget.period))
    .map((p) => ({ p, date: shownDate(p) }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .map(({ p }) => p);
  return (
    <FormScreen title="Обязательные платежи" onBack={onBack}>
      {payments.length > 0 && (
        <ul className="card list" data-testid="payments-list">
          {payments.map((p) => {
            const date = paymentOccurrence(data, p.id, budget.period);
            const paid = date !== null && paymentTransaction(data, p.id, date) !== undefined;
            // '1-го · до 1 октября', 'по воскресеньям · оплачено · 27 сентября', 'разово · 10 ноября'.
            const when = p.date !== null ? 'разово' : scheduleText(p);
            const status =
              date === null
                ? p.date !== null
                  ? formatDayMonth(p.date)
                  : 'в этом периоде нет'
                : paid
                  ? `оплачено · ${formatDayMonth(date)}`
                  : `до ${formatDayMonth(date)}`;
            return (
              <li key={p.id}>
                <button type="button" className="list-row" onClick={() => onNavigate({ screen: 'payment', id: p.id })}>
                  <span className="list-text">
                    <span className="list-name">{p.name}</span>
                    <span className="list-sub">
                      {when} · {status}
                    </span>
                  </span>
                  <span className="list-value">{formatKopecks(p.amountKopecks)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <button type="button" className="button-dashed" onClick={() => onNavigate({ screen: 'payment', id: null })}>
        + Добавить платёж
      </button>
    </FormScreen>
  );
}

export function PaymentForm({ data, budget, today, update, id, onBack }: FormProps & { id: string | null }) {
  const existing = data.payments.find((p) => p.id === id);
  const [name, setName] = useState(existing?.name ?? '');
  const [amount, setAmount] = useState(amountText(existing?.amountKopecks ?? 0));
  const when = useSchedule(existing, today, data.settings.trackingStartDate);
  const kopecks = parseAmount(amount) ?? 0;
  const nameInput = useRef<HTMLInputElement>(null);
  const amountInput = useRef<HTMLInputElement>(null);
  const missing = firstMissing([
    [name.trim() === '', { text: 'Напиши, что оплатить', field: nameInput }],
    [kopecks === 0, { text: 'Напиши сумму платежа', field: amountInput }],
    ...when.missing,
  ]);

  const occurrence = existing ? paymentOccurrence(data, existing.id, budget.period) : null;
  const paidWith = existing && occurrence ? paymentTransaction(data, existing.id, occurrence) : undefined;
  const next = existing ? nextOccurrence(existing, maxDate(addDays(budget.period.end, 1), existing.startDate)) : null;

  return (
    <FormScreen title={existing ? existing.name : 'Новый платёж'} onBack={onBack}>
      {existing && (
        <div className="card status-card" data-testid="payment-status">
          {occurrence === null ? (
            <span>
              В этом периоде платежа нет.
              {next !== null && (existing.date !== null ? ` Он будет ${formatDayMonth(next)}.` : ` Следующий — ${formatDayMonth(next)}.`)}
            </span>
          ) : paidWith ? (
            <>
              <span>
                Платёж {formatDayMonth(occurrence)} оплачен: {formatMoney(paidWith.amountKopecks)}
              </span>
              <button type="button" className="link-muted" onClick={() => update((d) => deleteTransaction(d, paidWith.id))}>
                Отменить отметку
              </button>
            </>
          ) : (
            <>
              <span>Платёж {formatDayMonth(occurrence)} ещё не оплачен</span>
              <button
                type="button"
                className="button-secondary"
                onClick={() => update((d) => markPaymentPaid(d, existing, occurrence, today, new Date()))}
              >
                Отметить оплату · {formatKopecks(existing.amountKopecks)}
              </button>
            </>
          )}
        </div>
      )}
      <Field label="Что оплатить">
        <input ref={nameInput} className="input" placeholder="Например, общежитие" value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Сумма">
        <AmountInput value={amount} onChange={setAmount} inputRef={amountInput} />
      </Field>
      <ScheduleFields
        label="Когда платить"
        repeats={['monthly', 'weekly', 'once']}
        when={when}
        hint="Эти деньги отложим заранее, в дневной лимит они не попадут."
      />
      <SubmitButton
        missing={missing}
        onClick={() => {
          update((d) =>
            savePayment(d, {
              id: existing?.id ?? newId(),
              name: name.trim(),
              amountKopecks: kopecks,
              ...when.schedule,
              startDate: startDateAfterSave(existing, when.schedule, when.from),
              isActive: true,
            }),
          );
          onBack();
        }}
      >
        Сохранить
      </SubmitButton>
      {existing && (
        <button
          type="button"
          className="link-danger"
          onClick={() => {
            update((d) => removePayment(d, existing.id));
            onBack();
          }}
        >
          Удалить платёж
        </button>
      )}
    </FormScreen>
  );
}

/** A category: its name, and whether its expenses go to the daily limit or spend a reserve first. */
export function CategoryForm({ data, today, update, id, onBack }: FormProps & { id: string | null }) {
  const existing = data.settings.categories.find((c) => c.id === id);
  const [newCategoryId] = useState(newId);
  const [name, setName] = useState(existing?.name ?? '');
  const [mode, setMode] = useState<'limit' | 'reserve'>(existing && existing.reserveKopecks !== null ? 'reserve' : 'limit');
  const [amount, setAmount] = useState(amountText(existing?.reserveKopecks ?? 0));
  const kopecks = parseAmount(amount === '' ? '0' : amount);
  const trimmed = name.trim();
  const duplicate = activeCategories(data).some((c) => c.id !== existing?.id && c.name.toLowerCase() === trimmed.toLowerCase());
  const nameInput = useRef<HTMLInputElement>(null);
  const amountInput = useRef<HTMLInputElement>(null);
  const missing = firstMissing([
    [trimmed === '', { text: 'Напиши название категории', field: nameInput }],
    [duplicate, { text: 'Такая категория уже есть, назови её иначе', field: nameInput }],
    [mode === 'reserve' && kopecks === null, { text: 'Проверь сумму резерва', field: amountInput }],
  ]);
  const draft: ExpenseCategory = {
    id: existing?.id ?? newCategoryId,
    name: trimmed,
    reserveKopecks: mode === 'reserve' ? (kopecks ?? 0) : null,
    isActive: existing?.isActive ?? true,
  };
  // Shows the period with the typed reserve before it is saved.
  const state = mode === 'reserve' ? calculateBudget(saveCategory(data, draft), today).reserves.find((r) => r.category === draft.id) : undefined;
  const canRemove = existing !== undefined && existing.isActive && activeCategories(data).length > 1;

  return (
    <FormScreen title={existing ? existing.name : 'Новая категория'} onBack={onBack}>
      <Field label="Название" hint={duplicate ? 'Такая категория уже есть' : undefined}>
        <input ref={nameInput} className="input" placeholder="Например, спорт" maxLength={20} value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Траты идут" group>
        <Segmented
          options={[
            { value: 'limit', label: 'Из лимита' },
            { value: 'reserve', label: 'Из резерва' },
          ]}
          value={mode}
          onChange={setMode}
        />
      </Field>
      {mode === 'reserve' ? (
        <>
          <p className="form-note">
            Траты этой категории идут из резерва и не уменьшают дневной лимит. Когда резерв кончается, остаток траты идёт из лимита.
          </p>
          <Field label="Резерв на период" hint="Сумма на полный период. В первом неполном периоде берётся часть по оставшимся дням.">
            <AmountInput value={amount} onChange={setAmount} inputRef={amountInput} />
          </Field>
          {state && (
            <div className="card status-card" data-testid="reserve-status">
              <span>
                В этом периоде: {formatMoney(state.budgetKopecks)}, потрачено {formatMoney(state.usedKopecks)}, осталось{' '}
                {formatMoney(state.remainingKopecks)}
              </span>
            </div>
          )}
        </>
      ) : (
        <p className="form-note">Траты этой категории уменьшают дневной лимит.</p>
      )}
      <SubmitButton
        missing={missing}
        onClick={() => {
          update((d) => saveCategory(d, draft));
          onBack();
        }}
      >
        Сохранить
      </SubmitButton>
      {canRemove && (
        <button
          type="button"
          className="link-danger"
          onClick={() => {
            update((d) => removeCategory(d, existing.id));
            onBack();
          }}
        >
          Убрать категорию
        </button>
      )}
      {canRemove && <p className="form-note">Старые траты останутся в истории, остаток резерва вернётся в лимит. Убранную категорию можно вернуть.</p>}
    </FormScreen>
  );
}

export function ReconcileForm({ budget, today, update, onBack }: FormProps) {
  const [actual, setActual] = useState('');
  const kopecks = parseAmount(actual);

  return (
    <FormScreen title="Сверить баланс" onBack={onBack}>
      <div className="card status-card">
        <span>
          В приложении: <strong>{formatMoney(budget.balanceKopecks)}</strong>
        </span>
      </div>
      <Field label="Сколько у тебя на самом деле" hint="Сложи карту и наличные. Разница запишется как корректировка, и лимит пересчитается.">
        <AmountInput value={actual} onChange={setActual} />
      </Field>
      <button
        type="button"
        className="button-primary button-large"
        disabled={kopecks === null}
        onClick={() => {
          update((d) => reconcileBalance(d, kopecks!, budget.balanceKopecks, today, new Date()));
          onBack();
        }}
      >
        Сверить
      </button>
    </FormScreen>
  );
}

/** A favourite expense: label, amount and category. One tap on the home screen adds it. */
export function FavoriteForm({ data, update, id, onBack }: FormProps & { id: string | null }) {
  const existing = data.settings.favorites.find((f) => f.id === id);
  const [label, setLabel] = useState(existing?.label ?? '');
  const [amount, setAmount] = useState(amountText(existing?.amountKopecks ?? 0));
  const [category, setCategory] = useState<Category>(existing?.category ?? startCategory(data));
  // A favourite of a removed category keeps showing it.
  const own = findCategory(data, existing?.category ?? null);
  const categories = own && !own.isActive ? [...activeCategories(data), own] : activeCategories(data);
  const kopecks = parseAmount(amount) ?? 0;
  const labelInput = useRef<HTMLInputElement>(null);
  const amountInput = useRef<HTMLInputElement>(null);
  const missing = firstMissing([
    [label.trim() === '', { text: 'Напиши подпись для кнопки', field: labelInput }],
    [kopecks === 0, { text: 'Напиши сумму', field: amountInput }],
  ]);

  return (
    <FormScreen title={existing ? existing.label : 'Любимая трата'} onBack={onBack}>
      <Field label="Подпись" hint="Так кнопка будет называться на главной и в истории.">
        <input ref={labelInput} className="input" placeholder="Например, кофе" maxLength={24} value={label} onChange={(e) => setLabel(e.target.value)} />
      </Field>
      <Field label="Сумма">
        <AmountInput value={amount} onChange={setAmount} inputRef={amountInput} />
      </Field>
      <Field label="Категория" group>
        <div className="chips chips-left">
          {categories.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`chip${c.id === category ? ' is-selected' : ''}`}
              aria-pressed={c.id === category}
              onClick={() => setCategory(c.id)}
            >
              {c.name}
            </button>
          ))}
        </div>
      </Field>
      <SubmitButton
        missing={missing}
        onClick={() => {
          update((d) => saveFavorite(d, { id: existing?.id ?? newId(), label: label.trim(), amountKopecks: kopecks, category }));
          onBack();
        }}
      >
        Сохранить
      </SubmitButton>
      {existing && (
        <button
          type="button"
          className="link-danger"
          onClick={() => {
            update((d) => removeFavorite(d, existing.id));
            onBack();
          }}
        >
          Убрать из любимых
        </button>
      )}
    </FormScreen>
  );
}
