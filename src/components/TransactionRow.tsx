import { useRef } from 'react';
import { deleteTransaction, MAX_FAVORITES, newId, saveFavorite } from '../appData';
import { formatKopecks, formatMoney } from '../domain/money';
import type { AppData, Transaction } from '../domain/types';
import { categoryName } from '../domain/categories';
import { BottomSheet } from './BottomSheet';
import { afterLeave } from '../ui/motion';

/** Rows created this long ago or less slide in; older ones appear without animation. */
const NEW_ROW_MS = 2000;

const LONG_PRESS_MS = 500;

export function transactionName(t: Transaction, data: AppData): string {
  // A favourite's label (and a payment's or goal's name) is kept in the note.
  if (t.type === 'expense') return t.note ?? categoryName(data, t.category);
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
  /** Shown under the name: when the operation was entered. */
  time?: string;
  /** Opens «Изменить / Удалить»: a tap, a long press or a right click on an editable row. */
  onOpenActions: () => void;
}

/**
 * A row of an operations list. An editable one is a button: a tap (or a long press, or a right click)
 * opens «Изменить / Удалить». A balance adjustment stays inert.
 */
export function TransactionRow({ transaction: t, data, fromLimitKopecks, time, onOpenActions }: TransactionRowProps) {
  const timer = useRef<number | null>(null);
  // A long press has opened the actions already; the click that ends it must not open them again.
  const opened = useRef(false);
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

  const name = transactionName(t, data);
  const amount = signedAmount(t);
  const content = (
    <>
      <div className="expense-text">
        <span className="expense-name">
          {name}
          {note}
        </span>
        {time && <span className="expense-time">{time}</span>}
      </div>
      <span className="expense-amount">{amount}</span>
    </>
  );

  return (
    <li
      className={`expense-row${muted ? ' is-reserve' : ''}${Date.now() - Date.parse(t.createdAt) < NEW_ROW_MS ? ' is-new' : ''}`}
      data-testid="operation"
      data-transaction-id={t.id}
    >
      {editable ? (
        <button
          type="button"
          className="expense-row-main"
          aria-haspopup="dialog"
          // «Кафе · из резерва, −3,50 BYN, 09:12» in one phrase instead of the pieces.
          aria-label={`${name}${note}, ${amount} BYN${time ? `, ${time}` : ''}`}
          onClick={() => {
            if (opened.current) opened.current = false;
            else onOpenActions();
          }}
          onPointerDown={(event) => {
            opened.current = false;
            cancel();
            if (event.button !== 0) return;
            timer.current = window.setTimeout(() => {
              timer.current = null;
              opened.current = true;
              onOpenActions();
            }, LONG_PRESS_MS);
          }}
          onPointerUp={cancel}
          onPointerLeave={cancel}
          onPointerCancel={cancel}
          onContextMenu={(event) => {
            event.preventDefault();
            cancel();
            onOpenActions();
          }}
        >
          {content}
        </button>
      ) : (
        <div className="expense-row-main" onContextMenu={(event) => event.preventDefault()}>
          {content}
        </div>
      )}
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
 * «Изменить / Удалить» after a tap on a row. Only ordinary expenses are edited: payments and goal
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
          {canEdit && t.category !== null && (
            <FavoriteAction transaction={t} data={data} update={update} close={close} />
          )}
          <button
            type="button"
            className="button-action is-danger"
            onClick={() => {
              close();
              // The row collapses, then the data change removes it.
              document.querySelectorAll(`[data-transaction-id="${t.id}"]`).forEach((row) => row.classList.add('is-leaving'));
              afterLeave(() => update((d) => deleteTransaction(d, t.id)));
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

/** «В любимые»: the expense becomes a one-tap button on the home screen, named as it is in the list. */
function FavoriteAction({ transaction: t, data, update, close }: { transaction: Transaction; data: AppData; update: OperationActionsProps['update']; close: () => void }) {
  const label = transactionName(t, data);
  const favorites = data.settings.favorites;
  const already = favorites.some((f) => f.label === label && f.amountKopecks === t.amountKopecks && f.category === t.category);
  const full = favorites.length >= MAX_FAVORITES;
  return (
    <button
      type="button"
      className="button-action"
      disabled={already || full}
      onClick={() => {
        update((d) => saveFavorite(d, { id: newId(), label, amountKopecks: t.amountKopecks, category: t.category! }));
        close();
      }}
    >
      {already ? 'Уже в любимых' : full ? `Любимых уже ${MAX_FAVORITES}` : 'В любимые'}
    </button>
  );
}
