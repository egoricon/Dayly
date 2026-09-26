import { useState } from 'react';
import {
  buyGoal,
  cancelGoal,
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
  saveGoal,
  saveIncomeSource,
  savePayment,
  setCushionFixed,
  setCushionPercent,
  takeFromCushion,
} from '../appData';
import { AmountInput, amountText, DaySelect, Field, FormScreen, Segmented } from '../components/Form';
import { calculateBudget, cushionSavedBy, goalSavedBy } from '../domain/budget';
import { activeCategories, findCategory, startCategory } from '../domain/categories';
import { addDays, monthlyOccurrences, weekdayIndex } from '../domain/dates';
import { formatKopecks, formatMoney, parseAmount } from '../domain/money';
import { paymentOccurrence, paymentTransaction } from '../domain/planned';
import type { Category, ExpenseCategory, IncomeSource } from '../domain/types';
import { formatDayMonth, WEEKDAY_SHORT } from '../ui/labels';
import type { FinanceProps } from './Finances';

type FormProps = Omit<FinanceProps, 'route'> & { onBack: () => void };

const INCOME_KINDS: IncomeSource['kind'][] = ['scholarship', 'salary', 'parents', 'other'];

export function IncomeForm({ data, today, update, id, onBack }: FormProps & { id: string | null }) {
  const existing = data.incomeSources.find((s) => s.id === id);
  const [kind, setKind] = useState(existing?.kind ?? 'salary');
  const [name, setName] = useState(existing?.name ?? INCOME_KIND_NAMES.salary);
  const [amount, setAmount] = useState(amountText(existing?.amountKopecks ?? 0));
  const [schedule, setSchedule] = useState<'monthly' | 'weekly' | 'irregular'>(
    existing?.weekday != null ? 'weekly' : existing && existing.dayOfMonth === null ? 'irregular' : 'monthly',
  );
  const regular = schedule !== 'irregular';
  const [day, setDay] = useState(existing?.dayOfMonth ?? Number(today.slice(8)));
  const [weekday, setWeekday] = useState(existing?.weekday ?? weekdayIndex(today) + 1);
  const [isMain, setIsMain] = useState(existing ? data.settings.mainIncomeSourceId === existing.id : data.settings.mainIncomeSourceId === null);
  const kopecks = parseAmount(amount) ?? 0;
  const ready = name.trim() !== '' && kopecks > 0;

  const save = () => {
    update((d) =>
      saveIncomeSource(
        d,
        {
          id: existing?.id ?? newId(),
          kind,
          name: name.trim(),
          amountKopecks: kopecks,
          dayOfMonth: schedule === 'monthly' ? day : null,
          weekday: schedule === 'weekly' ? weekday : null,
          startDate: existing?.startDate ?? today,
          isActive: true,
        },
        regular && isMain,
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
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Сумма">
        <AmountInput value={amount} onChange={setAmount} />
      </Field>
      <Field label="Когда приходит" group hint={regular ? undefined : 'Нерегулярные деньги не входят в прогноз. Внеси их в «Доход», когда придут.'}>
        <Segmented
          options={[
            { value: 'monthly', label: 'Раз в месяц' },
            { value: 'weekly', label: 'Раз в неделю' },
            { value: 'irregular', label: 'Нерегулярно' },
          ]}
          value={schedule}
          onChange={setSchedule}
        />
      </Field>
      {regular && (
        <>
          {schedule === 'monthly' ? (
            <Field label="Число месяца">
              <DaySelect value={day} onChange={setDay} />
            </Field>
          ) : (
            <Field label="День недели" group>
              <Segmented
                options={WEEKDAY_SHORT.map((label, i) => ({ value: String(i + 1), label }))}
                value={String(weekday)}
                onChange={(v) => setWeekday(Number(v))}
              />
            </Field>
          )}
          <label className="checkbox-row">
            <input type="checkbox" checked={isMain} onChange={(e) => setIsMain(e.target.checked)} />
            <span>Основное поступление: бюджет растягивается до него</span>
          </label>
        </>
      )}
      <button type="button" className="button-primary button-large" disabled={!ready} onClick={save}>
        Сохранить
      </button>
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
  const payments = data.payments.filter((p) => p.isActive).sort((a, b) => a.dayOfMonth - b.dayOfMonth);
  return (
    <FormScreen title="Обязательные платежи" onBack={onBack}>
      {payments.length > 0 && (
        <ul className="card list" data-testid="payments-list">
          {payments.map((p) => {
            const date = paymentOccurrence(data, p.id, budget.period);
            const paid = date !== null && paymentTransaction(data, p.id, date) !== undefined;
            const status = date === null ? 'в этом периоде нет' : paid ? `оплачено · ${formatDayMonth(date)}` : `до ${formatDayMonth(date)}`;
            return (
              <li key={p.id}>
                <button type="button" className="list-row" onClick={() => onNavigate({ screen: 'payment', id: p.id })}>
                  <span className="list-text">
                    <span className="list-name">{p.name}</span>
                    <span className="list-sub">
                      {p.dayOfMonth}-го · {status}
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
  const [day, setDay] = useState(existing?.dayOfMonth ?? Number(today.slice(8)));
  const kopecks = parseAmount(amount) ?? 0;
  const ready = name.trim() !== '' && kopecks > 0;

  const occurrence = existing ? paymentOccurrence(data, existing.id, budget.period) : null;
  const paidWith = existing && occurrence ? paymentTransaction(data, existing.id, occurrence) : undefined;

  return (
    <FormScreen title={existing ? existing.name : 'Новый платёж'} onBack={onBack}>
      {existing && (
        <div className="card status-card" data-testid="payment-status">
          {occurrence === null ? (
            <span>В этом периоде платежа нет. Следующий — {formatDayMonth(nextOccurrence(existing.dayOfMonth, budget.period.end))}.</span>
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
        <input className="input" placeholder="Общежитие" value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Сумма">
        <AmountInput value={amount} onChange={setAmount} />
      </Field>
      <Field label="Каждый месяц">
        <DaySelect value={day} onChange={setDay} />
      </Field>
      <button
        type="button"
        className="button-primary button-large"
        disabled={!ready}
        onClick={() => {
          update((d) =>
            savePayment(d, {
              id: existing?.id ?? newId(),
              name: name.trim(),
              amountKopecks: kopecks,
              dayOfMonth: day,
              startDate: existing?.startDate ?? today,
              isActive: true,
            }),
          );
          onBack();
        }}
      >
        Сохранить
      </button>
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

function nextOccurrence(dayOfMonth: number, periodEnd: string): string {
  return monthlyOccurrences(dayOfMonth, addDays(periodEnd, 1), addDays(periodEnd, 32))[0]!;
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
  const ready = trimmed !== '' && !duplicate && (mode === 'limit' || kopecks !== null);
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
        <input className="input" placeholder="Спорт" maxLength={20} value={name} onChange={(e) => setName(e.target.value)} />
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
            <AmountInput value={amount} onChange={setAmount} />
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
      <button
        type="button"
        className="button-primary button-large"
        disabled={!ready}
        onClick={() => {
          update((d) => saveCategory(d, draft));
          onBack();
        }}
      >
        Сохранить
      </button>
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

export function CushionForm({ data, today, update, onBack }: FormProps) {
  const cushion = data.settings.cushion;
  const saved = cushionSavedBy(data, today);
  const [mode, setMode] = useState(cushion.mode);
  const [amount, setAmount] = useState(amountText(cushion.mode === 'fixed' ? cushion.amountKopecks : saved));
  const [percent, setPercent] = useState(String(cushion.mode === 'percent' ? cushion.percent : 3));
  const [take, setTake] = useState('');
  const amountKopecks = parseAmount(amount === '' ? '0' : amount);
  const percentValue = /^\d{1,2}$/.test(percent) ? Number(percent) : null;
  const takeKopecks = parseAmount(take) ?? 0;

  const save = () => {
    if (mode === 'fixed') update((d) => setCushionFixed(d, amountKopecks!));
    else if (cushion.mode !== 'percent' || cushion.percent !== percentValue) update((d) => setCushionPercent(d, percentValue!, today));
    onBack();
  };

  return (
    <FormScreen title="Подушка" onBack={onBack}>
      <p className="form-note">Запас на непредвиденное. Он не входит в дневной лимит, пока ты сам не возьмёшь из него.</p>
      <div className="card status-card">
        <span data-testid="cushion-saved">Сейчас в подушке {formatMoney(saved)}</span>
      </div>
      <Segmented
        options={[
          { value: 'fixed', label: 'Сумма' },
          { value: 'percent', label: 'Процент с дохода' },
        ]}
        value={mode}
        onChange={setMode}
      />
      {mode === 'fixed' ? (
        <Field label="Держать в подушке">
          <AmountInput value={amount} onChange={setAmount} />
        </Field>
      ) : (
        <Field label="Откладывать с каждого поступления" hint="Уже отложенное остаётся в подушке.">
          <span className="amount-input">
            <input className="input" inputMode="numeric" value={percent} onChange={(e) => setPercent(e.target.value)} />
            <span className="amount-input-currency">%</span>
          </span>
        </Field>
      )}
      <button
        type="button"
        className="button-primary button-large"
        disabled={mode === 'fixed' ? amountKopecks === null : percentValue === null || percentValue === 0}
        onClick={save}
      >
        Сохранить
      </button>

      <span className="section-label">Взять из подушки</span>
      <Field label="Сколько взять" hint="Эти деньги станут свободными и попадут в дневной лимит.">
        <AmountInput value={take} onChange={setTake} />
      </Field>
      <button
        type="button"
        className="button-secondary"
        disabled={takeKopecks === 0 || takeKopecks > saved}
        onClick={() => {
          update((d) => takeFromCushion(d, takeKopecks, today));
          onBack();
        }}
      >
        Взять {takeKopecks > 0 ? formatMoney(takeKopecks) : ''}
      </button>
    </FormScreen>
  );
}

export function GoalForm({ data, budget, today, update, id, onBack }: FormProps & { id: string | null }) {
  const existing = data.goals.find((g) => g.id === id);
  const [name, setName] = useState(existing?.name ?? '');
  const [target, setTarget] = useState(amountText(existing?.targetKopecks ?? 0));
  const [initial, setInitial] = useState(amountText(existing?.initialSavedKopecks ?? 0));
  const [deadline, setDeadline] = useState(existing?.deadline ?? '');
  const targetKopecks = parseAmount(target) ?? 0;
  const initialKopecks = parseAmount(initial === '' ? '0' : initial);
  const ready =
    name.trim() !== '' && targetKopecks > 0 && initialKopecks !== null && initialKopecks <= targetKopecks && deadline > today;

  const draft = {
    id: existing?.id ?? newId(),
    name: name.trim(),
    targetKopecks,
    initialSavedKopecks: initialKopecks ?? 0,
    startDate: existing?.startDate ?? today,
    deadline,
    status: 'active' as const,
  };
  const perPeriod = ready ? goalSavedBy(draft, budget.period.end) - goalSavedBy(draft, addDays(budget.period.start, -1)) : 0;

  return (
    <FormScreen title={existing ? existing.name : 'Новая цель'} onBack={onBack}>
      {existing && (
        <div className="card status-card">
          <span>
            Накоплено {formatMoney(goalSavedBy(existing, today))} из {formatMoney(existing.targetKopecks)}
          </span>
        </div>
      )}
      <Field label="На что копим">
        <input className="input" placeholder="Наушники" value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Сколько нужно">
        <AmountInput value={target} onChange={setTarget} />
      </Field>
      {!existing && (
        <Field label="Уже отложено">
          <AmountInput value={initial} onChange={setInitial} />
        </Field>
      )}
      <Field label="К какой дате" hint={ready ? `Будем откладывать по ${formatMoney(perPeriod)} в этом периоде.` : undefined}>
        <input className="input" type="date" min={addDays(today, 1)} value={deadline} onChange={(e) => setDeadline(e.target.value)} />
      </Field>
      <button
        type="button"
        className="button-primary button-large"
        disabled={!ready}
        onClick={() => {
          update((d) => saveGoal(d, draft));
          onBack();
        }}
      >
        Сохранить
      </button>
      {existing && (
        <>
          <button
            type="button"
            className="button-secondary"
            onClick={() => {
              update((d) => buyGoal(d, existing.id, existing.targetKopecks, today, new Date()));
              onBack();
            }}
          >
            Купил за {formatMoney(existing.targetKopecks)}
          </button>
          <button
            type="button"
            className="link-danger"
            onClick={() => {
              update((d) => cancelGoal(d, existing.id));
              onBack();
            }}
          >
            Отменить цель
          </button>
        </>
      )}
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
  const ready = label.trim() !== '' && kopecks > 0;

  return (
    <FormScreen title={existing ? existing.label : 'Любимая трата'} onBack={onBack}>
      <Field label="Подпись" hint="Так кнопка будет называться на главной и в истории.">
        <input className="input" placeholder="Кофе" maxLength={24} value={label} onChange={(e) => setLabel(e.target.value)} />
      </Field>
      <Field label="Сумма">
        <AmountInput value={amount} onChange={setAmount} />
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
      <button
        type="button"
        className="button-primary button-large"
        disabled={!ready}
        onClick={() => {
          update((d) => saveFavorite(d, { id: existing?.id ?? newId(), label: label.trim(), amountKopecks: kopecks, category }));
          onBack();
        }}
      >
        Сохранить
      </button>
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
