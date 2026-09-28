import { useEffect, useLayoutEffect, useMemo, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { prefersReducedMotion } from '../ui/motion';
import '../styles/intro.css';

/** One tip: its text and the element on the home screen it points at. */
interface Tip {
  text: string;
  target: () => Element | null;
  shape: 'circle' | 'card' | 'tab';
}

/** The «Календарь» tab, or the whole tab bar while that tab is not there. */
function calendarTab(): Element | null {
  const tabs = Array.from(document.querySelectorAll('.tab-bar .tab'));
  return tabs.find((tab) => tab.textContent?.trim() === 'Календарь') ?? document.querySelector('.tab-bar');
}

/** The three tips of update 1; the calendar one only while «Календарь» is on in «Настройки → Функции». */
export function firstLaunchTips(calendar: boolean): Tip[] {
  const tips: Tip[] = [
    { text: 'Нажми на круг — покажу, как считается', target: () => document.querySelector('.home [data-testid="ring"]'), shape: 'circle' },
    {
      text: 'Долгий тап по трате — изменить или удалить',
      // A new person has no operations yet: the tip points where they will appear.
      target: () => document.querySelector('.home [data-testid="recent-operations"], .home .empty-note'),
      shape: 'card',
    },
  ];
  if (calendar) tips.push({ text: 'Во вкладке «Календарь» можно планировать доходы и расходы', target: calendarTab, shape: 'tab' });
  return tips;
}

/** Let the home screen settle (it slides in, the ring fills) before dimming it. */
const SHOW_AFTER_MS = 500;
const SPOT_PADDING = 8;
const GAP = 14;

interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

function spotOf(element: Element | null): Rect | null {
  const r = element?.getBoundingClientRect();
  if (!r || (r.width === 0 && r.height === 0)) return null;
  return { left: r.left - SPOT_PADDING, top: r.top - SPOT_PADDING, width: r.width + 2 * SPOT_PADDING, height: r.height + 2 * SPOT_PADDING };
}

interface FirstLaunchTipsProps {
  /** Whether «Календарь» is on: its tip is left out otherwise. */
  calendar: boolean;
  /** All tips seen or skipped. */
  onDone: () => void;
}

/**
 * First-launch tips over the home screen, one after another: the screen is dimmed except the thing a
 * tip points at. «Дальше» (or a tap anywhere) shows the next one, «Пропустить» closes them all.
 */
export function FirstLaunchTips({ calendar, onDone }: FirstLaunchTipsProps) {
  const tips = useMemo(() => firstLaunchTips(calendar), [calendar]);
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(false);
  const [spot, setSpot] = useState<Rect | null>(null);
  const [viewport, setViewport] = useState({ width: window.innerWidth, height: window.innerHeight });
  const tip = tips[Math.min(index, tips.length - 1)]!;
  const last = index >= tips.length - 1;

  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(true), prefersReducedMotion() ? 0 : SHOW_AFTER_MS);
    return () => window.clearTimeout(timer);
  }, []);

  useLayoutEffect(() => {
    if (!visible) return;
    // A list further down the home screen scrolls into view first.
    tip.target()?.scrollIntoView({ block: 'nearest' });
    const update = () => {
      setSpot(spotOf(tip.target()));
      setViewport({ width: window.innerWidth, height: window.innerHeight });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [visible, tip]);

  if (!visible) return null;

  const next = () => (last ? onDone() : setIndex(index + 1));
  // The bubble takes the width of the app (it is narrower than a tablet screen) and sits on the
  // other side of the spot from the nearer screen edge, with an arrow to the spot's middle.
  const shell = document.querySelector('.app-shell')?.getBoundingClientRect();
  const left = (shell?.left ?? 0) + 16;
  const width = (shell?.width ?? viewport.width) - 32;
  const below = spot !== null && spot.top + spot.height / 2 < viewport.height / 2;
  const bubbleStyle: CSSProperties =
    spot === null ? { left, width, top: '38%' } : below ? { left, width, top: spot.top + spot.height + GAP } : { left, width, bottom: viewport.height - spot.top + GAP };
  const arrow = spot === null ? null : Math.min(Math.max(spot.left + spot.width / 2 - left, 28), width - 28);

  return createPortal(
    <div className={`tips-layer${spot === null ? ' is-plain' : ''}`} onClick={next} data-testid="tips">
      {spot && <div className={`tips-spot is-${tip.shape}`} style={spot} />}
      <div
        key={index}
        className={`tips-bubble ${below ? 'is-below' : 'is-above'}`}
        role="dialog"
        aria-modal="true"
        aria-label={`Подсказка ${index + 1} из ${tips.length}`}
        style={bubbleStyle}
        onClick={(event) => event.stopPropagation()}
      >
        {arrow !== null && <span className="tips-arrow" style={{ left: arrow }} />}
        <p className="tips-text" data-testid="tip-text">
          {tip.text}
        </p>
        <div className="tips-actions">
          <span className="tips-count">
            {index + 1} из {tips.length}
          </span>
          {!last && (
            <button type="button" className="tips-skip" onClick={onDone}>
              Пропустить
            </button>
          )}
          <button type="button" className="tips-next" onClick={next} autoFocus>
            {last ? 'Понятно' : 'Дальше'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
