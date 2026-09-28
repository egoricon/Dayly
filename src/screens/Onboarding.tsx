import { useRef, useState } from 'react';
import { INCOME_KIND_NAMES, type OnboardingResult } from '../appData';
import { BottomSheet } from '../components/BottomSheet';
import { Calendar } from '../components/Calendar';
import { AmountInput, Field, firstMissing, Segmented, SubmitButton } from '../components/Form';
import { StepProgress } from '../components/StepProgress';
import { addDays, addMonths, diffDays, weekdayIndex } from '../domain/dates';
import { formatKopecks, formatMoney, parseAmount } from '../domain/money';
import type { IncomeSource, LocalDate } from '../domain/types';
import { formatDayMonth, formatDays, scheduleText } from '../ui/labels';
import { StartBalance } from './StartBalance';

type Step = 'welcome' | 'balance' | 'income' | 'payments';
type PaymentDraft = OnboardingResult['payments'][number];

const INCOME_KINDS: IncomeSource['kind'][] = ['scholarship', 'salary', 'parents'];

interface OnboardingProps {
  today: LocalDate;
  onComplete: (result: OnboardingResult) => void;
}

/** 2a → 2b → 2c → 2d. The first limit (2e) is shown by the app once the data exists. */
export function Onboarding({ today, onComplete }: OnboardingProps) {
  const [step, setStep] = useState<Step>('welcome');
  const [balanceInput, setBalanceInput] = useState('');
  const [balance, setBalance] = useState(0);
  const [kind, setKind] = useState<IncomeSource['kind']>('scholarship');
  const [incomeDate, setIncomeDate] = useState<LocalDate | null>(null);
  const [weekly, setWeekly] = useState(false);
  // «Настрою позже»: no planned income yet, the money stretches over a month from today.
  const [incomeLater, setIncomeLater] = useState(false);
  const [incomeAmount, setIncomeAmount] = useState('');
  const [payments, setPayments] = useState<PaymentDraft[]>([]);
  const [addingPayment, setAddingPayment] = useState(false);
  const incomeCalendar = useRef<HTMLDivElement>(null);
  const incomeAmountInput = useRef<HTMLInputElement>(null);

  if (step === 'welcome') {
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
  }

  if (step === 'balance') {
    return (
      <StartBalance
        input={balanceInput}
        onInput={setBalanceInput}
        onBack={() => setStep('welcome')}
        onDone={(value) => {
          setBalance(value);
          setStep('income');
        }}
      />
    );
  }

  const incomeKopecks = parseAmount(incomeAmount) ?? 0;

  if (step === 'income') {
    // Up to the same day next month (next week for a weekly income): an earlier occurrence of
    // that day would cut the period short.
    const maxDate = weekly ? addDays(today, 7) : addMonths(today, 1);
    const repeats = incomeDate && weekly ? `, дальше ${scheduleText({ dayOfMonth: null, weekday: weekdayIndex(incomeDate) + 1, date: null })}` : '';
    return (
      <main className="screen onboarding">
        <StepProgress step={2} onBack={() => setStep('balance')} />
        <div className="step-title">
          <h1>Когда придут следующие деньги?</h1>
          <p>
            До этого дня и будем растягивать бюджет. Если даты пока нет, жми «Настрою позже»: растянем деньги на месяц, а доход
            добавишь во вкладке «Финансы».
          </p>
        </div>
        <div className="chips chips-left">
          {INCOME_KINDS.map((k) => (
            <button key={k} type="button" className={`chip chip-large${k === kind ? ' is-selected' : ''}`} onClick={() => setKind(k)}>
              {INCOME_KIND_NAMES[k]}
            </button>
          ))}
        </div>
        <Segmented
          options={[
            { value: 'monthly', label: 'Раз в месяц' },
            { value: 'weekly', label: 'Раз в неделю' },
          ]}
          value={weekly ? 'weekly' : 'monthly'}
          onChange={(value) => {
            const nextWeekly = value === 'weekly';
            setWeekly(nextWeekly);
            // A date more than a week away is not the next weekly income.
            if (nextWeekly && incomeDate && incomeDate > addDays(today, 7)) setIncomeDate(null);
          }}
        />
        <div ref={incomeCalendar}>
          <Calendar min={addDays(today, 1)} max={maxDate} value={incomeDate} onChange={setIncomeDate} />
        </div>
        <label className="card amount-row">
          <span className="amount-row-label">Сумма</span>
          <AmountInput value={incomeAmount} onChange={setIncomeAmount} inputRef={incomeAmountInput} />
        </label>
        <div className="spacer" />
        <p className="step-caption">
          {incomeDate ? `${formatDayMonth(incomeDate)}, через ${formatDays(diffDays(today, incomeDate))}${repeats}` : 'Выбери дату в календаре'}
        </p>
        <SubmitButton
          missing={firstMissing([
            [!incomeDate, { text: 'Выбери в календаре, когда придут деньги', field: incomeCalendar }],
            [incomeKopecks === 0, { text: 'Напиши, сколько придёт', field: incomeAmountInput }],
          ])}
          onClick={() => {
            setIncomeLater(false);
            setStep('payments');
          }}
        >
          Дальше
        </SubmitButton>
        <button
          type="button"
          className="link-muted"
          onClick={() => {
            setIncomeLater(true);
            setStep('payments');
          }}
        >
          Настрою позже
        </button>
      </main>
    );
  }

  const income = incomeLater ? null : { kind, amountKopecks: incomeKopecks, date: incomeDate!, weekly };
  // Payments count up to the next income, or without one up to a month from today.
  const until = income?.date ?? addMonths(today, 1);
  const total = payments.reduce((sum, p) => sum + p.amountKopecks, 0);
  const finish = (list: PaymentDraft[]) => onComplete({ balanceKopecks: balance, income, payments: list });

  return (
    <main className="screen onboarding">
      <StepProgress step={3} onBack={() => setStep('income')} />
      <div className="step-title">
        <h1>Что нужно оплатить до {formatDayMonth(until)}?</h1>
        <p>Эти деньги сразу отложим, и в дневной лимит они не попадут.</p>
      </div>
      {payments.length > 0 && (
        <ul className="card list" data-testid="onboarding-payments">
          {payments.map((p, index) => (
            <li key={index} className="list-row">
              <div className="list-text">
                <span className="list-name">{p.name}</span>
                <span className="list-sub">{formatDayMonth(p.date)}</span>
              </div>
              <span className="list-value">{formatKopecks(p.amountKopecks)}</span>
              <button
                type="button"
                className="row-remove"
                aria-label={`Убрать ${p.name}`}
                onClick={() => setPayments(payments.filter((_, i) => i !== index))}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="button-dashed" onClick={() => setAddingPayment(true)}>
        + Добавить платёж
      </button>
      <div className="spacer" />
      <div className="total-row">
        <span>Итого отложим</span>
        <strong>{formatMoney(total)}</strong>
      </div>
      <button type="button" className="button-primary button-large" onClick={() => finish(payments)}>
        Посчитать лимит
      </button>
      <button type="button" className="link-muted" onClick={() => finish([])}>
        Пропустить
      </button>
      {addingPayment && (
        <PaymentDraftSheet
          min={today}
          max={addDays(until, -1)}
          onAdd={(p) => setPayments([...payments, p].sort((a, b) => (a.date < b.date ? -1 : 1)))}
          onClose={() => setAddingPayment(false)}
        />
      )}
    </main>
  );
}

function PaymentDraftSheet({
  min,
  max,
  onAdd,
  onClose,
}: {
  min: LocalDate;
  max: LocalDate;
  onAdd: (payment: PaymentDraft) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState<LocalDate | null>(null);
  const kopecks = parseAmount(amount) ?? 0;
  const nameInput = useRef<HTMLInputElement>(null);
  const amountInput = useRef<HTMLInputElement>(null);
  const calendar = useRef<HTMLDivElement>(null);
  const missing = firstMissing([
    [name.trim() === '', { text: 'Напиши, что оплатить', field: nameInput }],
    [kopecks === 0, { text: 'Напиши сумму платежа', field: amountInput }],
    [date === null, { text: 'Выбери в календаре день платежа', field: calendar }],
  ]);

  return (
    <BottomSheet onClose={onClose} className="form-sheet">
      {(close) => (
        <>
          {/* The fields scroll; «Добавить» stays at the bottom of the sheet on any screen height. */}
          <div className="sheet-body">
            <h2 className="sheet-title">Новый платёж</h2>
            <Field label="Что оплатить">
              <input
                ref={nameInput}
                className="input"
                placeholder="Например, общежитие"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
            <Field label="Сумма">
              <AmountInput value={amount} onChange={setAmount} inputRef={amountInput} />
            </Field>
            <Field label="Когда" group hint="Платёж ежемесячный: повторится в этот же день каждого месяца.">
              <div ref={calendar}>
                <Calendar min={min} max={max} value={date} onChange={setDate} />
              </div>
            </Field>
          </div>
          <SubmitButton
            missing={missing}
            onClick={() => {
              onAdd({ name: name.trim(), amountKopecks: kopecks, date: date! });
              close();
            }}
          >
            Добавить
          </SubmitButton>
        </>
      )}
    </BottomSheet>
  );
}
