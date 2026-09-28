import { useRef, useState } from 'react';
import type { OnboardingPayment, OnboardingResult } from '../appData';
import { Calendar } from '../components/Calendar';
import { EventSheet } from '../components/EventSheet';
import { AmountInput, firstMissing, Segmented, SubmitButton } from '../components/Form';
import { StepProgress } from '../components/StepProgress';
import { addDays, addMonths } from '../domain/dates';
import { formatKopecks, formatMoney, parseAmount } from '../domain/money';
import type { IncomeSource, LocalDate } from '../domain/types';
import type { EventDraft } from '../events';
import { nextIncomeCaption, reservesPreview } from '../intro';
import { formatDayMonth, formatDays } from '../ui/labels';
import { AmountStep } from './AmountStep';
import { StartBalance } from './StartBalance';
import '../styles/intro.css';

type Step = 'welcome' | 'balance' | 'source' | 'when' | 'amount' | 'payments' | 'reserves';

/** Screens with a progress bar: money, source, day, amount, payments, products and transport. */
const TOTAL = 6;

/** The main income's kind, or «Пока нет постоянных»: the money stretches over a month from today. */
type Source = IncomeSource['kind'] | 'none';

const SOURCES: { value: IncomeSource['kind']; label: string }[] = [
  { value: 'scholarship', label: 'Стипендия' },
  { value: 'salary', label: 'Зарплата' },
  { value: 'parents', label: 'Родители' },
  { value: 'other', label: 'Другое' },
];

const WHEN_TITLES: Record<IncomeSource['kind'], string> = {
  scholarship: 'Когда придёт стипендия?',
  salary: 'Когда придёт зарплата?',
  parents: 'Когда придут деньги от родителей?',
  other: 'Когда придёт доход?',
};

/** Chips of the payments step; «Своё» opens the same form empty. */
const PAYMENT_PRESETS = ['Общежитие', 'Телефон', 'Интернет', 'Подписки', 'Спортзал'];

const REPEAT_TEXTS: Record<NonNullable<OnboardingPayment['repeat']>, string> = {
  once: 'один раз',
  monthly: 'каждый месяц',
  weekly: 'каждую неделю',
};

function byDate(a: OnboardingPayment, b: OnboardingPayment): number {
  return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
}

interface OnboardingProps {
  today: LocalDate;
  onComplete: (result: OnboardingResult) => void;
}

/**
 * The first setup, one question per screen: welcome, money on hand, where the money comes from, when
 * and how much, regular payments, products and transport. The first limit is shown by the app once
 * the data exists. Everything typed stays when going back.
 */
export function Onboarding({ today, onComplete }: OnboardingProps) {
  const [step, setStep] = useState<Step>('welcome');
  const [balanceInput, setBalanceInput] = useState('');
  const [source, setSource] = useState<Source | null>(null);
  const [weekly, setWeekly] = useState(false);
  const [incomeDate, setIncomeDate] = useState<LocalDate | null>(null);
  const [incomeInput, setIncomeInput] = useState('');
  const [payments, setPayments] = useState<OnboardingPayment[]>([]);
  const [groceries, setGroceries] = useState('');
  const [transport, setTransport] = useState('');

  const kind = source === null || source === 'none' ? null : source;
  const income: OnboardingResult['income'] =
    kind && incomeDate
      ? { kind, name: kind === 'other' ? 'Доход' : undefined, amountKopecks: parseAmount(incomeInput) ?? 0, date: incomeDate, weekly }
      : null;
  const finish = (reserves: OnboardingResult['reserves']) =>
    onComplete({ balanceKopecks: parseAmount(balanceInput) ?? 0, income, payments, reserves });

  switch (step) {
    case 'welcome':
      return (
        <main className="screen welcome">
          <div className="spacer" />
          <div className="welcome-logo" />
          <h1>Сколько можно потратить сегодня?</h1>
          <p>
            Приложение считает, сколько можно тратить каждый день, чтобы денег хватило до следующей стипендии или зарплаты.
            Настройка займёт минуту.
          </p>
          <div className="spacer" />
          <button type="button" className="button-primary button-large" onClick={() => setStep('balance')}>
            Начать
          </button>
        </main>
      );

    case 'balance':
      return (
        <StartBalance
          total={TOTAL}
          input={balanceInput}
          onInput={setBalanceInput}
          onBack={() => setStep('welcome')}
          onDone={() => setStep('source')}
        />
      );

    case 'source':
      return (
        <SourceStep
          value={source}
          onBack={() => setStep('balance')}
          onPick={(picked) => {
            setSource(picked);
            setStep(picked === 'none' ? 'payments' : 'when');
          }}
        />
      );

    case 'when':
      return (
        <WhenStep
          kind={kind!}
          today={today}
          weekly={weekly}
          onWeekly={(next) => {
            setWeekly(next);
            // A day more than a week away is not the next weekly income.
            if (next && incomeDate && incomeDate > addDays(today, 7)) setIncomeDate(null);
          }}
          date={incomeDate}
          onDate={setIncomeDate}
          onBack={() => setStep('source')}
          onNext={() => setStep('amount')}
        />
      );

    case 'amount':
      return (
        <AmountStep
          step={4}
          total={TOTAL}
          title="Сколько придёт?"
          subtitle="Сколько обычно приходит. Если придёт другая сумма, поправишь в тот день."
          input={incomeInput}
          onInput={setIncomeInput}
          ready={(parseAmount(incomeInput) ?? 0) > 0}
          onDone={() => setStep('payments')}
          onBack={() => setStep('when')}
          testId="income-amount"
        />
      );

    case 'payments':
      return (
        <PaymentsStep
          today={today}
          payments={payments}
          onChange={setPayments}
          onBack={() => setStep(source === 'none' ? 'source' : 'amount')}
          onNext={() => setStep('reserves')}
        />
      );

    case 'reserves':
      return (
        <ReservesStep
          today={today}
          income={income}
          groceries={groceries}
          transport={transport}
          onGroceries={setGroceries}
          onTransport={setTransport}
          onBack={() => setStep('payments')}
          onDone={finish}
        />
      );
  }
}

function Chevron() {
  return (
    <svg className="source-card-chevron" width="8" height="14" viewBox="0 0 8 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M1.5 1.5 6.5 7l-5 5.5" />
    </svg>
  );
}

/** «Откуда приходят деньги?»: a tap on a card answers and goes on. */
function SourceStep({ value, onPick, onBack }: { value: Source | null; onPick: (source: Source) => void; onBack: () => void }) {
  return (
    <main className="screen onboarding">
      <StepProgress step={2} total={TOTAL} onBack={onBack} />
      <div className="onboarding-body">
        <div className="step-title">
          <h1>Откуда приходят деньги?</h1>
          <p>Выбери главное поступление: до него и будем растягивать бюджет. Остальные добавишь потом.</p>
        </div>
        <div className="source-cards">
          {SOURCES.map((s) => (
            <button key={s.value} type="button" className={`source-card${value === s.value ? ' is-selected' : ''}`} onClick={() => onPick(s.value)}>
              <span className="source-card-name">{s.label}</span>
              <Chevron />
            </button>
          ))}
          <button type="button" className={`source-card is-none${value === 'none' ? ' is-selected' : ''}`} onClick={() => onPick('none')}>
            <span className="source-card-text">
              <span className="source-card-name">Пока нет постоянных</span>
              <span className="source-card-sub">растянем деньги на месяц</span>
            </span>
            <Chevron />
          </button>
        </div>
      </div>
    </main>
  );
}

interface WhenStepProps {
  kind: IncomeSource['kind'];
  today: LocalDate;
  weekly: boolean;
  onWeekly: (weekly: boolean) => void;
  date: LocalDate | null;
  onDate: (date: LocalDate) => void;
  onBack: () => void;
  onNext: () => void;
}

/** «Когда придёт стипендия?»: every month or every week, and the next day in the calendar. */
function WhenStep({ kind, today, weekly, onWeekly, date, onDate, onBack, onNext }: WhenStepProps) {
  const calendar = useRef<HTMLDivElement>(null);
  // Up to the same day next month (next week for a weekly income): an earlier occurrence of that
  // day would cut the period short.
  const max = weekly ? addDays(today, 7) : addMonths(today, 1);

  return (
    <main className="screen onboarding">
      <StepProgress step={3} total={TOTAL} onBack={onBack} />
      <div className="onboarding-body">
        <div className="step-title">
          <h1>{WHEN_TITLES[kind]}</h1>
          <p>До этого дня и будем растягивать бюджет.</p>
        </div>
        <Segmented
          options={[
            { value: 'monthly', label: 'Каждый месяц' },
            { value: 'weekly', label: 'Каждую неделю' },
          ]}
          value={weekly ? 'weekly' : 'monthly'}
          onChange={(value) => onWeekly(value === 'weekly')}
        />
        <div ref={calendar}>
          <Calendar min={addDays(today, 1)} max={max} value={date} onChange={onDate} />
        </div>
      </div>
      <div className="onboarding-actions">
        <p className="step-caption">{date ? nextIncomeCaption(today, date, weekly) : 'Выбери день в календаре'}</p>
        <SubmitButton missing={firstMissing([[date === null, { text: 'Выбери в календаре, когда придут деньги', field: calendar }]])} onClick={onNext}>
          Дальше
        </SubmitButton>
      </div>
    </main>
  );
}

interface PaymentsStepProps {
  today: LocalDate;
  payments: OnboardingPayment[];
  onChange: (payments: OnboardingPayment[]) => void;
  onBack: () => void;
  onNext: () => void;
}

/** «Что оплачиваешь регулярно?»: a chip opens the form of «+ Расход» in the calendar, preset with its name. */
function PaymentsStep({ today, payments, onChange, onBack, onNext }: PaymentsStepProps) {
  // The payment being added (index null) or changed, and the name the form starts with.
  const [sheet, setSheet] = useState<{ index: number | null; name: string } | null>(null);
  const editing = sheet?.index != null ? payments[sheet.index] : undefined;
  const save = (draft: EventDraft) => {
    const payment: OnboardingPayment = { name: draft.name, amountKopecks: draft.amountKopecks, date: draft.date, repeat: draft.repeat };
    const index = sheet?.index ?? null;
    onChange((index === null ? [...payments, payment] : payments.map((p, i) => (i === index ? payment : p))).sort(byDate));
  };
  const remove = (index: number) => onChange(payments.filter((_, i) => i !== index));

  return (
    <main className="screen onboarding">
      <StepProgress step={5} total={TOTAL} onBack={onBack} />
      <div className="onboarding-body">
        <div className="step-title">
          <h1>Что оплачиваешь регулярно?</h1>
          <p>Эти деньги отложим заранее, в дневной лимит они не попадут.</p>
        </div>
        <div className="chips chips-left payment-chips">
          {PAYMENT_PRESETS.map((name) => {
            const index = payments.findIndex((p) => p.name === name);
            return (
              <button
                key={name}
                type="button"
                className={`chip chip-large${index === -1 ? '' : ' is-selected'}`}
                onClick={() => setSheet({ index: index === -1 ? null : index, name })}
              >
                {name}
              </button>
            );
          })}
          <button type="button" className="chip chip-large" onClick={() => setSheet({ index: null, name: '' })}>
            + Своё
          </button>
        </div>
        {payments.length > 0 && (
          <ul className="card list" data-testid="onboarding-payments">
            {payments.map((p, index) => (
              <li key={`${p.name}|${p.date}|${index}`} className="list-row">
                <button type="button" className="list-text payment-open" onClick={() => setSheet({ index, name: p.name })}>
                  <span className="list-name">{p.name}</span>
                  <span className="list-sub">
                    {formatDayMonth(p.date)} · {REPEAT_TEXTS[p.repeat ?? 'monthly']}
                  </span>
                </button>
                <span className="list-value">{formatKopecks(p.amountKopecks)}</span>
                <button type="button" className="row-remove" aria-label={`Убрать ${p.name}`} onClick={() => remove(index)}>
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="onboarding-actions">
        <button type="button" className="button-primary button-large" onClick={onNext}>
          Дальше
        </button>
        {payments.length === 0 && (
          <button type="button" className="link-muted" onClick={onNext}>
            Пропустить
          </button>
        )}
      </div>
      {sheet && (
        <EventSheet
          kind="payment"
          date={null}
          minDate={today}
          maxDate={addDays(addMonths(today, 1), -1)}
          initial={editing ? { ...editing, repeat: editing.repeat ?? 'monthly' } : { name: sheet.name, repeat: 'monthly' }}
          editing={editing !== undefined}
          onSave={save}
          onDelete={sheet.index === null ? undefined : () => remove(sheet.index!)}
          onClose={() => setSheet(null)}
        />
      )}
    </main>
  );
}

interface ReservesStepProps {
  today: LocalDate;
  income: OnboardingResult['income'];
  groceries: string;
  transport: string;
  onGroceries: (value: string) => void;
  onTransport: (value: string) => void;
  onBack: () => void;
  onDone: (reserves: OnboardingResult['reserves']) => void;
}

/** «Сколько уходит на продукты и проезд?»: reserves per period of «Продукты» and «Транспорт», or skipped. */
function ReservesStep({ today, income, groceries, transport, onGroceries, onTransport, onBack, onDone }: ReservesStepProps) {
  const groceriesInput = useRef<HTMLInputElement>(null);
  const transportInput = useRef<HTMLInputElement>(null);
  const empty = groceries.trim() === '' && transport.trim() === '';
  const groceriesKopecks = groceries.trim() === '' ? 0 : parseAmount(groceries);
  const transportKopecks = transport.trim() === '' ? 0 : parseAmount(transport);
  const reserves =
    groceriesKopecks !== null && transportKopecks !== null && groceriesKopecks + transportKopecks > 0
      ? { groceriesKopecks, transportKopecks }
      : undefined;
  const preview = reserves && reservesPreview(today, { balanceKopecks: 0, income, payments: [], reserves });

  return (
    <main className="screen onboarding">
      <StepProgress step={6} total={TOTAL} onBack={onBack} />
      <div className="onboarding-body">
        <div className="step-title">
          <h1>Сколько уходит на продукты и проезд?</h1>
          <p>Примерно за {income?.weekly ? 'неделю' : 'месяц'}. Эти деньги отложим, и лимит станет честным.</p>
        </div>
        <div className="reserve-fields">
          <label className="card amount-row">
            <span className="amount-row-label">Продукты</span>
            <AmountInput value={groceries} onChange={onGroceries} inputRef={groceriesInput} />
          </label>
          <label className="card amount-row">
            <span className="amount-row-label">Транспорт</span>
            <AmountInput value={transport} onChange={onTransport} inputRef={transportInput} />
          </label>
        </div>
      </div>
      <div className="onboarding-actions">
        {preview && (
          <p className="step-caption" data-testid="reserves-preview">
            До {formatDayMonth(preview.until)} отложим {formatMoney(preview.kopecks)}
            {preview.days < preview.periodDays ? ` — это ${formatDays(preview.days)} из ${preview.periodDays}` : ''}
          </p>
        )}
        <SubmitButton
          missing={firstMissing([
            [groceriesKopecks === null, { text: 'Проверь сумму на продукты', field: groceriesInput }],
            [transportKopecks === null, { text: 'Проверь сумму на транспорт', field: transportInput }],
          ])}
          onClick={() => onDone(reserves)}
        >
          Посчитать лимит
        </SubmitButton>
        {empty && (
          <button type="button" className="link-muted" onClick={() => onDone(undefined)}>
            Пропустить
          </button>
        )}
      </div>
    </main>
  );
}
