import { useRef, useState } from 'react';
import { setTargetDailyLimit } from '../appData';
import { AmountInput, amountText, Field, firstMissing, FormScreen, SubmitButton } from '../components/Form';
import type { BudgetResult } from '../domain/budget';
import { formatKopecks, formatMoney, parseAmount } from '../domain/money';
import type { AppData } from '../domain/types';
import { targetShortfall } from '../ui/homeHints';
import type { FinanceProps } from './Finances';
import '../styles/home-extras.css';

/** «Цель по лимиту» in «Финансы»: one row that opens the form. */
export function TargetSection({ data, budget, onOpen }: { data: AppData; budget: BudgetResult; onOpen: () => void }) {
  const target = data.settings.targetDailyLimitKopecks;
  const limit = budget.dailyLimitKopecks;
  const short = targetShortfall(data, budget);
  const status =
    short === null
      ? 'задай сумму, и подскажем, как дотянуть'
      : short > 0
        ? `сейчас ${formatKopecks(limit)}, не хватает ${formatKopecks(short)}`
        : `сейчас ${formatKopecks(limit)}, цель достигнута`;
  return (
    <>
      <span className="section-label">Цель по лимиту</span>
      <ul className="card list" data-testid="finance-target">
        <li>
          <button type="button" className="list-row" onClick={onOpen}>
            <span className="list-text">
              <span className="list-name">Хочу тратить в день</span>
              <span className="list-sub">{status}</span>
            </span>
            {target !== null && <span className="list-value">{formatKopecks(target)}</span>}
          </button>
        </li>
      </ul>
    </>
  );
}

/**
 * «Хочу тратить в день»: the target daily limit (update 1). It does not change the calculation; while
 * the limit is below it, the home screen says how much is missing and opens «Как дотянуть».
 */
export function TargetForm({ data, budget, update, onBack }: Omit<FinanceProps, 'route'> & { onBack: () => void }) {
  const current = data.settings.targetDailyLimitKopecks;
  const [amount, setAmount] = useState(amountText(current ?? 0));
  const kopecks = parseAmount(amount) ?? 0;
  const input = useRef<HTMLInputElement>(null);
  const missing = firstMissing([[kopecks === 0, { text: 'Напиши, сколько хочешь тратить в день', field: input }]]);
  const limit = budget.dailyLimitKopecks;
  const hint =
    kopecks === 0
      ? `Сейчас можно ${formatMoney(limit)} в день.`
      : kopecks > limit
        ? `Сейчас можно ${formatMoney(limit)}, не хватает ${formatKopecks(kopecks - limit)}. На главной подскажем, как дотянуть.`
        : `Сейчас можно ${formatMoney(limit)}, цель уже достигнута.`;

  return (
    <FormScreen title="Цель по лимиту" onBack={onBack}>
      <p className="form-note">
        Скажи, сколько хочешь тратить в день. Если лимит меньше, на главной появится строка «не хватает» и шаги, которые его поднимут.
      </p>
      <Field label="Хочу тратить в день" hint={hint}>
        <AmountInput value={amount} onChange={setAmount} inputRef={input} />
      </Field>
      <SubmitButton
        missing={missing}
        onClick={() => {
          update((d) => setTargetDailyLimit(d, kopecks));
          onBack();
        }}
      >
        Сохранить
      </SubmitButton>
      {current !== null && (
        <button
          type="button"
          className="link-danger"
          onClick={() => {
            update((d) => setTargetDailyLimit(d, null));
            onBack();
          }}
        >
          Убрать цель
        </button>
      )}
    </FormScreen>
  );
}
