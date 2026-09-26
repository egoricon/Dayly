import { formatKopecks } from '../domain/money';

interface HeroAmountProps {
  kopecks: number;
  danger?: boolean;
}

/** Big number: '18' large and ',50' at about a third of its size. */
export function HeroAmount({ kopecks, danger = false }: HeroAmountProps) {
  const [whole = '', fraction] = formatKopecks(kopecks).split(',');
  const long = whole.replace(/\D/g, '').length > 3;
  return (
    <div className={`hero-amount${danger ? ' is-danger' : ''}${long ? ' is-long' : ''}`} data-testid="hero-amount">
      <span className="hero-whole">{whole}</span>
      <span className="hero-fraction">,{fraction}</span>
    </div>
  );
}
