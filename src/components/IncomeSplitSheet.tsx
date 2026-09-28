import { useEffect, useState } from 'react';
import '../styles/savings.css';
import { goalSavedBy, type BudgetResult } from '../domain/budget';
import { formatKopecks, formatMoney } from '../domain/money';
import { incomeSplit, type IncomeSplit } from '../domain/savings';
import type { AppData, LocalDate } from '../domain/types';
import { moneyInText, percentRules, recordedIncome, savedShares, splitTitle, type SavingsRing } from '../ui/savings';
import { BottomSheet } from './BottomSheet';

/** How long «+45 BYN в копилку» stays under the ring. */
const ADDED_MS = 3000;
/** An income from the entry sheet: that sheet slides away first (250 ms), then this one comes up. */
const AFTER_ENTRY_SHEET_MS = 300;

export interface SplitState {
  title: string;
  split: IncomeSplit;
  limitBeforeKopecks: number;
  /** The savings ring as it was before the income: it waits under the sheet and fills after «Понятно». */
  heldFraction: number;
  ready: boolean; // false while the entry sheet is still leaving
}

/**
 * The split sheet after an income, the savings ring held until it closes, then «+45 BYN в копилку»
 * under the ring. The sheet opens only when a percent rule took a share.
 */
export function useIncomeSplit(data: AppData, budget: BudgetResult, ring: SavingsRing | null) {
  const [state, setState] = useState<SplitState | null>(null);
  const [addedKopecks, setAddedKopecks] = useState<number | null>(null);
  useEffect(() => {
    if (addedKopecks === null) return;
    const timer = window.setTimeout(() => setAddedKopecks(null), ADDED_MS);
    return () => window.clearTimeout(timer);
  }, [addedKopecks]);

  /** Call before the income is added to the data: a goal takes no more than it still needs. */
  const onIncome = (amountKopecks: number, sourceId: string | null, delayMs = 0) => {
    const split = incomeSplit(data, amountKopecks);
    if (savedShares(split) === 0) return;
    setState({
      title: splitTitle(data.incomeSources.find((s) => s.id === sourceId), amountKopecks),
      split,
      limitBeforeKopecks: budget.dailyLimitKopecks,
      heldFraction: ring?.fraction ?? 0,
      ready: delayMs === 0,
    });
    if (delayMs > 0) window.setTimeout(() => setState((s) => s && { ...s, ready: true }), delayMs);
  };

  return {
    state,
    addedKopecks,
    /** The outer ring's fraction to draw: held at the old value while the sheet is open. */
    ringFraction: ring === null ? null : (state?.heldFraction ?? ring.fraction),
    onIncome,
    /** The entry sheet's result: an income in it opens the split once that sheet is gone. */
    onSaved: (next: AppData) => {
      const income = recordedIncome(data, next);
      if (income) onIncome(income.amountKopecks, income.incomeSourceId, AFTER_ENTRY_SHEET_MS);
    },
    close: () => {
      if (state && ring !== null) setAddedKopecks(savedShares(state.split));
      setState(null);
    },
  };
}

interface IncomeSplitSheetProps {
  state: SplitState;
  data: AppData;
  today: LocalDate;
  /** The daily limit with the income. */
  limitKopecks: number;
  onClose: () => void;
}

function SplitRow({ name, sub, kopecks, saving = false }: { name: string; sub?: string; kopecks: number; saving?: boolean }) {
  return (
    <li className={`split-row${saving ? ' is-saving' : ''}`}>
      <span className="split-name">
        <span className={`split-dot${saving ? '' : ' is-life'}`} aria-hidden="true" />
        <span className="list-text">
          <span className="list-name">{name}</span>
          {sub && <span className="list-sub">{sub}</span>}
        </span>
      </span>
      <span className="split-value">{formatKopecks(kopecks)}</span>
    </li>
  );
}

/** «Стипендия 300,00 BYN разложилась»: the cushion's and goals' shares, the rest to live on, the new limit. */
export function IncomeSplitSheet({ state, data, today, limitKopecks, onClose }: IncomeSplitSheetProps) {
  const { split } = state;
  const rules = percentRules(data);
  const percent = (goalId: string | null) => `${rules.find((r) => r.goalId === goalId)?.percent ?? 0}%`;
  const changed = limitKopecks !== state.limitBeforeKopecks;
  return (
    <BottomSheet onClose={onClose} className="split-sheet">
      {(close) => (
        <>
          <p className="sheet-title">{state.title}</p>
          <ul className="card split-list" data-testid="split-sheet">
            {split.cushionKopecks > 0 && <SplitRow name="Подушка" sub={percent(null)} kopecks={split.cushionKopecks} saving />}
            {split.goals
              .filter((share) => share.kopecks > 0)
              .map((share) => {
                const goal = data.goals.find((g) => g.id === share.goalId)!;
                const full = goalSavedBy(data, goal, today) >= goal.targetKopecks;
                return <SplitRow key={goal.id} name={goal.name} sub={full ? 'цель собрана' : percent(goal.id)} kopecks={share.kopecks} saving />;
              })}
            <SplitRow name="На жизнь" kopecks={split.lifeKopecks} />
          </ul>
          <div className="card status-card split-limit" data-testid="split-limit">
            <span className="list-text">
              <span className="list-name">Лимит на день</span>
              <span className="list-sub">
                {changed ? `был ${moneyInText(state.limitBeforeKopecks)}` : 'не изменился: эти деньги уже были учтены'}
              </span>
            </span>
            <strong>{formatMoney(limitKopecks)}</strong>
          </div>
          <button type="button" className="button-primary button-large" onClick={close}>
            Понятно
          </button>
        </>
      )}
    </BottomSheet>
  );
}
