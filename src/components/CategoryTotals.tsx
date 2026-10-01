import { categoryName, isReserveCategory } from '../domain/categories';
import type { CategoryTotal } from '../domain/history';
import { formatKopecks, formatMoney } from '../domain/money';
import type { AppData, Category, LocalDate } from '../domain/types';
import { formatDayMonth } from '../ui/labels';

interface CategoryTotalsProps {
  data: AppData;
  totals: CategoryTotal[];
  /** The first day counted: the start of the period, or of tracking in the first one. */
  from: LocalDate;
  /** The category the history below shows, or null for all operations. */
  selected: Category | null;
  onSelect: (category: Category | null) => void;
}

/**
 * «Куда уходят деньги» on top of «История»: a bar per category with expenses this period, the biggest
 * first; a reserve category shows what came from the reserve and what from the limit. A tap on a
 * category shows only its expenses below, another tap shows everything again.
 */
export function CategoryTotals({ data, totals, from, selected, onSelect }: CategoryTotalsProps) {
  const max = Math.max(...totals.map((t) => t.totalKopecks));
  const sum = totals.reduce((total, t) => total + t.totalKopecks, 0);
  return (
    <section className="card category-totals" data-testid="category-totals" aria-label="Траты по категориям">
      <div className="category-totals-head">
        <span className="category-totals-title">За период с {formatDayMonth(from)}</span>
        <span className="category-totals-sum" data-testid="category-totals-sum">
          {formatMoney(sum)}
        </span>
      </div>
      <ul className="category-totals-list">
        {totals.map((t) => {
          const isSelected = t.category === selected;
          const withReserve = t.fromReserveKopecks > 0 || isReserveCategory(data, t.category);
          return (
            <li key={t.category}>
              <button
                type="button"
                className={`category-total${isSelected ? ' is-selected' : ''}${selected !== null && !isSelected ? ' is-dimmed' : ''}`}
                aria-pressed={isSelected}
                data-testid="category-total"
                onClick={() => onSelect(isSelected ? null : t.category)}
              >
                <span className="category-total-line">
                  <span className="category-total-name">{categoryName(data, t.category)}</span>
                  <span className="category-total-amount">{formatKopecks(t.totalKopecks)}</span>
                </span>
                <span className="category-bar" aria-hidden="true">
                  <span className="category-bar-fill" style={{ width: `${(t.totalKopecks / max) * 100}%` }}>
                    {t.fromReserveKopecks > 0 && <span className="category-bar-reserve" style={{ flexGrow: t.fromReserveKopecks }} />}
                    {t.fromLimitKopecks > 0 && <span className="category-bar-limit" style={{ flexGrow: t.fromLimitKopecks }} />}
                  </span>
                </span>
                {withReserve && (
                  <span className="category-total-split">
                    из резерва {formatKopecks(t.fromReserveKopecks)} · из лимита {formatKopecks(t.fromLimitKopecks)}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      {selected !== null && (
        <p className="category-totals-filter" role="status" data-testid="category-filter">
          Только «{categoryName(data, selected)}» · нажми ещё раз, чтобы показать всё
        </p>
      )}
    </section>
  );
}
