import { useRef } from 'react';
import { deleteTransaction } from '../appData';
import { formatKopecks, formatMoney } from '../domain/money';
import type { AppData, Transaction } from '../domain/types';
import { CATEGORY_NAMES, formatTime } from '../ui/labels';
import { BottomSheet } from './BottomSheet';

const LONG_PRESS_MS = 500;

export function transactionName(t: Transaction, data: AppData): string {
  if (t.type === 'expense') return t.category ? CATEGORY_NAMES[t.category] : (t.note ?? 'Трата');
  if (t.type === 'income') return data.incomeSources.find((s) => s.id === t.incomeSourceId)?.name ?? t.note ?? 'Доход';
  return t.note ?? 'Сверка баланса';
}

/** Expenses and incomes can be changed or deleted; balance adjustments only through «Сверить баланс». */
export function isEditable(t: Transaction): boolean {
  return t.type !== 'adjustment';
}

function signedAmount(t: Transaction): string {
  if (t.type === 'expense') return `−${formatKopecks(t.amountKopecks)}`;
  return t.amountKopecks > 0 ? `+${formatKopecks(t.amountKopecks)}` : formatKopecks(t.amountKopecks);
}

interface TransactionRowProps {
  transaction: Transaction;
  data: AppData;
  fromLimitKopecks: number;
  showTime?: boolean;
  onLongPress: () => void;
}

/** A row of an operations list. Long press (or right click) opens «Изменить / Удалить». */
export function TransactionRow({ transaction: t, data, fromLimitKopecks, showTime = false, onLongPress }: TransactionRowProps) {
  const timer = useRef<number | null>(null);
  const cancel = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  };
  const editable = isEditable(t);

  let note = '';
  let muted = false;
  if (t.type === 'expense') {
    if (t.paymentId !== null) note = ' · платёж';
    else if (t.goalId !== null) note = ' · покупка по цели';
    else if (fromLimitKopecks === 0) note = ' · из резерва';
    else if (fromLimitKopecks < t.amountKopecks) note = ` · ${formatKopecks(fromLimitKopecks)} из лимита`;
    muted = fromLimitKopecks === 0;
  } else {
    muted = t.type === 'adjustment';
  }

  return (
    <li
      className={`expense-row${muted ? ' is-reserve' : ''}`}
      data-testid="operation"
      onPointerDown={() => {
        if (!editable) return;
        cancel();
        timer.current = window.setTimeout(onLongPress, LONG_PRESS_MS);
      }}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onContextMenu={(event) => {
        event.preventDefault();
        cancel();
        if (editable) onLongPress();
      }}
    >
      <div className="expense-text">
        <span className="expense-name">
          {transactionName(t, data)}
          {note}
        </span>
        {showTime && <span className="expense-time">{formatTime(t.createdAt)}</span>}
      </div>
      <span className="expense-amount">{signedAmount(t)}</span>
    </li>
  );
}

interface OperationActionsProps {
  transaction: Transaction;
  data: AppData;
  update: (change: (data: AppData) => AppData) => void;
  onEdit: (t: Transaction) => void;
  onClose: () => void;
}

/**
 * «Изменить / Удалить» after a long press. Only ordinary expenses are edited: payments and goal
 * purchases are deleted and marked again; an income is deleted and entered again.
 */
export function OperationActions({ transaction: t, data, update, onEdit, onClose }: OperationActionsProps) {
  const canEdit = t.type === 'expense' && t.paymentId === null && t.goalId === null;
  const kind = t.type === 'expense' ? 'трату' : 'доход';
  return (
    <BottomSheet onClose={onClose} className="action-sheet">
      {(close) => (
        <>
          <p className="action-title">
            {transactionName(t, data)} · {t.type === 'expense' ? '−' : '+'}
            {formatMoney(t.amountKopecks)}
          </p>
          {canEdit && (
            <button
              type="button"
              className="button-action"
              onClick={() => {
                onEdit(t);
                close();
              }}
            >
              Изменить
            </button>
          )}
          <button
            type="button"
            className="button-action is-danger"
            onClick={() => {
              update((d) => deleteTransaction(d, t.id));
              close();
            }}
          >
            Удалить {kind}
          </button>
          <button type="button" className="button-action" onClick={close}>
            Отмена
          </button>
        </>
      )}
    </BottomSheet>
  );
}
