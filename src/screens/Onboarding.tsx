import { useState } from 'react';
import { INCOME_KIND_NAMES, type OnboardingResult } from '../appData';
import { BottomSheet } from '../components/BottomSheet';
import { Calendar } from '../components/Calendar';
import { AmountInput, Field } from '../components/Form';
import { StepProgress } from '../components/StepProgress';
import { addDays, addMonths, diffDays } from '../domain/dates';
import { formatKopecks, formatMoney, parseAmount } from '../domain/money';
import type { IncomeSource, LocalDate } from '../domain/types';
import { formatDayMonth, formatDays } from '../ui/labels';
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
  const [balance, setBalance] = useState(0);
  const [kind, setKind] = useState<IncomeSource['kind']>('scholarship');
  const [incomeDate, setIncomeDate] = useState<LocalDate | null>(null);
  const [incomeAmount, setIncomeAmount] = useState('');
  const [payments, setPayments] = useState<PaymentDraft[]>([]);
  const [addingPayment, setAddingPayment] = useState(false);

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
        onDone={(value) => {
          setBalance(value);
          setStep('income');
        }}
      />
    );
  }

  const incomeKopecks = parseAmount(incomeAmount) ?? 0;

  if (step === 'income') {
    // Up to the same day next month: an earlier occurrence of that day would cut the period short.
    const maxDate = addMonths(today, 1);
    return (
      <main className="screen onboarding">
        <StepProgress step={2} />
        <div className="step-title">
          <h1>Когда придут следующие деньги?</h1>
          <p>До этого дня и будем растягивать бюджет. Остальные поступления добавишь в настройках.</p>
        </div>
        <div className="chips chips-left">
          {INCOME_KINDS.map((k) => (
            <button key={k} type="button" className={`chip chip-large${k === kind ? ' is-selected' : ''}`} onClick={() => setKind(k)}>
              {INCOME_KIND_NAMES[k]}
            </button>
          ))}
        </div>
        <Calendar min={addDays(today, 1)} max={maxDate} value={incomeDate} onChange={setIncomeDate} />
        <label className="card amount-row">
          <span className="amount-row-label">Сумма</span>
          <AmountInput value={incomeAmount} onChange={setIncomeAmount} />
        </label>
        <div className="spacer" />
        <p className="step-caption">
          {incomeDate ? `${formatDayMonth(incomeDate)}, через ${formatDays(diffDays(today, incomeDate))}` : 'Выбери дату в календаре'}
        </p>
        <button
          type="button"
          className="button-primary button-large"
          disabled={!incomeDate || incomeKopecks === 0}
          onClick={() => setStep('payments')}
        >
          Дальше
        </button>
      </main>
    );
  }

  const income = { kind, amountKopecks: incomeKopecks, date: incomeDate! };
  const total = payments.reduce((sum, p) => sum + p.amountKopecks, 0);
  const finish = (list: PaymentDraft[]) => onComplete({ balanceKopecks: balance, income, payments: list });

  return (
    <main className="screen onboarding">
      <StepProgress step={3} />
      <div className="step-title">
        <h1>Что нужно оплатить до {formatDayMonth(income.date)}?</h1>
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
          max={addDays(income.date, -1)}
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
  const ready = name.trim() !== '' && kopecks > 0 && date !== null;

  return (
    <BottomSheet onClose={onClose} className="form-sheet">
      {(close) => (
        <>
          <h2 className="sheet-title">Новый платёж</h2>
          <Field label="Что оплатить">
            <input className="input" placeholder="Общежитие" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Сумма">
            <AmountInput value={amount} onChange={setAmount} />
          </Field>
          <Field label="Когда" hint="Платёж ежемесячный: повторится в этот же день каждого месяца.">
            <Calendar min={min} max={max} value={date} onChange={setDate} />
          </Field>
          <button
            type="button"
            className="button-primary button-large"
            disabled={!ready}
            onClick={() => {
              onAdd({ name: name.trim(), amountKopecks: kopecks, date: date! });
              close();
            }}
          >
            Добавить
          </button>
        </>
      )}
    </BottomSheet>
  );
}
