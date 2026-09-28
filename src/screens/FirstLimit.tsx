import { MonthPreview } from '../components/MonthPreview';
import type { BudgetResult, CheckpointBreakdown } from '../domain/budget';
import { categoryName, reserveCategories } from '../domain/categories';
import { formatKopecks } from '../domain/money';
import type { AppData, LocalDate } from '../domain/types';
import { formatDayMonth, formatDays } from '../ui/labels';
import { useAnimatedNumber } from '../ui/motion';
import '../styles/intro.css';

interface FirstLimitProps {
  data: AppData;
  budget: BudgetResult;
  today: LocalDate;
  onSetupReserves: () => void;
  onDone: () => void;
}

/** '586,00 − 95,00 платежей − 180,00 на продукты и транспорт = 311,00': every term the limit is made of. */
function formula(b: CheckpointBreakdown, data: AppData): string {
  const reserves = b.reserveTerms.filter((r) => r.kopecks > 0).map((r) => categoryName(data, r.category).toLowerCase());
  const terms = [
    formatKopecks(b.startOfDayKopecks),
    b.incomeKopecks > 0 && `+ ${formatKopecks(b.incomeKopecks)} поступлений`,
    b.paymentsKopecks > 0 && `− ${formatKopecks(b.paymentsKopecks)} платежей`,
    b.reservesKopecks > 0 && `− ${formatKopecks(b.reservesKopecks)} на ${reserves.join(' и ')}`,
    b.goalsKopecks > 0 && `− ${formatKopecks(b.goalsKopecks)} на цели`,
    b.cushionKopecks > 0 && `− ${formatKopecks(b.cushionKopecks)} в подушку`,
  ].filter(Boolean);
  return terms.length === 1 ? formatKopecks(b.freeKopecks) : `${terms.join(' ')} = ${formatKopecks(b.freeKopecks)}`;
}

/** 2e: the first limit and «Вот твой месяц»; a nudge to add reserves when products and transport were skipped. */
export function FirstLimit({ data, budget, today, onSetupReserves, onDone }: FirstLimitProps) {
  const b = budget.breakdown;
  // The first limit counts up from zero.
  const shown = useAnimatedNumber(budget.dailyLimitKopecks, { from: 0, durationMs: 700 });
  const [whole, fraction] = formatKopecks(shown).split(',');
  const [shortWhole, shortFraction] = formatKopecks(budget.shortfall?.amountKopecks ?? 0).split(',');
  const noReserves = !reserveCategories(data).some((c) => (c.reserveKopecks ?? 0) > 0);

  return (
    <main className="screen first-limit">
      <div className="first-limit-body">
        <div className="spacer" />
        {budget.shortfall ? (
          <>
            <p className="first-limit-title">Денег не хватает до {formatDayMonth(budget.shortfall.until)}</p>
            <div className="first-limit-amount is-danger">
              <span className="first-limit-whole">{shortWhole}</span>
              <span className="first-limit-fraction">,{shortFraction}</span>
              <span className="first-limit-currency">BYN</span>
            </div>
            <p className="first-limit-formula">{formula(b, data)}. Лимит пока 0.</p>
          </>
        ) : (
          <>
            <p className="first-limit-title">Каждый день до {formatDayMonth(budget.bindingCheckpoint.date)} можно тратить</p>
            <div className="first-limit-amount" data-testid="first-limit">
              <span className="first-limit-whole">{whole}</span>
              <span className="first-limit-fraction">,{fraction}</span>
              <span className="first-limit-currency">BYN</span>
            </div>
            <p className="first-limit-formula" data-testid="first-limit-formula">
              {formula(b, data)} на {formatDays(b.days)}
            </p>
          </>
        )}
        <MonthPreview data={data} today={today} periodEnd={budget.period.end} />
        {noReserves && (
          <div className="card hint-card">
            <strong>Пока лимит завышен</strong>
            <span>В нём ещё сидят продукты и проезд.</span>
            <button type="button" className="link-accent" onClick={onSetupReserves}>
              Настроить резервы →
            </button>
          </div>
        )}
        <div className="spacer" />
      </div>
      <button type="button" className="button-primary button-large" onClick={onDone}>
        На главную
      </button>
    </main>
  );
}
