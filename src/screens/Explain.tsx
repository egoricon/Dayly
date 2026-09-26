import type { ReactNode } from 'react';
import { FormScreen } from '../components/Form';
import type { BudgetResult, CheckpointBreakdown } from '../domain/budget';
import { addDays } from '../domain/dates';
import { formatKopecks, formatMoney } from '../domain/money';
import type { AppData } from '../domain/types';
import { CATEGORY_NAMES, formatDayMonth, formatDays, untilIncome } from '../ui/labels';

interface ExplainProps {
  data: AppData;
  budget: BudgetResult;
  onBack: () => void;
}

function Row({ label, sub, value, strong = false }: { label: string; sub?: string; value: string; strong?: boolean }) {
  return (
    <li className={`explain-row${strong ? ' is-strong' : ''}`}>
      <span className="list-text">
        <span>{label}</span>
        {sub && <span className="list-sub">{sub}</span>}
      </span>
      <span className="explain-value">{value}</span>
    </li>
  );
}

/** «Как считается» (after 1f): the terms of the checkpoint that sets today's limit. */
export function Explain({ data, budget, onBack }: ExplainProps) {
  const deficit = budget.status === 'deficit' && budget.shortfall !== null;
  // In a deficit the shortfall comes from the checkpoint where money runs out the most.
  const c: CheckpointBreakdown = deficit ? budget.checkpoints.find((x) => x.date === budget.shortfall!.until)! : budget.breakdown;
  const source = data.incomeSources.find((s) => s.id === c.incomeSourceId);
  const until = `${untilIncome(source)}, ${formatDayMonth(c.date)}`;
  const lastDay = addDays(c.date, -1);
  const periodEnd = budget.checkpoints[budget.checkpoints.length - 1]!;
  const carry = budget.carryFromYesterdayKopecks;

  const names = (ids: string[], from: { id: string; name: string }[]) =>
    ids.map((id) => from.find((x) => x.id === id)?.name ?? '').join(', ');

  const rows: ReactNode[] = [
    <Row
      key="start"
      label="Деньги на начало дня"
      sub={budget.spentTodayKopecks > 0 ? `баланс ${formatKopecks(budget.balanceKopecks)} и траты из лимита за сегодня ${formatKopecks(budget.spentTodayKopecks)}` : undefined}
      value={formatKopecks(c.startOfDayKopecks)}
      strong
    />,
  ];
  if (c.incomeKopecks > 0) {
    rows.push(
      <Row
        key="incomes"
        label="+ Придёт до этого дня"
        sub={c.incomes.map((i) => `${names([i.sourceId], data.incomeSources)} ${formatDayMonth(i.date)}`).join(', ')}
        value={formatKopecks(c.incomeKopecks)}
      />,
    );
  }
  if (c.paymentsKopecks > 0) {
    rows.push(
      <Row
        key="payments"
        label="− Обязательные платежи"
        sub={names(c.payments.map((p) => p.sourceId), data.payments)}
        value={formatKopecks(c.paymentsKopecks)}
      />,
    );
  }
  for (const r of c.reserveTerms) {
    if (r.kopecks === 0) continue;
    rows.push(
      <Row
        key={r.category}
        label={`− Резерв на ${r.category === 'groceries' ? 'продукты' : 'транспорт'}`}
        sub={`траты «${CATEGORY_NAMES[r.category]}» идут отсюда`}
        value={formatKopecks(r.kopecks)}
      />,
    );
  }
  for (const g of c.goalTerms) {
    const goal = data.goals.find((x) => x.id === g.goalId)!;
    rows.push(
      <Row
        key={g.goalId}
        label={`− Копим на «${goal.name}»`}
        sub={`отложено к ${formatDayMonth(lastDay)} · ${Math.floor(g.kopecks / 100)} из ${Math.floor(goal.targetKopecks / 100)}`}
        value={formatKopecks(g.kopecks)}
      />,
    );
  }
  if (c.cushionKopecks > 0) rows.push(<Row key="cushion" label="− Подушка" value={formatKopecks(c.cushionKopecks)} />);
  rows.push(<Row key="free" label={`Свободно до ${formatDayMonth(c.date)}`} value={formatKopecks(c.freeKopecks)} strong />);
  if (!deficit) rows.push(<Row key="days" label={`÷ дней ${until}`} value={String(c.days)} />);

  return (
    <FormScreen title="Как считается лимит" onBack={onBack}>
      <p className="form-note">На начало дня {formatDayMonth(budget.today)}</p>
      <ul className="card list explain-list" data-testid="explain-rows">
        {rows}
      </ul>

      {deficit ? (
        <div className="explain-result is-danger" data-testid="explain-result">
          <span>Не хватает</span>
          <strong>{formatMoney(budget.shortfall!.amountKopecks)}</strong>
        </div>
      ) : (
        <div className="explain-result" data-testid="explain-result">
          <span>В день</span>
          <strong>{formatMoney(budget.dailyLimitKopecks)}</strong>
        </div>
      )}

      {deficit && (
        <div className="note-card">
          <strong>Денег не хватит {until}</strong>
          <span>Пока недостача не закрыта, лимит 0. Можно сдвинуть срок цели, взять из подушки или сверить баланс.</span>
        </div>
      )}

      {!deficit && c !== periodEnd && (
        <div className="note-card" data-testid="explain-binding">
          <strong>
            Лимит ограничен: {untilIncome(source)} {formatDayMonth(c.date)}
          </strong>
          <span>
            До этого дня денег меньше всего. Если считать до конца периода, вышло бы {formatMoney(Math.max(0, periodEnd.limitKopecks))} в день.
          </span>
        </div>
      )}

      {carry !== null && carry !== 0 && !deficit && (
        <div className="note-card" data-testid="explain-carry">
          <strong>{carry > 0 ? `Вчера осталось ${formatKopecks(carry)}` : `Вчера перерасход ${formatKopecks(-carry)}`}</strong>
          <span>
            {carry > 0 ? 'Они распределены' : 'Он распределён'} на {formatDays(periodEnd.days)} до конца периода, поэтому лимит{' '}
            {carry > 0 ? 'вырос' : 'стал меньше'}.
          </span>
        </div>
      )}
    </FormScreen>
  );
}
