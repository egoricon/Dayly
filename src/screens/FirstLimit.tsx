import type { BudgetResult } from '../domain/budget';
import { formatKopecks } from '../domain/money';
import { formatDayMonth, formatDays } from '../ui/labels';
import { useAnimatedNumber } from '../ui/motion';

interface FirstLimitProps {
  budget: BudgetResult;
  onSetupReserves: () => void;
  onDone: () => void;
}

/** 2e: the first limit, with a nudge to add reserves. */
export function FirstLimit({ budget, onSetupReserves, onDone }: FirstLimitProps) {
  const b = budget.breakdown;
  // The first limit counts up from zero.
  const shown = useAnimatedNumber(budget.dailyLimitKopecks, { from: 0, durationMs: 700 });
  const [whole, fraction] = formatKopecks(shown).split(',');
  const [shortWhole, shortFraction] = formatKopecks(budget.shortfall?.amountKopecks ?? 0).split(',');

  return (
    <main className="screen first-limit">
      <div className="spacer" />
      {budget.shortfall ? (
        <>
          <p className="first-limit-title">Денег не хватает до {formatDayMonth(budget.shortfall.until)}</p>
          <div className="first-limit-amount is-danger">
            <span className="first-limit-whole">{shortWhole}</span>
            <span className="first-limit-fraction">,{shortFraction}</span>
            <span className="first-limit-currency">BYN</span>
          </div>
          <p className="first-limit-formula">
            {formatKopecks(b.startOfDayKopecks)} − {formatKopecks(b.paymentsKopecks)} платежей = {formatKopecks(b.freeKopecks)}. Лимит пока 0.
          </p>
        </>
      ) : (
        <>
          <p className="first-limit-title">Каждый день до {formatDayMonth(budget.bindingCheckpoint.date)} можно тратить</p>
          <div className="first-limit-amount" data-testid="first-limit">
            <span className="first-limit-whole">{whole}</span>
            <span className="first-limit-fraction">,{fraction}</span>
            <span className="first-limit-currency">BYN</span>
          </div>
          <p className="first-limit-formula">
            {formatKopecks(b.startOfDayKopecks)} − {formatKopecks(b.paymentsKopecks)} платежей = {formatKopecks(b.freeKopecks)} на{' '}
            {formatDays(b.days)}
          </p>
        </>
      )}
      <div className="card hint-card">
        <strong>Пока лимит завышен</strong>
        <span>В нём ещё сидят продукты и проезд. Добавь резервы на них, и лимит станет честным. Займёт полминуты.</span>
        <button type="button" className="link-accent" onClick={onSetupReserves}>
          Настроить резервы →
        </button>
      </div>
      <div className="spacer" />
      <button type="button" className="button-primary button-large" onClick={onDone}>
        На главную
      </button>
    </main>
  );
}
