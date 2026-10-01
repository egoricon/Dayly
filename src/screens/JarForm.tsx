import { useRef, useState, type RefObject } from 'react';
import { buyGoal, cancelGoal, newId, saveGoal, setCushionFixed, setCushionPercent, setCushionTarget } from '../appData';
import { ChoiceRows } from '../components/EventSheet';
import { AmountInput, amountText, DaySelect, Field, firstMissing, FormScreen, Segmented, SubmitButton } from '../components/Form';
import { cushionSavedBy, goalSavedBy, type BudgetResult } from '../domain/budget';
import { addDays, weekdayIndex } from '../domain/dates';
import { deadlineDailyKopecks, fillForecast, goalKind, type JarKind } from '../domain/jars';
import { formatMoney, parseAmount } from '../domain/money';
import { incomeSplit, rebasedGoal } from '../domain/savings';
import type { AppData, Goal, GoalSchedule, LocalDate } from '../domain/types';
import { shortDate } from '../ui/jars';
import { WEEKDAY_SHORT } from '../ui/labels';
import { fromIncomeText, maxPercent, moneyInText, percentLimitText, percentRules, referenceIncome } from '../ui/savings';
import type { Update } from './Finances';

// Jar settings of «Копилка» (update 2, map section 3): one form for the cushion and the goals. A goal
// saves by a date, a percent of every income, an amount on a schedule or by hand.

interface JarFormProps {
  data: AppData;
  budget: BudgetResult;
  today: LocalDate;
  update: Update;
  onBack: () => void;
}

/** A percent typed as text: digits only, at most two. */
function PercentInput({ value, onChange, inputRef }: { value: string; onChange: (value: string) => void; inputRef: RefObject<HTMLInputElement | null> }) {
  return (
    <span className="amount-input">
      <input
        ref={inputRef}
        className="input"
        inputMode="numeric"
        autoComplete="off"
        placeholder="15"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 2))}
      />
      <span className="amount-input-currency">%</span>
    </span>
  );
}

/**
 * «Подушка»: a sum it holds or a percent of every income, and an optional target for the piggy and the
 * progress (it never caps the cushion). It cannot be deleted; money goes out by «Забрать».
 */
export function CushionForm({ data, today, update, onBack }: JarFormProps) {
  const cushion = data.settings.cushion;
  const saved = cushionSavedBy(data, today);
  const [mode, setMode] = useState(cushion.mode);
  const [amount, setAmount] = useState(amountText(saved));
  const [percent, setPercent] = useState(String(cushion.mode === 'percent' ? cushion.percent : 3));
  const [target, setTarget] = useState(amountText(cushion.targetKopecks ?? 0));
  const amountKopecks = parseAmount(amount === '' ? '0' : amount);
  const targetKopecks = parseAmount(target === '' ? '0' : target);
  const percentValue = /^\d{1,2}$/.test(percent) ? Number(percent) : null;
  // With percent goals the cushion's percent must leave something to live on too.
  const goalRules = percentRules(data).filter((r) => r.goalId !== null);
  const percentTooBig = (percentValue ?? 0) > maxPercent(goalRules);
  const amountInput = useRef<HTMLInputElement>(null);
  const percentInput = useRef<HTMLInputElement>(null);
  const targetInput = useRef<HTMLInputElement>(null);
  const missing = firstMissing([
    [mode === 'fixed' && amountKopecks === null, { text: 'Проверь сумму', field: amountInput }],
    [mode === 'percent' && !percentValue, { text: 'Напиши процент от 1 до 99', field: percentInput }],
    [mode === 'percent' && percentTooBig, { text: percentLimitText(goalRules), field: percentInput }],
    [targetKopecks === null, { text: 'Проверь цель', field: targetInput }],
  ]);

  const save = () => {
    update((d) => {
      let next = d;
      if (mode === 'fixed') next = setCushionFixed(next, amountKopecks!, today);
      else if (cushion.mode !== 'percent' || cushion.percent !== percentValue) next = setCushionPercent(next, percentValue!, today);
      return setCushionTarget(next, targetKopecks ? targetKopecks : null);
    });
    onBack();
  };

  return (
    <FormScreen title="Подушка" onBack={onBack}>
      <p className="form-note">Запас на непредвиденное. Он не входит в дневной лимит, пока ты сам не заберёшь из него.</p>
      <div className="card status-card">
        <span data-testid="cushion-saved">Сейчас в подушке {formatMoney(saved)}</span>
      </div>
      <Field label="Как копим" group>
        <Segmented
          options={[
            { value: 'fixed', label: 'Сумма' },
            { value: 'percent', label: 'Процент с дохода' },
          ]}
          value={mode}
          onChange={setMode}
        />
      </Field>
      {mode === 'fixed' ? (
        <Field label="Держать в подушке">
          <AmountInput value={amount} onChange={setAmount} inputRef={amountInput} />
        </Field>
      ) : (
        <Field label="Откладывать с каждого поступления" hint={percentTooBig ? percentLimitText(goalRules) : 'Уже отложенное остаётся в подушке.'}>
          <PercentInput value={percent} onChange={setPercent} inputRef={percentInput} />
        </Field>
      )}
      <Field label="Цель, необязательно" hint="Для свинки и прогресса. Подушка может расти и дальше.">
        <AmountInput value={target} onChange={setTarget} inputRef={targetInput} />
      </Field>
      <SubmitButton missing={missing} onClick={save}>
        Сохранить
      </SubmitButton>
    </FormScreen>
  );
}

type GoalWay = Exclude<JarKind, 'cushion'>;

const WAYS: { value: GoalWay; label: string }[] = [
  { value: 'deadline', label: 'К дате' },
  { value: 'percent', label: '% с каждого поступления' },
  { value: 'schedule', label: 'Сумма по расписанию' },
  { value: 'manual', label: 'Вручную' },
];

/** The schedule being edited: an amount every week on a weekday, or every month on a day. */
function useGoalSchedule(existing: GoalSchedule | null, today: LocalDate) {
  const [amount, setAmount] = useState(amountText(existing?.amountKopecks ?? 0));
  const [every, setEvery] = useState<'week' | 'month'>(existing?.dayOfMonth != null ? 'month' : 'week');
  const [weekday, setWeekday] = useState(existing?.weekday ?? weekdayIndex(today) + 1);
  const [day, setDay] = useState(existing?.dayOfMonth ?? Number(today.slice(8)));
  const amountKopecks = parseAmount(amount) ?? 0;
  const schedule: GoalSchedule = {
    amountKopecks,
    dayOfMonth: every === 'month' ? day : null,
    weekday: every === 'week' ? weekday : null,
  };
  return { amount, setAmount, every, setEvery, weekday, setWeekday, day, setDay, schedule };
}

function sameSchedule(a: GoalSchedule | null, b: GoalSchedule | null): boolean {
  return a === b || (a !== null && b !== null && a.amountKopecks === b.amountKopecks && a.dayOfMonth === b.dayOfMonth && a.weekday === b.weekday);
}

/**
 * A goal (update 2): name, target, the way it saves and, when new, what is already saved. A change of the
 * way, the date, the percent, the schedule or the target counts the goal afresh from today, so what it
 * saved by yesterday stays. «Купил» spends from the jar without touching the limit; «Отменить» frees it.
 */
export function GoalForm({ data, budget, today, update, onBack, id }: JarFormProps & { id: string | null }) {
  const existing = data.goals.find((g) => g.id === id);
  const [newGoalId] = useState(newId);
  const [name, setName] = useState(existing?.name ?? '');
  const [target, setTarget] = useState(amountText(existing?.targetKopecks ?? 0));
  const [initial, setInitial] = useState(amountText(existing?.initialSavedKopecks ?? 0));
  const [way, setWay] = useState<GoalWay>(existing ? goalKind(existing) : 'deadline');
  const [deadline, setDeadline] = useState(existing?.deadline ?? '');
  const [percent, setPercent] = useState(existing?.percent != null ? String(existing.percent) : '');
  const when = useGoalSchedule(existing?.schedule ?? null, today);
  const targetKopecks = parseAmount(target) ?? 0;
  const initialKopecks = parseAmount(initial === '' ? '0' : initial);
  const percentValue = Number(percent); // 0 while empty
  const savedNow = existing ? goalSavedBy(data, existing, today) : 0;
  const isFull = existing !== undefined && savedNow >= existing.targetKopecks;
  // Every percent rule but this goal's: together they must leave something to live on.
  const others = percentRules(data).filter((r) => existing === undefined || r.goalId !== existing.id);
  const percentTooBig = percentValue > maxPercent(others);
  const nameInput = useRef<HTMLInputElement>(null);
  const targetInput = useRef<HTMLInputElement>(null);
  const initialInput = useRef<HTMLInputElement>(null);
  const deadlineInput = useRef<HTMLInputElement>(null);
  const percentInput = useRef<HTMLInputElement>(null);
  const scheduleInput = useRef<HTMLInputElement>(null);
  const missing = firstMissing([
    [name.trim() === '', { text: 'Напиши, на что копим', field: nameInput }],
    [targetKopecks === 0, { text: 'Напиши, сколько нужно', field: targetInput }],
    [initialKopecks === null || initialKopecks > targetKopecks, { text: 'Отложено не может быть больше цели', field: initialInput }],
    [way === 'deadline' && !(deadline > today), { text: 'Выбери дату позже сегодняшней', field: deadlineInput }],
    [way === 'percent' && percentValue === 0, { text: 'Напиши процент от 1 до 99', field: percentInput }],
    [way === 'percent' && percentTooBig, { text: percentLimitText(others), field: percentInput }],
    [way === 'schedule' && when.schedule.amountKopecks === 0, { text: 'Напиши, сколько откладывать', field: scheduleInput }],
  ]);
  const ready = missing === null;

  const fields = {
    name: name.trim(),
    targetKopecks,
    deadline: way === 'deadline' ? deadline : null,
    percent: way === 'percent' ? percentValue : null,
    schedule: way === 'schedule' ? when.schedule : null,
  };
  // A new goal starts today; so does a changed way, date, percent, schedule or target, keeping what is saved by yesterday.
  const rescheduled =
    existing !== undefined &&
    (existing.deadline !== fields.deadline ||
      existing.percent !== fields.percent ||
      !sameSchedule(existing.schedule, fields.schedule) ||
      existing.targetKopecks !== fields.targetKopecks);
  const draft: Goal =
    existing === undefined
      ? { id: newGoalId, ...fields, initialSavedKopecks: initialKopecks ?? 0, startDate: today, status: 'active' }
      : rescheduled
        ? { ...rebasedGoal(data, existing, today), ...fields }
        : { ...existing, ...fields };
  const withDraft = ready ? saveGoal(data, draft) : data;

  const income = referenceIncome(data, today);
  let hint: string | undefined;
  if (way === 'deadline' && ready) {
    hint = `В день будет уходить ${moneyInText(deadlineDailyKopecks(withDraft, draft, today))}, в этом периоде ${moneyInText(
      goalSavedBy(withDraft, draft, budget.period.end) - goalSavedBy(withDraft, draft, addDays(budget.period.start, -1)),
    )}.`;
  } else if (way === 'percent') {
    // «Со стипендии 220,00 BYN отложится 33,00 BYN»: the share of the main (or next) income, up to what the goal still needs.
    const share = income && percentValue > 0 && !percentTooBig && targetKopecks > 0 ? (incomeSplit(saveGoal(data, draft), income.amountKopecks).goals.find((g) => g.goalId === draft.id)?.kopecks ?? 0) : null;
    const from = income && fromIncomeText(income);
    hint = percentTooBig ? percentLimitText(others) : share !== null && from ? `${from.charAt(0).toUpperCase()}${from.slice(1)} отложится ${moneyInText(share)}.` : undefined;
  } else if (way === 'schedule' && ready) {
    const date = fillForecast(withDraft, { goalId: draft.id }, today);
    hint = date ? `Наполнится ~${shortDate(date, today)}.` : undefined;
  }

  return (
    <FormScreen title={existing ? existing.name : 'Новая банка'} onBack={onBack}>
      {existing && (
        <div className="card status-card">
          <span>
            Накоплено {formatMoney(savedNow)} из {formatMoney(existing.targetKopecks)}
          </span>
          {isFull && <span className="jar-form-full">Банка полна. Чтобы копить дальше, подними цель.</span>}
        </div>
      )}
      <Field label="На что копим">
        <input ref={nameInput} className="input" placeholder="Например, наушники" value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Сколько нужно">
        <AmountInput value={target} onChange={setTarget} inputRef={targetInput} />
      </Field>
      {!existing && (
        <Field label="Уже накоплено">
          <AmountInput value={initial} onChange={setInitial} inputRef={initialInput} />
        </Field>
      )}
      <Field label="Как копим" group>
        <ChoiceRows label="Как копим" options={WAYS} value={way} onChange={setWay} />
      </Field>
      {existing && rescheduled && <p className="form-note">Уже накопленное останется в цели.</p>}
      {way === 'deadline' && (
        <Field label="К какой дате" hint={hint}>
          <input ref={deadlineInput} className="input" type="date" min={addDays(today, 1)} value={deadline} onChange={(e) => setDeadline(e.target.value)} />
        </Field>
      )}
      {way === 'percent' && (
        <Field label="Сколько откладывать с каждого поступления" hint={hint}>
          <PercentInput value={percent} onChange={setPercent} inputRef={percentInput} />
        </Field>
      )}
      {way === 'schedule' && (
        <>
          <Field label="Сколько откладывать" hint={hint}>
            <AmountInput value={when.amount} onChange={when.setAmount} inputRef={scheduleInput} />
          </Field>
          <Field label="Как часто" group>
            <Segmented
              options={[
                { value: 'week', label: 'Каждую неделю' },
                { value: 'month', label: 'Каждый месяц' },
              ]}
              value={when.every}
              onChange={when.setEvery}
            />
          </Field>
          {when.every === 'week' ? (
            <Field label="День недели" group>
              <Segmented
                options={WEEKDAY_SHORT.map((label, i) => ({ value: String(i + 1), label }))}
                value={String(when.weekday)}
                onChange={(v) => when.setWeekday(Number(v))}
              />
            </Field>
          ) : (
            <Field label="Число месяца">
              <DaySelect value={when.day} onChange={when.setDay} />
            </Field>
          )}
        </>
      )}
      {way === 'manual' && <p className="form-note">Копится только то, что ты положишь сам, округления трат и остатки дня.</p>}
      <SubmitButton
        missing={missing}
        onClick={() => {
          update((d) => saveGoal(d, draft));
          onBack();
        }}
      >
        Сохранить
      </SubmitButton>
      {existing && existing.status === 'active' && (
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

