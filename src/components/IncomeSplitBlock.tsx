import { useState } from 'react';
import '../styles/savings.css';
import { saveGoal, setCushionPercent } from '../appData';
import { formatKopecks } from '../domain/money';
import { incomeSplit, rebasedGoal } from '../domain/savings';
import type { AppData, LocalDate } from '../domain/types';
import { fromIncomeText, lifePercent, maxPercent, percentLimitText, percentLine, percentRules, referenceIncome, type PercentRule } from '../ui/savings';

interface IncomeSplitBlockProps {
  data: AppData;
  today: LocalDate;
  update: (change: (data: AppData) => AppData) => void;
}

/** A new percent of a rule, counted from today on: what was saved by yesterday stays. */
export function withPercent(data: AppData, rule: PercentRule, percent: number, today: LocalDate): AppData {
  if (rule.goalId === null) return setCushionPercent(data, percent, today);
  const goal = data.goals.find((g) => g.id === rule.goalId);
  return goal ? saveGoal(data, { ...rebasedGoal(data, goal, today), percent }) : data;
}

/**
 * «С каждого поступления»: the percent cushion and percent goals as one line, «10% подушка ·
 * 15% наушники · 75% на жизнь», what they take of the main income, and each percent editable right
 * here (together at most 99 %). Hidden without percent rules.
 */
export function IncomeSplitBlock({ data, today, update }: IncomeSplitBlockProps) {
  const rules = percentRules(data);
  // The rule being typed in and its text; the others show what is saved.
  const [editing, setEditing] = useState<{ key: string; text: string } | null>(null);
  if (rules.length === 0) return null;

  const income = referenceIncome(data, today);
  const split = income && incomeSplit(data, income.amountKopecks);
  const share = (goalId: string | null) =>
    split === null ? null : goalId === null ? split.cushionKopecks : (split.goals.find((g) => g.goalId === goalId)?.kopecks ?? 0);
  const keyOf = (r: PercentRule) => r.goalId ?? 'cushion';
  const editedRule = editing && rules.find((r) => keyOf(r) === editing.key);
  const others = editedRule ? rules.filter((r) => r !== editedRule) : [];
  const typed = editing && /^\d{1,2}$/.test(editing.text) ? Number(editing.text) : 0;
  const problem = editedRule && editing ? (typed < 1 ? 'Напиши процент от 1 до 99' : typed > maxPercent(others) ? percentLimitText(others) : null) : null;

  const type = (rule: PercentRule, raw: string) => {
    const text = raw.replace(/\D/g, '').slice(0, 2);
    setEditing({ key: keyOf(rule), text });
    const percent = Number(text);
    const max = maxPercent(rules.filter((r) => r !== rule));
    if (/^\d{1,2}$/.test(text) && percent >= 1 && percent <= max && percent !== rule.percent) {
      update((d) => withPercent(d, rule, percent, today));
    }
  };

  return (
    <div className="card savings-split" data-testid="savings-split">
      <div className="savings-split-head">
        <span className="savings-split-line">{percentLine(rules)}</span>
        <span className="savings-bar" aria-hidden="true">
          {rules.map((r) => (
            <span key={keyOf(r)} style={{ width: `${r.percent}%` }} />
          ))}
        </span>
        {income && <span className="list-sub">Суммы {fromIncomeText(income)}</span>}
      </div>
      <ul className="savings-split-rows">
        {rules.map((r) => {
          const kopecks = share(r.goalId);
          const isEdited = editing?.key === keyOf(r);
          return (
            <li key={keyOf(r)} className="list-row split-edit-row">
              <span className="list-text">
                <span className="list-name">{r.name}</span>
                {kopecks !== null && <span className="list-sub">{formatKopecks(kopecks)}</span>}
              </span>
              <span className="split-percent">
                <input
                  className="input"
                  inputMode="numeric"
                  autoComplete="off"
                  aria-label={`Процент: ${r.name}`}
                  aria-invalid={isEdited && problem !== null}
                  value={isEdited ? editing.text : String(r.percent)}
                  onFocus={(e) => {
                    setEditing({ key: keyOf(r), text: String(r.percent) });
                    e.currentTarget.select();
                  }}
                  onChange={(e) => type(r, e.target.value)}
                  onBlur={() => setEditing(null)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.currentTarget.blur();
                  }}
                />
                <span aria-hidden="true">%</span>
              </span>
            </li>
          );
        })}
        <li className="list-row split-edit-row">
          <span className="list-text">
            <span className="list-name">На жизнь</span>
            {split && <span className="list-sub">{formatKopecks(split.lifeKopecks)}</span>}
          </span>
          <span className="split-percent">
            <span className="split-life">{lifePercent(rules)}</span>
            <span aria-hidden="true">%</span>
          </span>
        </li>
      </ul>
      {problem && (
        <p className="split-problem" role="alert" data-testid="split-problem">
          {problem}
        </p>
      )}
    </div>
  );
}
