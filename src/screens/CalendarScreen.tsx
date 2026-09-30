import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { calendarMonth, hasPlans, monthOf } from '../calendar';
import { DaySheet } from '../components/DaySheet';
import { EventSheet } from '../components/EventSheet';
import { MonthGrid, MonthLegend } from '../components/MonthGrid';
import type { BudgetResult } from '../domain/budget';
import { addMonths } from '../domain/dates';
import type { AppData, LocalDate } from '../domain/types';
import { eventDraftOf, removeEvent, saveEvent, type EventKind, type EventRef } from '../events';
import { monthName } from '../ui/labels';
import type { Update } from './Finances';
import '../styles/calendar.css';

/** A request to show the calendar: from «Ближайшее», the week strip or «Открыть календарь». */
export interface CalendarFocus {
  /** Opens on this day's sheet; null: today's month without a sheet. */
  date: LocalDate | null;
}

interface CalendarBlockProps {
  data: AppData;
  budget: BudgetResult;
  today: LocalDate;
  update: Update;
  /** Scrolls the calendar into view when set; read once, when the block appears. */
  focus: CalendarFocus | null;
}

/** The form over the day sheet: a new income or «расход» on `date`, or a change of `edit` opened on it. */
interface EventForm {
  kind: EventKind;
  date: LocalDate;
  edit: EventRef | null;
}

/** How far ahead the months go. */
const MONTHS_AHEAD = 12;
/** A sideways swipe this long turns the month. */
const SWIPE_PX = 48;

function Chevron({ back }: { back?: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
      <path d={back ? 'M12.5 4l-6 6 6 6' : 'M7.5 4l6 6-6 6'} fill="none" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * The calendar at the top of «Финансы» (the «Календарь» tab of update 1), as on a phone: a month grid
 * with dots for planned incomes and payments, a tap on a day opens its sheet, and «+ Доход» /
 * «+ Расход» there plan money on that day.
 */
export function CalendarBlock({ data, budget, today, update, focus }: CalendarBlockProps) {
  const [month, setMonth] = useState(() => monthOf(focus?.date ?? today));
  const [enter, setEnter] = useState<'next' | 'previous' | null>(null);
  const [openDate, setOpenDate] = useState<LocalDate | null>(focus?.date ?? null);
  const [form, setForm] = useState<EventForm | null>(null);
  const days = useMemo(() => calendarMonth(data, today, month), [data, today, month]);
  const swiped = useRef(false);
  const block = useRef<HTMLElement>(null);
  const focused = focus !== null;
  useEffect(() => {
    if (focused) block.current?.scrollIntoView({ block: 'nearest' });
  }, [focused]);

  const start = data.settings.trackingStartDate;
  const earliest = monthOf(start < today ? start : today);
  const latest = addMonths(monthOf(today), MONTHS_AHEAD);
  const [year, monthNumber] = month.split('-').map(Number) as [number, number];

  const show = (next: LocalDate) => {
    if (next === month || next < earliest || next > latest) return;
    setEnter(next > month ? 'next' : 'previous');
    setMonth(next);
  };

  // A sideways swipe turns the month; a vertical one scrolls. The end is caught on the window,
  // so a swipe that leaves the grid still counts, and a scroll (pointercancel) never does.
  const onPointerDown = (down: ReactPointerEvent) => {
    swiped.current = false;
    const { clientX: x, clientY: y } = down;
    const finish = (up: PointerEvent) => {
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
      const dx = up.clientX - x;
      if (up.type !== 'pointerup' || Math.abs(dx) < SWIPE_PX || Math.abs(dx) < 1.5 * Math.abs(up.clientY - y)) return;
      swiped.current = true;
      show(addMonths(month, dx < 0 ? 1 : -1));
    };
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
  };

  return (
    <section className="cal-block" ref={block} aria-label="Календарь" data-testid="finance-calendar">
      <div className="cal-head">
        <h2 className="cal-month" aria-live="polite" data-testid="calendar-month">
          {monthName(monthNumber)}
          {String(year) === today.slice(0, 4) ? '' : ` ${year}`}
        </h2>
        <div className="cal-nav">
          {month !== monthOf(today) && (
            <button type="button" className="cal-today" onClick={() => show(monthOf(today))}>
              Сегодня
            </button>
          )}
          <button type="button" className="cal-arrow" aria-label="Предыдущий месяц" disabled={month <= earliest} onClick={() => show(addMonths(month, -1))}>
            <Chevron back />
          </button>
          <button type="button" className="cal-arrow" aria-label="Следующий месяц" disabled={month >= latest} onClick={() => show(addMonths(month, 1))}>
            <Chevron />
          </button>
        </div>
      </div>

      <div className="card cal-card" onPointerDown={onPointerDown} data-testid="calendar-grid">
        <MonthGrid
          key={month}
          month={month}
          days={days}
          selected={openDate}
          enter={enter}
          onSelect={(date) => {
            if (!swiped.current) setOpenDate(date);
          }}
        />
        {hasPlans(data) && <MonthLegend days={days} />}
      </div>
      {!hasPlans(data) && (
        <p className="cal-hint" data-testid="calendar-hint">
          Нажми на дату, чтобы добавить доход или расход
        </p>
      )}

      {openDate && (
        <DaySheet
          data={data}
          budget={budget}
          date={openDate}
          onAdd={(kind) => setForm({ kind, date: openDate, edit: null })}
          onEdit={(event) => setForm({ kind: event.kind, date: event.date, edit: { kind: event.kind, id: event.sourceId } })}
          onClose={() => setOpenDate(null)}
        />
      )}
      {form && (
        // Over the day sheet: after «Добавить» or «Сохранить» the day shows the change at once.
        <EventSheet
          kind={form.kind}
          date={form.date}
          initial={form.edit ? (eventDraftOf(data, form.edit, form.date) ?? undefined) : undefined}
          editing={form.edit !== null}
          onSave={(draft) => update((d) => saveEvent(d, draft, form.edit?.id ?? null))}
          onDelete={form.edit ? () => update((d) => removeEvent(d, form.edit!)) : undefined}
          onClose={() => setForm(null)}
        />
      )}
    </section>
  );
}
