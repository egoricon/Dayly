import { addDays, addMonths, maxDate, weekdayIndex } from '../domain/dates';
import { plannedEvents } from '../domain/planned';
import type { AppData, LocalDate } from '../domain/types';
import { formatDayMonth, WEEKDAY_SHORT } from '../ui/labels';
import '../styles/intro.css';

const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

interface MonthPreviewProps {
  data: AppData;
  today: LocalDate;
  /** The day the period ends: the next main income, the day after, is shown even a little further than a month. */
  periodEnd: LocalDate;
}

/**
 * «Вот твой месяц» on the first limit: the weeks from today to a month ahead, read-only, with a dot
 * on every day an income comes (green) or a payment is due (red).
 */
export function MonthPreview({ data, today, periodEnd }: MonthPreviewProps) {
  const month = addDays(addMonths(today, 1), -1);
  const last = data.settings.mainIncomeSourceId === null ? month : maxDate(month, addDays(periodEnd, 1));
  const first = addDays(today, -weekdayIndex(today));
  const end = addDays(last, 6 - weekdayIndex(last));
  const marks = new Map<LocalDate, { income: boolean; payment: boolean }>();
  for (const e of plannedEvents(data, today, last)) {
    const mark = marks.get(e.date) ?? { income: false, payment: false };
    mark[e.kind] = true;
    marks.set(e.date, mark);
  }
  const days: LocalDate[] = [];
  for (let date = first; date <= end; date = addDays(date, 1)) days.push(date);

  return (
    <div className="card month-preview" data-testid="month-preview">
      <div className="month-preview-head">
        <strong>Вот твой месяц</strong>
        <span className="month-preview-legend" aria-hidden="true">
          <span className="month-dot is-income" />
          доход
          <span className="month-dot is-payment" />
          платёж
        </span>
      </div>
      <div className="month-preview-grid month-preview-weekdays" aria-hidden="true">
        {WEEKDAY_SHORT.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="month-preview-grid">
        {days.map((date) => {
          const mark = marks.get(date);
          const day = Number(date.slice(8, 10));
          const label = [formatDayMonth(date), date === today && 'сегодня', mark?.income && 'доход', mark?.payment && 'платёж'].filter(Boolean);
          return (
            <span
              key={date}
              className={`month-day${date < today || date > last ? ' is-outside' : ''}${date === today ? ' is-today' : ''}`}
              data-date={date}
              data-marks={mark ? [mark.income && 'income', mark.payment && 'payment'].filter(Boolean).join(' ') : undefined}
              aria-label={label.join(', ')}
            >
              <span className="month-day-number">
                {day}
                {day === 1 && <small> {MONTHS_SHORT[Number(date.slice(5, 7)) - 1]}</small>}
              </span>
              <span className="month-day-dots">
                {mark?.income && <span className="month-dot is-income" />}
                {mark?.payment && <span className="month-dot is-payment" />}
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
