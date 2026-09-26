import { useState } from 'react';
import { addIncome, markPaymentPaid } from '../appData';
import { ExpenseSheet, type IncomePreset } from '../components/ExpenseSheet';
import { HeroAmount } from '../components/HeroAmount';
import { InstallHint } from '../components/InstallHint';
import { Ring } from '../components/Ring';
import { OperationActions, TransactionRow } from '../components/TransactionRow';
import { cushionSavedBy, splitExpenses, type BudgetResult, type Occurrence } from '../domain/budget';
import { formatKopecks, formatMoney } from '../domain/money';
import { incomesToConfirm } from '../domain/planned';
import type { AppData, IncomeSource, LocalDate, Transaction } from '../domain/types';
import type { InstallPlatform } from '../uiState';
import { formatDayHeader, formatDayMonth, untilPeriodEnd } from '../ui/labels';
import { Explain } from './Explain';
import type { SettingsRoute, Update } from './Settings';

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
  onOpenSettings: (route: SettingsRoute) => void;
}

function signed(kopecks: number): string {
  return kopecks > 0 ? `+${formatKopecks(kopecks)}` : formatKopecks(kopecks);
}

type SheetState = { open: false } | { open: true; incomePreset?: IncomePreset; editing?: Transaction };

/** 2f: the daily limit in a ring, today's expenses, balance and «+ Трата». */
export function Home(props: HomeProps) {
  const { data, budget, today, update, isBannerHidden, onHideBanner, installHint, onDismissInstallHint, onOpenSettings } = props;
  const [sheet, setSheet] = useState<SheetState>({ open: false });
  const [actionsFor, setActionsFor] = useState<Transaction | null>(null);
  const [explainOpen, setExplainOpen] = useState(false);

  const overspent = budget.status === 'ok' && budget.remainingTodayKopecks < 0;
  const deficit = budget.status === 'deficit';
  const fraction = deficit || overspent ? 1 : budget.dailyLimitKopecks === 0 ? 0 : budget.remainingTodayKopecks / budget.dailyLimitKopecks;

  const splits = new Map(splitExpenses(data, today).map((s) => [s.transactionId, s]));
  const todayExpenses = data.transactions
    .filter((t) => t.type === 'expense' && t.date === today)
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));

  const carry = budget.carryFromYesterdayKopecks;
  const banner = pickBanner(data, budget, today, isBannerHidden);

  if (explainOpen) return <Explain data={data} budget={budget} onBack={() => setExplainOpen(false)} />;

  return (
    <main className="screen home">
      <div className="home-scroll">
        <div className="home-top">
          <span>{formatDayHeader(today)}</span>
          <span>{untilPeriodEnd(data, budget)}</span>
        </div>

        {banner && (
          <Banner
            banner={banner}
            data={data}
            today={today}
            onYes={() =>
              update((d) =>
                banner.kind === 'income'
                  ? addIncome(d, banner.occurrence.amountKopecks, banner.occurrence.sourceId, banner.occurrence.date, today, new Date())
                  : markPaymentPaid(d, d.payments.find((p) => p.id === banner.occurrence.sourceId)!, banner.occurrence.date, today, new Date()),
              )
            }
            onOtherAmount={() =>
              setSheet({ open: true, incomePreset: { sourceId: banner.occurrence.sourceId, plannedDate: banner.occurrence.date } })
            }
            onNotYet={() => onHideBanner(banner.key)}
          />
        )}

        <Ring fraction={fraction} tone={deficit || overspent ? 'danger' : 'accent'} onClick={() => setExplainOpen(true)}>
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
              <HeroAmount kopecks={budget.remainingTodayKopecks} />
              <span className="ring-caption" data-testid="ring-caption">
                BYN из {formatKopecks(budget.dailyLimitKopecks)}
              </span>
            </>
          )}
        </Ring>

        {carry !== null && carry !== 0 && <div className={`carry-pill${carry < 0 ? ' is-negative' : ''}`}>{signed(carry)} с вчера</div>}

        {deficit && <DeficitHints data={data} today={today} onOpenSettings={onOpenSettings} />}

        {overspent && (
          <div className="note-card">
            <strong>Лимит на остальные дни пересчитан</strong>
            <span>С завтра можно тратить {formatMoney(budget.tomorrowLimitKopecks)} в день.</span>
          </div>
        )}

        {installHint && <InstallHint platform={installHint} onDismiss={onDismissInstallHint} />}

        {todayExpenses.length > 0 ? (
          <ul className="card expense-list" data-testid="today-expenses">
            {todayExpenses.map((t) => (
              <TransactionRow
                key={t.id}
                transaction={t}
                data={data}
                fromLimitKopecks={splits.get(t.id)?.fromLimitKopecks ?? t.amountKopecks}
                showTime
                onLongPress={() => setActionsFor(t)}
              />
            ))}
          </ul>
        ) : (
          <p className="empty-note">Сегодня трат пока нет</p>
        )}
      </div>

      <div className="home-bottom">
        <span className="home-summary">
          <span data-testid="balance">Баланс {formatMoney(budget.balanceKopecks)}</span>
          <br />
          <span data-testid="tomorrow">завтра можно {formatKopecks(budget.tomorrowLimitKopecks)}</span>
        </span>
        <button type="button" className="button-primary button-expense" onClick={() => setSheet({ open: true })}>
          + Трата
        </button>
      </div>

      {sheet.open && (
        <ExpenseSheet
          data={data}
          today={today}
          reserves={budget.reserves}
          dailyLimitKopecks={budget.dailyLimitKopecks}
          incomePreset={sheet.incomePreset}
          editing={sheet.editing}
          onSave={(next) => update(() => next)}
          onClose={() => setSheet({ open: false })}
        />
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
  const day = occurrence.date === today ? 'сегодня' : formatDayMonth(occurrence.date);
  const details = `${day} · ${formatMoney(occurrence.amountKopecks)}`;
  const title =
    banner.kind === 'income'
      ? incomeQuestion(data.incomeSources.find((s) => s.id === occurrence.sourceId)!)
      : `Платёж «${data.payments.find((p) => p.id === occurrence.sourceId)!.name}» оплачен?`;

  return (
    <div className="card banner" data-testid="banner">
      <strong>{title}</strong>
      <span className="banner-sub">{banner.kind === 'income' ? `ожидалось ${details}` : `срок ${details}`}</span>
      <div className="banner-actions">
        <button type="button" className="banner-yes" onClick={onYes}>
          Да, {formatKopecks(occurrence.amountKopecks)}
        </button>
        {banner.kind === 'income' && (
          <button type="button" className="banner-other" onClick={onOtherAmount}>
            Другая сумма
          </button>
        )}
        <button type="button" className="banner-other" onClick={onNotYet}>
          Ещё нет
        </button>
      </div>
    </div>
  );
}

interface DeficitHintsProps {
  data: AppData;
  today: LocalDate;
  onOpenSettings: (route: SettingsRoute) => void;
}

/** What the student can do when money runs short. The app never touches the cushion by itself. */
function DeficitHints({ data, today, onOpenSettings }: DeficitHintsProps) {
  const goal = data.goals.find((g) => g.status === 'active');
  const cushion = cushionSavedBy(data, today);
  return (
    <div className="card hint-list" data-testid="deficit-hints">
      {goal && (
        <button type="button" className="link-accent" onClick={() => onOpenSettings({ screen: 'goal', id: goal.id })}>
          Сдвинуть срок цели «{goal.name}» →
        </button>
      )}
      {cushion > 0 && (
        <button type="button" className="link-accent" onClick={() => onOpenSettings({ screen: 'cushion' })}>
          Взять из подушки (там {formatMoney(cushion)}) →
        </button>
      )}
      <button type="button" className="link-accent" onClick={() => onOpenSettings({ screen: 'reconcile' })}>
        Сверить баланс →
      </button>
    </div>
  );
}
