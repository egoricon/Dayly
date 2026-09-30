import '../styles/savings.css';
import { shortMoney, wholeMoney, type SavingsRing } from '../ui/savings';

const ICON = 16;
const ICON_RADIUS = 6;
const ICON_CIRCUMFERENCE = 2 * Math.PI * ICON_RADIUS;

interface SavingsCaptionProps {
  ring: SavingsRing;
  /** What an income has just put into savings: said instead for a few seconds. */
  addedKopecks: number | null;
  onOpen: () => void;
}

/** «копилка 45 из 110» under the day ring; a tap opens the «Копилка» tab. */
export function SavingsCaption({ ring, addedKopecks, onOpen }: SavingsCaptionProps) {
  const added = addedKopecks !== null && addedKopecks > 0;
  return (
    <button
      type="button"
      className={`savings-caption${added ? ' is-added' : ''}`}
      data-testid="savings-caption"
      onClick={onOpen}
    >
      <svg width={ICON} height={ICON} viewBox={`0 0 ${ICON} ${ICON}`} aria-hidden="true">
        <circle className="savings-caption-track" cx={ICON / 2} cy={ICON / 2} r={ICON_RADIUS} />
        <circle
          className="savings-caption-arc"
          cx={ICON / 2}
          cy={ICON / 2}
          r={ICON_RADIUS}
          transform={`rotate(-90 ${ICON / 2} ${ICON / 2})`}
          strokeDasharray={ICON_CIRCUMFERENCE}
          strokeDashoffset={ICON_CIRCUMFERENCE * (1 - ring.fraction)}
          opacity={ring.fraction === 0 ? 0 : 1}
        />
      </svg>
      <span aria-live="polite">
        {added ? `+${shortMoney(addedKopecks)} BYN в копилку` : `копилка ${wholeMoney(ring.savedKopecks)} из ${wholeMoney(ring.plannedKopecks)}`}
      </span>
    </button>
  );
}
