import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { upcomingEvents } from '../domain/planned';
import type { AppData, LocalDate } from '../domain/types';
import { upcomingItems, upcomingText } from '../ui/homeHints';
import '../styles/home-extras.css';

/** How many planned events the line tries to show. */
const MAX_EVENTS = 2;

interface UpcomingProps {
  data: AppData;
  today: LocalDate;
  /** Opens the calendar on a day; without it the events are not tappable. */
  onOpenDate?: (date: LocalDate) => void;
}

/**
 * «Ближайшее»: the next planned incomes and payments in one line, «Пт: Стипендия +300 · 5 окт: Общежитие −120».
 * The second event shows only while the line fits the screen.
 */
export function Upcoming({ data, today, onOpenDate }: UpcomingProps) {
  const all = upcomingItems(upcomingEvents(data, today, MAX_EVENTS), data, today);
  const text = upcomingText(all);
  // The text that did not fit with two events; measured before paint, again after a resize.
  const [tooLong, setTooLong] = useState<string | null>(null);
  const line = useRef<HTMLParagraphElement>(null);
  const items = tooLong === text ? all.slice(0, 1) : all;
  useLayoutEffect(() => {
    const el = line.current;
    if (el && items.length > 1 && el.scrollWidth > el.clientWidth) setTooLong(text);
  });
  useEffect(() => {
    // The first measure can run on a wider fallback font, before Manrope has loaded.
    let mounted = true;
    const measureAgain = () => {
      if (mounted) setTooLong(null);
    };
    window.addEventListener('resize', measureAgain);
    document.fonts?.addEventListener('loadingdone', measureAgain);
    void document.fonts?.ready.then(measureAgain);
    return () => {
      mounted = false;
      window.removeEventListener('resize', measureAgain);
      document.fonts?.removeEventListener('loadingdone', measureAgain);
    };
  }, []);

  if (items.length === 0) return null;
  return (
    <p className="upcoming" data-testid="upcoming" ref={line}>
      <svg className="upcoming-icon" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
        <rect x="1.75" y="2.75" width="12.5" height="11.5" rx="2.5" fill="none" strokeWidth="1.5" />
        <path d="M1.75 6.5h12.5M5 1.25v3M11 1.25v3" fill="none" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      <span className="visually-hidden">Ближайшее: </span>
      {items.map((item, i) => {
        const content = (
          <>
            {item.day !== null && <span className="upcoming-day">{item.day}: </span>}
            {item.text}
          </>
        );
        return (
          <span key={`${item.date}|${i}`}>
            {i > 0 && <span aria-hidden="true"> · </span>}
            {onOpenDate ? (
              <button type="button" className="upcoming-item" data-testid="upcoming-item" onClick={() => onOpenDate(item.date)}>
                {content}
              </button>
            ) : (
              <span className="upcoming-item" data-testid="upcoming-item">
                {content}
              </span>
            )}
          </span>
        );
      })}
    </p>
  );
}
