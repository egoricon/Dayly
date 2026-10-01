import { formatKopecks, formatMoney } from '../domain/money';
import { useAnimatedNumber } from '../ui/motion';

interface HeroAmountProps {
  kopecks: number;
  danger?: boolean;
  /** Counts up from this value on mount. */
  from?: number;
}

/**
 * Font size step for the whole part: '' up to three characters, then smaller for each one more. Three
 * characters get ' size-3' too, the same size, which «Крупный текст» steps down (styles.css).
 */
function heroSize(whole: string): '' | ' size-3' | ' size-4' | ' size-5' | ' size-6' | ' size-7' | ' size-8' {
  // Digits and the minus take a full width each; the thin thousands space is narrow.
  const length = whole.replace(/[^\d−-]/g, '').length;
  if (length <= 2) return '';
  if (length === 3) return ' size-3';
  if (length === 4) return ' size-4';
  if (length === 5) return ' size-5';
  if (length === 6) return ' size-6';
  if (length === 7) return ' size-7';
  return ' size-8';
}

/**
 * Big number (animated): '18' large and ',50' at about a third of its size. A screen reader hears the
 * final amount as one phrase with the currency, «18,50 BYN», not the two pieces or the running numbers.
 */
export function HeroAmount({ kopecks, danger = false, from }: HeroAmountProps) {
  // Runs to a new value after an expense instead of jumping.
  const shown = useAnimatedNumber(kopecks, { from });
  const [whole = '', fraction] = formatKopecks(shown).split(',');
  return (
    <div
      className={`hero-amount${danger ? ' is-danger' : ''}${heroSize(whole)}`}
      role="img"
      aria-label={formatMoney(kopecks)}
      data-testid="hero-amount"
    >
      <span className="hero-whole">{whole}</span>
      <span className="hero-fraction">,{fraction}</span>
    </div>
  );
}
