import { formatKopecks } from '../domain/money';
import { useAnimatedNumber } from '../ui/motion';

interface HeroAmountProps {
  kopecks: number;
  danger?: boolean;
  /** Counts up from this value on mount. */
  from?: number;
}

/** Big number (animated): '18' large and ',50' at about a third of its size. */
export function HeroAmount({ kopecks, danger = false, from }: HeroAmountProps) {
  // Runs to a new value after an expense instead of jumping.
  const shown = useAnimatedNumber(kopecks, { from });
  const [whole = '', fraction] = formatKopecks(shown).split(',');
  const long = whole.replace(/\D/g, '').length > 3;
  return (
    <div className={`hero-amount${danger ? ' is-danger' : ''}${long ? ' is-long' : ''}`} data-testid="hero-amount">
      <span className="hero-whole">{whole}</span>
      <span className="hero-fraction">,{fraction}</span>
    </div>
  );
}
