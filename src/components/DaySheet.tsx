import { useMemo } from 'react';
import { dayLine, eventAmount, eventStatus, repeatText } from '../calendar';
import type { BudgetResult } from '../domain/budget';
import { plannedEvents, type PlannedEvent } from '../domain/planned';
import type { AppData, LocalDate } from '../domain/types';
import type { EventKind } from '../events';
import { formatDayHeader } from '../ui/labels';
import { BottomSheet } from './BottomSheet';
import '../styles/calendar.css';

interface DaySheetProps {
  data: AppData;
  budget: BudgetResult;
  date: LocalDate;
  /** «+ Доход» / «+ Расход» on this day. */
  onAdd: (kind: EventKind) => void;
  /** A tap on a planned income or payment opens it for a change. */
  onEdit: (event: PlannedEvent) => void;
  onClose: () => void;
}

/**
 * A day of «Календарь»: the date, how the day went or its forecast, what is planned on it,
 * and two big buttons to plan an income or a «расход» on it.
 */
export function DaySheet({ data, budget, date, onAdd, onEdit, onClose }: DaySheetProps) {
  // The forecast of a far day simulates every day up to it: once per change of the data.
  const line = useMemo(() => dayLine(data, budget, date), [data, budget, date]);
  const events = plannedEvents(data, date, date);
  // Before tracking started nothing is counted, so an event there would never show.
  const canPlan = date >= data.settings.trackingStartDate;
  const year = date.slice(0, 4) === budget.today.slice(0, 4) ? '' : ` ${date.slice(0, 4)}`;

  return (
    <BottomSheet onClose={onClose} className="form-sheet day-sheet">
      {() => (
        <>
          <div className="sheet-body">
            <div className="day-sheet-head">
              <h2 className="sheet-title">
                {formatDayHeader(date)}
                {year}
              </h2>
              {line.text && (
                <span className={`day-sheet-line${line.danger ? ' is-danger' : ''}`} data-testid="day-line">
                  {line.text}
                </span>
              )}
            </div>
            {events.length > 0 && (
              <ul className="card list day-events" data-testid="day-events">
                {events.map((event) => {
                  const item =
                    event.kind === 'income'
                      ? data.incomeSources.find((s) => s.id === event.sourceId)
                      : data.payments.find((p) => p.id === event.sourceId);
                  if (!item) return null;
                  const status = eventStatus(event, budget.today);
                  return (
                    <li key={`${event.kind}|${event.sourceId}`}>
                      <button type="button" className="list-row day-event" onClick={() => onEdit(event)}>
                        <span className={`cal-dot is-${event.kind}${event.done ? ' is-done' : ''}`} aria-hidden="true" />
                        <span className="list-text">
                          <span className="list-name">{item.name}</span>
                          <span className="list-sub">
                            {repeatText(item)}
                            {status && ` · ${status}`}
                          </span>
                        </span>
                        <span className={`list-value is-${event.kind}`}>{eventAmount(event)}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          {canPlan && (
            <div className="day-actions">
              <button type="button" className="day-add is-income" onClick={() => onAdd('income')}>
                + Доход
              </button>
              <button type="button" className="day-add is-payment" onClick={() => onAdd('payment')}>
                + Расход
              </button>
            </div>
          )}
        </>
      )}
    </BottomSheet>
  );
}
