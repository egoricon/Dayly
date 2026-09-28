import { useEffect, useRef } from 'react';
import '../styles/savings.css';
import { formatKopecks } from '../domain/money';
import { incomeSplit } from '../domain/savings';
import type { AppData, LocalDate } from '../domain/types';
import { fromIncomeText, lifePercent, percentLine, percentRules, referenceIncome } from '../ui/savings';

interface IncomeSplitBlockProps {
  data: AppData;
  today: LocalDate;
  onOpenCushion: () => void;
  onOpenGoal: (id: string) => void;
  /** Opened from the savings ring: scrolls into view and lights up once. */
  focused: boolean;
}

/**
 * «С каждого поступления»: the percent cushion and percent goals as one line, «10% подушка ·
 * 15% наушники · 75% на жизнь», and what they take of the main income. Hidden without percent rules.
 */
export function IncomeSplitBlock({ data, today, onOpenCushion, onOpenGoal, focused }: IncomeSplitBlockProps) {
  const rules = percentRules(data);
  const block = useRef<HTMLDivElement>(null);
  const hasRules = rules.length > 0;
  useEffect(() => {
    if (focused && hasRules) block.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [focused, hasRules]);
  if (!hasRules) return null;

  const income = referenceIncome(data, today);
  const split = income && incomeSplit(data, income.amountKopecks);
  const share = (goalId: string | null) =>
    split === null ? null : goalId === null ? split.cushionKopecks : (split.goals.find((g) => g.goalId === goalId)?.kopecks ?? 0);

  return (
    <>
      <span className="section-label">С каждого поступления</span>
      <div ref={block} className={`card savings-split${focused ? ' is-focused' : ''}`} data-testid="savings-split">
        <div className="savings-split-head">
          <span className="savings-split-line">{percentLine(rules)}</span>
          <span className="savings-bar" aria-hidden="true">
            {rules.map((r) => (
              <span key={r.goalId ?? 'cushion'} style={{ width: `${r.percent}%` }} />
            ))}
          </span>
          {income && <span className="list-sub">Суммы {fromIncomeText(income)}</span>}
        </div>
        <ul className="savings-split-rows">
          {rules.map((r) => {
            const kopecks = share(r.goalId);
            return (
              <li key={r.goalId ?? 'cushion'}>
                <button type="button" className="list-row" onClick={() => (r.goalId === null ? onOpenCushion() : onOpenGoal(r.goalId))}>
                  <span className="list-text">
                    <span className="list-name">{r.name}</span>
                    <span className="list-sub">{r.percent}%</span>
                  </span>
                  {kopecks !== null && <span className="list-value">{formatKopecks(kopecks)}</span>}
                </button>
              </li>
            );
          })}
          <li>
            <div className="list-row is-static">
              <span className="list-text">
                <span className="list-name">На жизнь</span>
                <span className="list-sub">{lifePercent(rules)}%</span>
              </span>
              {split && <span className="list-value">{formatKopecks(split.lifeKopecks)}</span>}
            </div>
          </li>
        </ul>
      </div>
    </>
  );
}
