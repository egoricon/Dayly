import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import type { GuideSection, Lesson, LessonTarget } from '../intro';
import type { LessonId } from '../uiState';
import { prefersReducedMotion } from '../ui/motion';
import '../styles/intro.css';

// A hint of «Знакомство» (update 2): a small bubble with an arrow next to what it explains, shown once
// when that first happens. Nothing is dimmed and nothing waits for it: any tap elsewhere closes it and
// still does what it does, so the hint never stands between the person and an expense or a banner.

/** Let the screen settle (it slides in, the ring fills, a sheet closes) before the bubble appears. */
const SHOW_AFTER_MS = 500;
/** How often a hint looks for its target, which may not be on screen yet (a row below the fold). */
const LOOK_EVERY_MS = 250;
const GAP = 12;
/** Room kept between the bubble and the screen edge or the fixed bottom. */
const EDGE = 8;
/** Enough of the target must be on screen for a hint to point at it. */
const VISIBLE_PX = 40;

interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

function findTarget(target: LessonTarget): Element | null {
  switch (target.kind) {
    case 'ring':
      return document.querySelector('.home [data-testid="ring"]');
    case 'row':
      return document.querySelector(`[data-transaction-id="${CSS.escape(target.transactionId)}"]`);
    case 'banner':
      return document.querySelector('[data-testid="banner"]');
    case 'leftoverCard':
      return document.querySelector('[data-testid="leftover-card"]');
    case 'summaryCard':
      return document.querySelector('[data-testid="period-summary"]');
    case 'deficitHints':
      return document.querySelector('[data-testid="deficit-hints"]');
    case 'piggy':
      // The piggy of «Копилка»; the screen's title while a screen without it is shown.
      return document.querySelector('[data-testid="piggy"]') ?? document.querySelector('main.screen .screen-title');
    case 'calendar':
      return document.querySelector('[data-testid="calendar-grid"]');
  }
}

/** Where the screen ends above the fixed bottom: «+ Доход» and «+ Трата» of the home screen, or the tab bar. */
function visibleBottom(): number {
  const tops = Array.from(document.querySelectorAll('.home-actions, .tab-bar')).map((el) => el.getBoundingClientRect().top);
  return Math.min(window.innerHeight, ...tops.filter((top) => top > 0));
}

/** The target's box while enough of it is on screen, else null. */
function visibleRect(element: Element | null): Rect | null {
  const r = element?.getBoundingClientRect();
  if (!r || r.width === 0 || r.height === 0) return null;
  if (r.bottom <= 0 || r.top + Math.min(r.height, VISIBLE_PX) > visibleBottom()) return null;
  return { left: r.left, top: r.top, width: r.width, height: r.height };
}

interface LessonHintProps {
  lesson: Lesson;
  /** Closed by «Понятно», by a tap anywhere else or by Escape: it does not come again. */
  onSeen: (id: LessonId) => void;
  /** «Подробнее»: the matching page of «Как устроен Dayly»; the hint counts as seen. */
  onMore?: (section: GuideSection) => void;
}

/** Mount it with `key={lesson.id}`, so each hint waits for its screen to settle. */
export function LessonHint({ lesson, onSeen, onMore }: LessonHintProps) {
  const [ready, setReady] = useState(false);
  const [rect, setRect] = useState<Rect | null>(null);
  const [height, setHeight] = useState(0);
  const bubble = useRef<HTMLDivElement>(null);
  const seen = useRef(onSeen);
  seen.current = onSeen;
  // The lesson is made anew on every render of its screen; its target only changes with what it means.
  const target = useRef(lesson.target);
  target.current = lesson.target;
  const targetKey = JSON.stringify(lesson.target);

  useEffect(() => {
    const timer = window.setTimeout(() => setReady(true), prefersReducedMotion() ? 0 : SHOW_AFTER_MS);
    return () => window.clearTimeout(timer);
  }, []);

  // Follows the target: it may scroll, move when a card above it leaves, or come into view later.
  useEffect(() => {
    if (!ready) return;
    const update = () =>
      setRect((previous) => {
        const next = visibleRect(findTarget(target.current));
        const same = previous && next && previous.left === next.left && previous.top === next.top && previous.width === next.width && previous.height === next.height;
        return same ? previous : next;
      });
    update();
    const timer = window.setInterval(update, LOOK_EVERY_MS);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [ready, targetKey]);

  const shown = ready && rect !== null;

  // The bubble's height, so that it can keep clear of the buttons at the bottom (with «Крупный текст»).
  useLayoutEffect(() => {
    const measured = bubble.current?.offsetHeight ?? 0;
    if (measured !== height) setHeight(measured);
  });

  // A tap anywhere else closes the hint and still reaches what was tapped.
  useEffect(() => {
    if (!shown) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!bubble.current?.contains(event.target as Node)) seen.current(lesson.id);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') seen.current(lesson.id);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [shown, lesson.id]);

  if (!shown) return null;

  // The bubble takes the width of the app (narrower than a tablet screen) and sits on the other side of
  // the target from the nearer screen edge, with an arrow to the target's middle.
  const shell = document.querySelector('.app-shell')?.getBoundingClientRect();
  const left = (shell?.left ?? 0) + 16;
  const width = (shell?.width ?? window.innerWidth) - 32;
  // Next to the target, unless that would cover the buttons at the bottom or go off the top: then the
  // bubble moves onto the edge of the target instead.
  const below = rect.top + rect.height / 2 < window.innerHeight / 2;
  const top = below ? Math.min(rect.top + rect.height + GAP, visibleBottom() - height - EDGE) : Math.max(rect.top - GAP - height, EDGE);
  const style: CSSProperties = { left, width, top };
  const arrow = Math.min(Math.max(rect.left + rect.width / 2 - left, 28), width - 28);
  const more = lesson.more !== null && onMore ? lesson.more : null;

  return createPortal(
    <div ref={bubble} className={`lesson ${below ? 'is-below' : 'is-above'}`} style={style} role="status" data-testid="lesson" data-lesson={lesson.id}>
      <span className="lesson-arrow" style={{ left: arrow }} aria-hidden="true" />
      <p className="lesson-text" data-testid="lesson-text">
        {lesson.text}
      </p>
      <div className="lesson-actions">
        {more && (
          <button
            type="button"
            className="lesson-more"
            onClick={() => {
              onSeen(lesson.id);
              onMore!(more);
            }}
          >
            Подробнее
          </button>
        )}
        <button type="button" className="lesson-ok" onClick={() => onSeen(lesson.id)}>
          Понятно
        </button>
      </div>
    </div>,
    document.body,
  );
}
