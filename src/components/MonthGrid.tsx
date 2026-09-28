import { dayLabel, monthCells, type CalendarDay } from '../calendar';
import type { LocalDate } from '../domain/types';
import { WEEKDAY_SHORT } from '../ui/labels';
import '../styles/calendar.css';

interface MonthGridProps {
  month: LocalDate; // its first day
  /** The month's days from calendarMonth. */
  days: CalendarDay[];
  /** The day whose sheet is open gets a ring. */
  selected?: LocalDate | null;
  /** Without it the month is only shown, the days are not tappable. */
  onSelect?: (date: LocalDate) => void;
  /** Slides in from the side the month came from. */
  enter?: 'next' | 'previous' | null;
}

/**
 * A month from Monday, as in a phone calendar: today in the accent colour, past days tinted
 * green (within the limit) or red (over it), a green dot for a planned income, a red one for a payment.
 */
export function MonthGrid({ month, days, selected = null, onSelect, enter = null }: MonthGridProps) {
  const byDate = new Map(days.map((d) => [d.date, d]));
  return (
    <div className={`cal-month-grid${enter ? ` is-${enter}` : ''}`}>
      <div className="cal-weekdays" aria-hidden="true">
        {WEEKDAY_SHORT.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="cal-days">
        {monthCells(month).map((date, i) => {
          const day = date === null ? undefined : byDate.get(date);
          if (!day) return <span key={`pad${i}`} />;
          const classes = ['cal-day', day.isToday && 'is-today', day.result && `is-${day.result}`, day.date === selected && 'is-selected'];
          return (
            <button
              key={day.date}
              type="button"
              className={classes.filter(Boolean).join(' ')}
              data-date={day.date}
              aria-label={dayLabel(day)}
              aria-current={day.isToday ? 'date' : undefined}
              disabled={!onSelect}
              onClick={() => onSelect?.(day.date)}
            >
              <span className="cal-day-number">{Number(day.date.slice(8))}</span>
              <span className="cal-dots">
                {day.dots.map((dot) => (
                  <span key={dot.kind} className={`cal-dot is-${dot.kind}${dot.done ? ' is-done' : ''}`} />
                ))}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface LegendItem {
  key: string;
  mark: string;
  text: string;
}

/** What the colours mean, only for those this month shows: the dots, then the tints of past days. */
export function MonthLegend({ days }: { days: CalendarDay[] }) {
  const shows = (test: (day: CalendarDay) => boolean) => days.some(test);
  const item = (show: boolean, key: string, mark: string, text: string): LegendItem[] => (show ? [{ key, mark, text }] : []);
  const groups = [
    {
      key: 'events',
      items: [
        ...item(shows((d) => d.dots.some((dot) => dot.kind === 'income')), 'income', 'cal-dot is-income', 'доход'),
        ...item(shows((d) => d.dots.some((dot) => dot.kind === 'payment')), 'payment', 'cal-dot is-payment', 'расход'),
      ],
    },
    {
      key: 'days',
      items: [
        ...item(shows((d) => d.result === 'in'), 'in', 'cal-swatch is-in', 'в лимите'),
        ...item(shows((d) => d.result === 'over'), 'over', 'cal-swatch is-over', 'перерасход'),
      ],
    },
  ].filter((group) => group.items.length > 0);
  if (groups.length === 0) return null;
  return (
    <div className="cal-legend" aria-hidden="true" data-testid="calendar-legend">
      {groups.map((group) => (
        <span key={group.key} className="cal-legend-group">
          {group.items.map((it) => (
            <span key={it.key} className="cal-legend-item">
              <span className={it.mark} />
              {it.text}
            </span>
          ))}
        </span>
      ))}
    </div>
  );
}
