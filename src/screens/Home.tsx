import { useEffect, useState } from 'react';
import { addFavoriteExpense, addIncome, deleteTransaction, markPaymentPaid, MAX_FAVORITES } from '../appData';
import { ExpenseSheet, type EntryMode, type IncomePreset } from '../components/ExpenseSheet';
import { HeroAmount } from '../components/HeroAmount';
import { IncomeSplitSheet, useIncomeSplit } from '../components/IncomeSplitSheet';
import { InstallHint } from '../components/InstallHint';
import { Ring } from '../components/Ring';
import { SavingsCaption } from '../components/SavingsCaption';
import { SavingsCards } from '../components/SavingsCards';
import { addDays } from '../domain/dates';
import { carrySavedKey, savingsRing } from '../ui/savings';
import { OperationActions, TransactionRow } from '../components/TransactionRow';
import { cushionSavedBy, type BudgetResult, type Occurrence } from '../domain/budget';
import { recentOperations } from '../domain/history';
import { formatKopecks, formatMoney } from '../domain/money';
import { incomesToConfirm } from '../domain/planned';
import type { AppData, Favorite, IncomeSource, LocalDate, Transaction } from '../domain/types';
import type { FeatureKey, InstallPlatform } from '../uiState';
import { formatDayHeader, formatDayMonth, formatOperationTime, untilPeriodEnd } from '../ui/labels';
import { Explain } from './Explain';
import type { FinanceRoute, Update } from './Finances';
import { afterLeave } from '../ui/motion';

// The ring fills and the number counts up once per launch, not on every return to the tab.
let introPlayed = false;

interface HomeProps {
  data: AppData;
  budget: BudgetResult;
  today: LocalDate;
  update: Update;
  isBannerHidden: (key: string) => boolean;
  onHideBanner: (key: string) => void;
  /** The platform whose instructions the home-screen hint shows, or null when it is hidden. */
  installHint: InstallPlatform | null;
  onDismissInstallHint: () => void;
  onOpenFinances: (route: FinanceRoute) => void;
  /** Opens the «Календарь» tab, on a day's sheet when `date` is given. */
  onOpenCalendar: (date: LocalDate | null) => void;
  /** Whether a feature is on in «Настройки → Функции». */
  feature: (key: FeatureKey) => boolean;
  /** Cards closed for good, like «Итоги периода» of a period. */
  isCardDismissed: (key: string) => boolean;
  onDismissCard: (key: string) => void;
}

function signed(kopecks: number): string {
  return kopecks > 0 ? `+${formatKopecks(kopecks)}` : formatKopecks(kopecks);
}

type SheetState = { open: false } | { open: true; mode?: EntryMode; incomePreset?: IncomePreset; editing?: Transaction };

/** How long «Отменить» stays after a tap on a favourite. */
const UNDO_MS = 5000;

/** The home list shows the last two operations; «Развернуть» shows the last week. */
const COLLAPSED_OPERATIONS = 2;
const RECENT_DAYS = 7;

interface Undo {
  transactionId: string;
  text: string;
}

/** 2f: the daily limit in a ring, today's expenses, balance and «+ Трата». */
export function Home(props: HomeProps) {
  const { data, budget, today, update, isBannerHidden, onHideBanner, installHint, onDismissInstallHint, onOpenFinances } = props;
  const [sheet, setSheet] = useState<SheetState>({ open: false });
  const [actionsFor, setActionsFor] = useState<Transaction | null>(null);
  const [explainOpen, setExplainOpen] = useState(false);
  const [intro] = useState(() => !introPlayed);
  introPlayed = true;
  const [undo, setUndo] = useState<Undo | null>(null);
  const [expanded, setExpanded] = useState(false);
  // «Копилка»: the thin outer ring, and how a confirmed income split up.
  const ring = props.feature('savingsRing') ? savingsRing(data, today) : null;
  const split = useIncomeSplit(data, budget, ring);
  useEffect(() => {
    if (!undo) return;
    const timer = window.setTimeout(() => setUndo(null), UNDO_MS);
    return () => window.clearTimeout(timer);
  }, [undo]);

  const addFavorite = (favorite: Favorite) => {
    const result = addFavoriteExpense(data, favorite, today, new Date());
    update(() => result.data);
    setUndo({ transactionId: result.transactionId, text: `${favorite.label} −${formatKopecks(favorite.amountKopecks)}` });
  };

  const overspent = budget.status === 'ok' && budget.remainingTodayKopecks < 0;
  const deficit = budget.status === 'deficit';
  const fraction = deficit || overspent ? 1 : budget.dailyLimitKopecks === 0 ? 0 : budget.remainingTodayKopecks / budget.dailyLimitKopecks;

  const recent = recentOperations(data, today, RECENT_DAYS);
  const shown = expanded ? recent : recent.slice(0, COLLAPSED_OPERATIONS);

  // Once yesterday's leftover is set aside it is not free any more, so «+8,00 с вчера» goes.
  const carry = isBannerHidden(carrySavedKey(addDays(today, -1))) ? null : budget.carryFromYesterdayKopecks;
  const banner = pickBanner(data, budget, today, isBannerHidden);

  if (explainOpen) return <Explain data={data} budget={budget} onBack={() => setExplainOpen(false)} />;

  return (
    <main className="screen home">
      <div className="home-scroll">
        <header className="home-top">
          <span className="brand">
            <svg className="brand-mark" width="26" height="26" viewBox="0 0 26 26" aria-hidden="true">
              <circle cx="13" cy="13" r="9.5" fill="none" strokeWidth="5" />
            </svg>
            Dayly
          </span>
          <span className="home-dates">
            <span>{formatDayHeader(today)}</span>
            <span>{untilPeriodEnd(data, budget)}</span>
          </span>
        </header>

        {banner && (
          <Banner
            key={banner.key}
            banner={banner}
            data={data}
            today={today}
            onYes={() => {
              if (banner.kind === 'income') split.onIncome(banner.occurrence.amountKopecks, banner.occurrence.sourceId);
              update((d) =>
                banner.kind === 'income'
                  ? addIncome(d, banner.occurrence.amountKopecks, banner.occurrence.sourceId, banner.occurrence.date, today, new Date())
                  : markPaymentPaid(d, d.payments.find((p) => p.id === banner.occurrence.sourceId)!, banner.occurrence.date, today, new Date()),
              );
            }}
            onOtherAmount={() =>
              setSheet({ open: true, incomePreset: { sourceId: banner.occurrence.sourceId, plannedDate: banner.occurrence.date } })
            }
            onNotYet={() => onHideBanner(banner.key)}
          />
        )}
        {/* «Итоги периода» or «Вчера осталось…»; a confirmation banner goes first. */}
        {!banner && <SavingsCards {...props} />}

        <Ring
          fraction={fraction}
          tone={deficit || overspent ? 'danger' : 'accent'}
          onClick={() => setExplainOpen(true)}
          fillIn={intro}
          savings={split.ringFraction}
        >
          {deficit && budget.shortfall ? (
            <>
              <span className="ring-label">Не хватает денег</span>
              <HeroAmount kopecks={budget.shortfall.amountKopecks} danger />
              <span className="ring-caption" data-testid="ring-caption">
                BYN до {formatDayMonth(budget.shortfall.until)}
              </span>
            </>
          ) : overspent ? (
            <>
              <span className="ring-label">Сегодня перерасход</span>
              <HeroAmount kopecks={budget.remainingTodayKopecks} danger />
              <span className="ring-caption" data-testid="ring-caption">
                BYN сверх {formatKopecks(budget.dailyLimitKopecks)}
              </span>
            </>
          ) : (
            <>
              <span className="ring-label">Сегодня можно</span>
              <HeroAmount kopecks={budget.remainingTodayKopecks} from={intro ? 0 : undefined} />
              <span className="ring-caption" data-testid="ring-caption">
                BYN из {formatKopecks(budget.dailyLimitKopecks)}
              </span>
            </>
          )}
        </Ring>

        {((carry !== null && carry !== 0) || ring) && (
          <div className="ring-pills">
            {carry !== null && carry !== 0 && <div className={`carry-pill${carry < 0 ? ' is-negative' : ''}`}>{signed(carry)} с вчера</div>}
            {ring && (
              <SavingsCaption ring={ring} addedKopecks={split.addedKopecks} onOpen={() => onOpenFinances({ screen: 'main', section: 'savings' })} />
            )}
          </div>
        )}

        {deficit && <DeficitHints data={data} today={today} onOpenFinances={onOpenFinances} />}

        {overspent && (
          <div className="note-card">
            <strong>Лимит на остальные дни пересчитан</strong>
            <span>С завтра можно тратить {formatMoney(budget.tomorrowLimitKopecks)} в день.</span>
          </div>
        )}

        {installHint && <InstallHint platform={installHint} onDismiss={onDismissInstallHint} />}

        <Favorites favorites={data.settings.favorites} onAdd={addFavorite} onOpenFinances={onOpenFinances} />

        {recent.length > 0 ? (
          <div className="card expense-list" data-testid="recent-operations">
            <ul>
              {shown.map(({ transaction: t, fromLimitKopecks }) => (
                <TransactionRow
                  key={t.id}
                  transaction={t}
                  data={data}
                  fromLimitKopecks={fromLimitKopecks}
                  time={formatOperationTime(t.date, t.createdAt, today)}
                  onLongPress={() => setActionsFor(t)}
                />
              ))}
            </ul>
            {recent.length > COLLAPSED_OPERATIONS && (
              <button type="button" className="list-toggle" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
                {expanded ? 'Свернуть' : `Развернуть · ещё ${recent.length - COLLAPSED_OPERATIONS}`}
              </button>
            )}
          </div>
        ) : (
          <p className="empty-note">{data.transactions.some((t) => t.type !== 'adjustment') ? 'За неделю операций нет' : 'Операций пока нет'}</p>
        )}
      </div>

      {undo && (
        <div className="toast" role="status" key={undo.transactionId}>
          <span>{undo.text}</span>
          <button
            type="button"
            className="toast-action"
            onClick={() => {
              update((d) => deleteTransaction(d, undo.transactionId));
              setUndo(null);
            }}
          >
            Отменить
          </button>
        </div>
      )}

      <div className="home-bottom">
        <span className="home-summary">
          <span data-testid="balance">Баланс {formatMoney(budget.balanceKopecks)}</span>
          {' · '}
          <span data-testid="tomorrow">завтра можно {formatKopecks(budget.tomorrowLimitKopecks)}</span>
        </span>
        <div className="home-actions">
          <button type="button" className="button-income" onClick={() => setSheet({ open: true, mode: 'income' })}>
            + Доход
          </button>
          <button type="button" className="button-primary button-expense" onClick={() => setSheet({ open: true })}>
            + Трата
          </button>
        </div>
      </div>

      {sheet.open && (
        <ExpenseSheet
          data={data}
          today={today}
          reserves={budget.reserves}
          dailyLimitKopecks={budget.dailyLimitKopecks}
          initialMode={sheet.mode}
          incomePreset={sheet.incomePreset}
          editing={sheet.editing}
          onSave={(next) => {
            split.onSaved(next);
            update(() => next);
          }}
          onClose={() => setSheet({ open: false })}
        />
      )}

      {split.state?.ready && (
        <IncomeSplitSheet state={split.state} data={data} today={today} limitKopecks={budget.dailyLimitKopecks} onClose={split.close} />
      )}

      {actionsFor && (
        <OperationActions
          transaction={actionsFor}
          data={data}
          update={update}
          onEdit={(t) => setSheet({ open: true, editing: t })}
          onClose={() => setActionsFor(null)}
        />
      )}
    </main>
  );
}

/** Favourite expenses: one tap adds the expense, «Отменить» takes it back. */
function Favorites({
  favorites,
  onAdd,
  onOpenFinances,
}: {
  favorites: Favorite[];
  onAdd: (favorite: Favorite) => void;
  onOpenFinances: (route: FinanceRoute) => void;
}) {
  return (
    <div className="favorites" data-testid="favorites">
      {favorites.map((f) => (
        <button key={f.id} type="button" className="favorite" onClick={() => onAdd(f)}>
          <span className="favorite-label">{f.label}</span>
          <span className="favorite-amount">{formatKopecks(f.amountKopecks)}</span>
        </button>
      ))}
      {favorites.length === 0 ? (
        <button type="button" className="favorite is-empty" onClick={() => onOpenFinances({ screen: 'favorite', id: null })}>
          + Любимая трата в одно касание
        </button>
      ) : (
        favorites.length < MAX_FAVORITES && (
          <button
            type="button"
            className="favorite is-add"
            aria-label="Добавить любимую трату"
            onClick={() => onOpenFinances({ screen: 'favorite', id: null })}
          >
            +
          </button>
        )
      )}
    </div>
  );
}

// Banners «Стипендия пришла?» and «Платёж оплачен?», one at a time: incomes first, then payments.

interface BannerInfo {
  kind: 'income' | 'payment';
  key: string;
  occurrence: Occurrence;
}

function pickBanner(data: AppData, budget: BudgetResult, today: LocalDate, isHidden: (key: string) => boolean): BannerInfo | null {
  const candidates: BannerInfo[] = [
    ...incomesToConfirm(data, today).map((o) => ({ kind: 'income' as const, key: `income|${o.sourceId}|${o.date}`, occurrence: o })),
    ...budget.unpaidPayments
      .filter((p) => p.date <= today)
      .map((o) => ({ kind: 'payment' as const, key: `payment|${o.sourceId}|${o.date}`, occurrence: o })),
  ];
  return candidates.find((c) => !isHidden(c.key)) ?? null;
}

function incomeQuestion(source: IncomeSource): string {
  switch (source.kind) {
    case 'scholarship':
    case 'salary':
      return `${source.name} пришла?`;
    case 'parents':
      return 'Деньги от родителей пришли?';
    case 'other':
      return `Поступление «${source.name}» пришло?`;
  }
}

interface BannerProps {
  banner: BannerInfo;
  data: AppData;
  today: LocalDate;
  onYes: () => void;
  onOtherAmount: () => void;
  onNotYet: () => void;
}

function Banner({ banner, data, today, onYes, onOtherAmount, onNotYet }: BannerProps) {
  const { occurrence } = banner;
  const [leaving, setLeaving] = useState(false);
  const leave = (then: () => void) => {
    setLeaving(true);
    afterLeave(then);
  };
  const day = occurrence.date === today ? 'сегодня' : formatDayMonth(occurrence.date);
  const details = `${day} · ${formatMoney(occurrence.amountKopecks)}`;
  const title =
    banner.kind === 'income'
      ? incomeQuestion(data.incomeSources.find((s) => s.id === occurrence.sourceId)!)
      : `Платёж «${data.payments.find((p) => p.id === occurrence.sourceId)!.name}» оплачен?`;

  return (
    <div className={`card banner${leaving ? ' is-leaving' : ''}`} data-testid="banner">
      <strong>{title}</strong>
      <span className="banner-sub">{banner.kind === 'income' ? `ожидалось ${details}` : `срок ${details}`}</span>
      <div className="banner-actions">
        <button type="button" className="banner-yes" onClick={() => leave(onYes)}>
          Да, {formatKopecks(occurrence.amountKopecks)}
        </button>
        {banner.kind === 'income' && (
          <button type="button" className="banner-other" onClick={onOtherAmount}>
            Другая сумма
          </button>
        )}
        <button type="button" className="banner-other" onClick={() => leave(onNotYet)}>
          Ещё нет
        </button>
      </div>
    </div>
  );
}

interface DeficitHintsProps {
  data: AppData;
  today: LocalDate;
  onOpenFinances: (route: FinanceRoute) => void;
}

/** What the student can do when money runs short. The app never touches the cushion by itself. */
function DeficitHints({ data, today, onOpenFinances }: DeficitHintsProps) {
  const goal = data.goals.find((g) => g.status === 'active' && g.deadline !== null);
  const cushion = cushionSavedBy(data, today);
  return (
    <div className="card hint-list" data-testid="deficit-hints">
      {goal && (
        <button type="button" className="link-accent" onClick={() => onOpenFinances({ screen: 'goal', id: goal.id })}>
          Сдвинуть срок цели «{goal.name}» →
        </button>
      )}
      {cushion > 0 && (
        <button type="button" className="link-accent" onClick={() => onOpenFinances({ screen: 'cushion' })}>
          Взять из подушки (там {formatMoney(cushion)}) →
        </button>
      )}
      <button type="button" className="link-accent" onClick={() => onOpenFinances({ screen: 'reconcile' })}>
        Сверить баланс →
      </button>
    </div>
  );
}
