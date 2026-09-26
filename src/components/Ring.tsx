import type { ReactNode } from 'react';

const SIZE = 300;
const RADIUS = 136;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

interface RingProps {
  fraction: number; // 0..1 of the arc drawn from the top
  tone: 'accent' | 'danger';
  children: ReactNode;
  onClick?: () => void;
}

/** Day ring 300×300; the arc animates through a CSS transition on stroke-dashoffset. */
export function Ring({ fraction, tone, children, onClick }: RingProps) {
  const clamped = Math.min(1, Math.max(0, fraction));
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
        <circle className="ring-track" cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} />
        <circle
          className={`ring-arc ring-arc-${tone}`}
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - clamped)}
          opacity={clamped === 0 ? 0 : 1}
        />
      </svg>
      <div className="ring-center">{children}</div>
    </div>
  );
}
