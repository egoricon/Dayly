import { useState } from 'react';
import { ExpenseSheet } from '../components/ExpenseSheet';
import { OperationActions, TransactionRow } from '../components/TransactionRow';
import type { BudgetResult } from '../domain/budget';
import { historyDays, type HistoryDay } from '../domain/history';
import { formatKopecks } from '../domain/money';
import type { AppData, LocalDate, Transaction } from '../domain/types';
import { formatHistoryDay } from '../ui/labels';
import type { Update } from './Finances';

interface HistoryProps {
  data: AppData;
  budget: BudgetResult;
  today: LocalDate;
  update: Update;
}

/** Right side of a day header: «23,80 из 27,00 · +3,20». */
function daySummary(day: HistoryDay): { text: string; tone: '' | ' is-positive' | ' is-negative' } {
  const spent = formatKopecks(day.spentFromLimitKopecks);
  if (day.dailyLimitKopecks === null) return { text: `из лимита ${spent}`, tone: '' };
  const base = `${spent} из ${formatKopecks(day.dailyLimitKopecks)}`;
  const carry = day.carryKopecks;
  if (carry === null || carry === 0) return { text: base, tone: '' };
  return carry > 0 ? { text: `${base} · +${formatKopecks(carry)}`, tone: ' is-positive' } : { text: `${base} · ${formatKopecks(carry)}`, tone: ' is-negative' };
}

/** 2h: operations by day, «потрачено из лимита · перенос». Long press changes or deletes an operation. */
export function History({ data, budget, today, update }: HistoryProps) {
  const [actionsFor, setActionsFor] = useState<Transaction | null>(null);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const days = historyDays(data, today, budget.dailyLimitKopecks);

  return (
    <main className="screen history with-tabs">
      <h1 className="screen-title">История</h1>
      {days.length === 0 && <p className="empty-note">Операций пока нет</p>}
      {days.map((day) => {
        const summary = daySummary(day);
        return (
          <section key={day.date} className="history-day" data-testid="history-day">
            <div className="history-head">
              <span className="history-date">{formatHistoryDay(day.date, today)}</span>
              <span className={`history-summary${summary.tone}`} data-testid="history-summary">
                {summary.text}
              </span>
            </div>
            <ul className="card history-list">
              {day.entries.map((e) => (
                <TransactionRow
                  key={e.transaction.id}
                  transaction={e.transaction}
                  data={data}
                  fromLimitKopecks={e.fromLimitKopecks}
                  onLongPress={() => setActionsFor(e.transaction)}
                />
              ))}
            </ul>
          </section>
        );
      })}

      {actionsFor && (
        <OperationActions
          transaction={actionsFor}
          data={data}
          update={update}
          onEdit={setEditing}
          onClose={() => setActionsFor(null)}
        />
      )}
      {editing && (
        <ExpenseSheet
          data={data}
          today={today}
          reserves={budget.reserves}
          dailyLimitKopecks={budget.dailyLimitKopecks}
          editing={editing}
          onSave={(next) => update(() => next)}
          onClose={() => setEditing(null)}
        />
      )}
    </main>
  );
}
