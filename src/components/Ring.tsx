import { useEffect, useState, type ReactNode } from 'react';
import '../styles/savings.css';

const SIZE = 300;
const RADIUS = 136;
// With the savings ring the day ring steps in, so both stay within the same 300×300 box.
const RADIUS_WITH_SAVINGS = 131;
const SAVINGS_RADIUS = 145;

interface RingProps {
  fraction: number; // 0..1 of the arc drawn from the top
  tone: 'accent' | 'danger';
  children: ReactNode;
  onClick?: () => void;
  /** Fills from empty on mount, used once per app launch. */
  fillIn?: boolean;
  /** 0..1 of the thin outer savings ring (saved of planned this period); null draws none. */
  savings?: number | null;
}

/** Day ring 300×300; the arc animates through a CSS transition on stroke-dashoffset. */
export function Ring({ fraction, tone, children, onClick, fillIn = false, savings = null }: RingProps) {
  // With fillIn the first frame draws an empty arc, then the transition fills it.
  const [filled, setFilled] = useState(!fillIn);
  const [filling, setFilling] = useState(fillIn);
  useEffect(() => {
    if (filled) return;
    const frame = requestAnimationFrame(() => requestAnimationFrame(() => setFilled(true)));
    return () => cancelAnimationFrame(frame);
  }, [filled]);
  // After the slow first fill, recounts use the normal speed.
  useEffect(() => {
    if (!filling) return;
    const timer = window.setTimeout(() => setFilling(false), 900);
    return () => window.clearTimeout(timer);
  }, [filling]);
  const clamped = filled ? Math.min(1, Math.max(0, fraction)) : 0;
  const radius = savings === null ? RADIUS : RADIUS_WITH_SAVINGS;
  const circumference = 2 * Math.PI * radius;
  const saved = filled && savings !== null ? Math.min(1, Math.max(0, savings)) : 0;
  const savingsCircumference = 2 * Math.PI * SAVINGS_RADIUS;
  return (
    <div
      className={`ring${onClick ? ' is-tappable' : ''}`}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-label={onClick ? 'Как считается лимит' : undefined}
      data-testid="ring"
      onClick={onClick}
      onKeyDown={(event) => {
        if (onClick && (event.key === 'Enter' || event.key === ' ')) onClick();
      }}
    >
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden="true">
        {savings !== null && (
          <>
            <circle className="ring-savings-track" cx={SIZE / 2} cy={SIZE / 2} r={SAVINGS_RADIUS} />
            <circle
              className={`ring-savings-arc${filling ? ' is-filling' : ''}`}
              data-testid="savings-arc"
              data-fraction={saved.toFixed(3)}
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={SAVINGS_RADIUS}
              transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
              strokeDasharray={savingsCircumference}
              strokeDashoffset={savingsCircumference * (1 - saved)}
              opacity={saved === 0 ? 0 : 1}
            />
          </>
        )}
        <circle className="ring-track" cx={SIZE / 2} cy={SIZE / 2} r={radius} />
        <circle
          className={`ring-arc ring-arc-${tone}${filling ? ' is-filling' : ''}`}
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={radius}
          transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clamped)}
          opacity={clamped === 0 && filled ? 0 : 1}
        />
      </svg>
      <div className="ring-center">{children}</div>
    </div>
  );
}
