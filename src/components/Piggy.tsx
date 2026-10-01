import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import '../styles/piggy.css';
import { prefersReducedMotion } from '../ui/motion';
import {
  becameFull,
  confettiPieces,
  dropsCoin,
  levelTop,
  PIGGY_BODY,
  PIGGY_HEIGHT,
  PIGGY_WIDTH,
  piggyLabel,
  piggyLevel,
} from '../ui/piggy';

/** The coin falls into the slot, then the level rises (piggy.css: .piggy-coin and .piggy-level). */
const COIN_DROP_MS = 320;
const LEVEL_MS = 450;
const FILL_IN_MS = 900;
const CONFETTI_MS = 1300;

const SLOT_Y = 65;
const SLOT_X = 110;
/** The coins on top of the pile, left to right; every other one a little higher. */
const PILE = Array.from({ length: 10 }, (_, index) => ({ x: 28 + index * 22, y: index % 2 === 0 ? -3 : 1 }));
const CONFETTI = confettiPieces();

interface PiggyProps {
  /** Saved of all targets, 0..1; null when there are no targets: a few coins for the look, no percent. */
  fill: number | null;
  totalKopecks: number;
  /** All targets reached: the piggy is happy, and confetti once when it turns full. */
  full?: boolean;
  /** One jar just got full: the piggy is happy, with confetti once it turns on, and the level stays. */
  cheer?: boolean;
  /** Fills from empty on mount, as the day ring does at launch; false shows the level at once. */
  fillIn?: boolean;
  onClick?: () => void;
}

/**
 * The piggy bank of «Копилка»: coins inside rise to the share saved. A coin drops into the slot when
 * money goes in; the level fills from empty on mount, like the day ring.
 */
export function Piggy({ fill, totalKopecks, full = false, cheer = false, fillIn = true, onClick }: PiggyProps) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const target = piggyLevel(fill, full);
  const happy = full || cheer;
  // With fillIn the first frame draws it empty, then the slow transition fills it (not with reduced motion).
  const [filled, setFilled] = useState(() => !fillIn || prefersReducedMotion());
  const [filling, setFilling] = useState(() => fillIn && !prefersReducedMotion());
  const [level, setLevel] = useState(target);
  const [coin, setCoin] = useState(0); // key of the falling coin, 0 while none
  const [burst, setBurst] = useState(0); // key of the confetti, 0 while none
  const before = useRef({ fill, totalKopecks, happy });

  useEffect(() => {
    if (filled) return;
    const frame = requestAnimationFrame(() => requestAnimationFrame(() => setFilled(true)));
    return () => cancelAnimationFrame(frame);
  }, [filled]);

  useEffect(() => {
    if (!filling) return;
    const timer = window.setTimeout(() => setFilling(false), FILL_IN_MS);
    return () => window.clearTimeout(timer);
  }, [filling]);

  useEffect(() => {
    const previous = before.current;
    before.current = { fill, totalKopecks, happy };
    const quiet = prefersReducedMotion();
    const drop = !quiet && dropsCoin(previous, { fill, totalKopecks });
    const confetti = !quiet && becameFull(previous.happy, happy);
    const timers: number[] = [];
    // The coin first, then the level rises; the confetti once it is at the top.
    if (drop) {
      setCoin((key) => key + 1);
      timers.push(window.setTimeout(() => setLevel(target), COIN_DROP_MS));
    } else {
      setLevel(target);
    }
    if (confetti) timers.push(window.setTimeout(() => setBurst((key) => key + 1), drop ? COIN_DROP_MS + LEVEL_MS : 0));
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [fill, totalKopecks, happy, target]);

  useEffect(() => {
    if (burst === 0) return;
    const timer = window.setTimeout(() => setBurst(0), CONFETTI_MS);
    return () => window.clearTimeout(timer);
  }, [burst]);

  const label = piggyLabel(totalKopecks, fill, full);
  const shown = filled ? level : 0;
  const className = `piggy${happy ? ' is-full' : ''}${cheer && !full ? ' is-cheer' : ''}${burst > 0 ? ' is-cheering' : ''}${onClick ? ' is-tappable' : ''}`;
  const art = (
    <>
      <svg
        className="piggy-art"
        viewBox={`0 0 ${PIGGY_WIDTH} ${PIGGY_HEIGHT}`}
        overflow="visible"
        aria-hidden="true"
        data-testid="piggy-art"
        data-level={shown.toFixed(3)}
      >
        <defs>
          <clipPath id={`${id}-body`}>
            <ellipse cx={PIGGY_BODY.cx} cy={PIGGY_BODY.cy} rx={PIGGY_BODY.rx} ry={PIGGY_BODY.ry} />
          </clipPath>
          <clipPath id={`${id}-slot`}>
            <rect x="0" y={-PIGGY_HEIGHT} width={PIGGY_WIDTH} height={PIGGY_HEIGHT + SLOT_Y} />
          </clipPath>
          <pattern id={`${id}-coins`} width="32" height="24" patternUnits="userSpaceOnUse">
            <ellipse cx="16" cy="6" rx="9" ry="3.4" />
            <ellipse cx="0" cy="18" rx="9" ry="3.4" />
            <ellipse cx="32" cy="18" rx="9" ry="3.4" />
          </pattern>
        </defs>

        {/* Legs and the ear behind the body, the tail curls out of its back. */}
        <g className="piggy-shape">
          <rect x="64" y="146" width="28" height="40" rx="11" />
          <rect x="144" y="146" width="28" height="40" rx="11" />
          <path d="M140 66 C142 50 150 36 163 31 C174 27 180 35 179 48 C178 60 180 70 186 84 Z" />
        </g>
        <path className="piggy-tail" d="M46 106 C38 108 28 102 20 102 A10 10 0 1 1 27 85" />
        <ellipse className="piggy-inside" cx={PIGGY_BODY.cx} cy={PIGGY_BODY.cy} rx={PIGGY_BODY.rx} ry={PIGGY_BODY.ry} />

        <g clipPath={`url(#${id}-body)`}>
          <g
            className={`piggy-level${filling ? ' is-filling' : ''}`}
            style={{ transform: `translateY(${levelTop(shown)}px)` }}
          >
            <rect className="piggy-coins" x="28" y="0" width="200" height="190" />
            <rect x="28" y="9" width="200" height="181" fill={`url(#${id}-coins)`} />
            {PILE.map(({ x, y }) => (
              <ellipse key={x} className="piggy-pile" cx={x} cy={y} rx="12" ry="5" />
            ))}
          </g>
        </g>

        <ellipse className="piggy-outline" cx={PIGGY_BODY.cx} cy={PIGGY_BODY.cy} rx={PIGGY_BODY.rx} ry={PIGGY_BODY.ry} />
        <path className="piggy-slot" d={`M${SLOT_X - 16} ${SLOT_Y + 1} Q${SLOT_X} ${SLOT_Y - 4} ${SLOT_X + 16} ${SLOT_Y + 1}`} />

        {happy ? (
          <g className="piggy-face" data-testid="piggy-happy">
            <path d="M165 97 Q174 86 183 97" />
            <path d="M173 127 Q183 138 195 130" />
          </g>
        ) : (
          <g className="piggy-face">
            <circle className="piggy-eye-halo" cx="174" cy="94" r="9.5" />
            <circle className="piggy-eye" cx="174" cy="94" r="6.5" />
          </g>
        )}
        <rect className="piggy-shape" x="194" y="93" width="30" height="42" rx="14" />
        <circle className="piggy-nostril" cx="209" cy="107" r="4.2" />
        <circle className="piggy-nostril" cx="209" cy="121" r="4.2" />

        {coin > 0 && (
          <g clipPath={`url(#${id}-slot)`}>
            <g key={coin} className="piggy-coin" onAnimationEnd={() => setCoin(0)}>
              <circle cx={SLOT_X} cy={SLOT_Y - 16} r="12" />
              <circle className="piggy-coin-mark" cx={SLOT_X} cy={SLOT_Y - 16} r="5.5" />
            </g>
          </g>
        )}
      </svg>
      {burst > 0 && (
        <div key={burst} className="piggy-confetti" aria-hidden="true">
          {CONFETTI.map((piece, index) => (
            <span
              key={index}
              className={`is-tone-${piece.tone} is-${piece.shape}`}
              style={
                {
                  '--dx': `${piece.dx}px`,
                  '--up': `${piece.up}px`,
                  '--fall': `${piece.fall}px`,
                  '--turn': `${piece.rotate}deg`,
                  animationDelay: `${piece.delayMs}ms`,
                } as CSSProperties
              }
            />
          ))}
        </div>
      )}
    </>
  );

  if (onClick) {
    return (
      <button type="button" className={className} aria-label={label} data-testid="piggy" onClick={onClick}>
        {art}
      </button>
    );
  }
  return (
    <div className={className} role="img" aria-label={label} data-testid="piggy">
      {art}
    </div>
  );
}
