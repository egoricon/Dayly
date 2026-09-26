import { useState } from 'react';
import { addMonths, daysInMonth, makeDate, weekdayIndex } from '../domain/dates';
import type { LocalDate } from '../domain/types';
import { monthName } from '../ui/labels';

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

interface CalendarProps {
  min: LocalDate;
  max: LocalDate;
  value: LocalDate | null;
  onChange: (date: LocalDate) => void;
}

/** Month grid for picking a day within [min, max]. */
export function Calendar({ min, max, value, onChange }: CalendarProps) {
  const [month, setMonth] = useState(() => (value ?? min).slice(0, 7) + '-01');
  const [y, m] = month.split('-').map(Number) as [number, number];
  const first = makeDate(y, m, 1);
  const days = Array.from({ length: daysInMonth(y, m) }, (_, i) => makeDate(y, m, i + 1));
  const canBack = month > min.slice(0, 7) + '-01';
  const canForward = month < max.slice(0, 7) + '-01';

  return (
    <div className="card calendar">
      <div className="calendar-head">
        <span>
          {monthName(m)} {y}
        </span>
        <span className="calendar-arrows">
          <button type="button" aria-label="Предыдущий месяц" disabled={!canBack} onClick={() => setMonth(addMonths(month, -1))}>
            ‹
          </button>
          <button type="button" aria-label="Следующий месяц" disabled={!canForward} onClick={() => setMonth(addMonths(month, 1))}>
            ›
          </button>
        </span>
      </div>
      <div className="calendar-grid calendar-weekdays">
        {WEEKDAYS.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="calendar-grid">
        {Array.from({ length: weekdayIndex(first) }, (_, i) => (
          <span key={`pad${i}`} />
        ))}
        {days.map((date) => (
          <button
            key={date}
            type="button"
            className={`calendar-day${date === value ? ' is-selected' : ''}`}
            disabled={date < min || date > max}
            onClick={() => onChange(date)}
          >
            {Number(date.slice(8))}
          </button>
        ))}
      </div>
    </div>
  );
}
