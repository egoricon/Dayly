import { useEffect, useState, type ReactNode } from 'react';

const SIZE = 300;
const RADIUS = 136;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

interface RingProps {
  fraction: number; // 0..1 of the arc drawn from the top
  tone: 'accent' | 'warning' | 'danger'; // warning: more than 80 % of today's limit spent (home-extras.css)
  children: ReactNode;
  onClick?: () => void;
  /** Fills from empty on mount, used once per app launch. */
  fillIn?: boolean;
}

/** Day ring 300×300; the arc animates through a CSS transition on stroke-dashoffset. */
export function Ring({ fraction, tone, children, onClick, fillIn = false }: RingProps) {
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
          className={`ring-arc ring-arc-${tone}${filling ? ' is-filling' : ''}`}
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - clamped)}
          opacity={clamped === 0 && filled ? 0 : 1}
        />
      </svg>
      <div className="ring-center">{children}</div>
    </div>
  );
}
