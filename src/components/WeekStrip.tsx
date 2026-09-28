import { useMemo } from 'react';
import { addDays } from '../domain/dates';
import { dayResults, limitStreak, type DayStatus } from '../domain/history';
import type { AppData, LocalDate } from '../domain/types';
import { streakText } from '../ui/homeHints';
import { formatDayMonth } from '../ui/labels';
import '../styles/home-extras.css';

/** Days before today on the strip; today is the seventh. */
const PAST_DAYS = 6;

const STATUS_TEXT: Record<DayStatus, string> = { in: 'в лимите', over: 'перерасход', none: 'нет данных' };

interface WeekStripProps {
  data: AppData;
  today: LocalDate;
  /** Opens the calendar; without it the strip is not tappable. */
  onOpen?: () => void;
}

/**
 * «Полоска недели» under the ring: the six days before today (within the limit, over it or without
 * a recorded limit), today as an outline, and «В лимите 3 дня подряд». On the first day of tracking
 * there is no past day to show yet, and the strip waits for one.
 */
export function WeekStrip({ data, today, onOpen }: WeekStripProps) {
  const { days, streak } = useMemo(
    () => ({ days: dayResults(data, addDays(today, -PAST_DAYS), addDays(today, -1)), streak: limitStreak(data, today) }),
    [data, today],
  );
  if (days.every((d) => d.status === 'none')) return null;
  const text = streakText(streak);
  const content = (
    <>
      <span className="week-dots" aria-hidden="true">
        {days.map((d) => (
          <span key={d.date} className={`week-dot is-${d.status}`} data-status={d.status} />
        ))}
        <span className="week-dot is-today" />
      </span>
      {text && <span className="week-streak">{text}</span>}
      <span className="visually-hidden">
        {days.map((d) => `${formatDayMonth(d.date)}: ${STATUS_TEXT[d.status]}`).join(', ')}
        {onOpen && '. Открыть календарь'}
      </span>
    </>
  );
  return onOpen ? (
    <button type="button" className="week-strip" data-testid="week-strip" onClick={onOpen}>
      {content}
    </button>
  ) : (
    <div className="week-strip" data-testid="week-strip">
      {content}
    </div>
  );
}
