import { describe, expect, it } from 'vitest';
import {
  calendarMonth,
  dayLabel,
  dayLine,
  eventAmount,
  eventDots,
  eventStatus,
  forecastText,
  hasPlans,
  monthCells,
  monthOf,
  repeatText,
} from './calendar';
import { calculateBudget } from './domain/budget';
import { emptyData, exampleA, expense, oneOffPayment, source, tx } from './domain/fixtures';
import type { PlannedEvent } from './domain/planned';
import type { AppData } from './domain/types';
import { saveEvent } from './events';

// «Календарь» (update 1): the grid, its dots and tints, and the numbers of a day's sheet. Example А, 26 September.

const TODAY = '2026-09-26';

function event(fields: Partial<PlannedEvent>): PlannedEvent {
  return { kind: 'payment', sourceId: 'dorm', date: '2026-10-01', amountKopecks: 4500, done: false, ...fields };
}

/** Example А tracked since 20 September with a limit of 20,00 a day: in on the 20th, over on the 21st, no record on the 22nd. */
function trackedSinceSunday(): AppData {
  const data = exampleA();
  data.settings.trackingStartDate = '2026-09-20';
  data.daySummaries = ['2026-09-20', '2026-09-21', '2026-09-23', '2026-09-24', '2026-09-25'].map((date) => ({ date, dailyLimitKopecks: 2000 }));
  data.transactions.push(expense('2026-09-21', 2500, 'cafe'), expense('2026-09-23', 1200, 'cafe'), expense('2026-09-23', 3000, 'groceries'));
  return data;
}

describe('month grid', () => {
  it('whole weeks from Monday: October 2026 starts on a Thursday', () => {
    const cells = monthCells('2026-10-01');
    expect(cells).toHaveLength(35);
    expect(cells.slice(0, 4)).toEqual([null, null, null, '2026-10-01']);
    expect(cells.slice(-2)).toEqual(['2026-10-31', null]);
  });

  it('four to six rows: February 2027 fits in four, August 2026 needs six', () => {
    expect(monthCells('2027-02-01')).toHaveLength(28);
    expect(monthCells('2027-02-01')[0]).toBe('2027-02-01');
    expect(monthCells('2026-08-01')).toHaveLength(42);
    expect(monthCells('2026-08-01')[5]).toBe('2026-08-01');
    expect(monthOf('2026-10-13')).toBe('2026-10-01');
  });
});

describe('dots', () => {
  it('one per kind, incomes first; calm only when every event of the kind is done', () => {
    expect(eventDots([])).toEqual([]);
    expect(eventDots([event({ done: true }), event({ sourceId: 'phone' }), event({ kind: 'income', sourceId: 'scholarship', done: true })])).toEqual([
      { kind: 'income', done: true },
      { kind: 'payment', done: false },
    ]);
    expect(eventDots([event({ done: true }), event({ sourceId: 'phone', done: true })])).toEqual([{ kind: 'payment', done: true }]);
  });

  it('October of example А: payments on the 1st, 3rd and 4th, incomes on the 5th, 10th and 20th; a paid one is calm', () => {
    const data = exampleA();
    data.payments.push(oneOffPayment('concert', 2500, '2026-10-05', TODAY));
    data.transactions.push(tx({ type: 'expense', amountKopecks: 4500, date: TODAY, paymentId: 'dorm', plannedDate: '2026-10-01' }));
    const days = calendarMonth(data, TODAY, '2026-10-01');
    expect(days).toHaveLength(31);
    const withDots = days.filter((d) => d.dots.length > 0).map((d) => [d.date.slice(8), d.dots.map((dot) => `${dot.kind}${dot.done ? ' done' : ''}`).join(' + ')]);
    expect(withDots).toEqual([
      ['01', 'payment done'],
      ['03', 'payment'],
      ['04', 'payment'],
      ['05', 'income + payment'],
      ['10', 'income'],
      ['20', 'income'],
    ]);
    expect(days.every((d) => d.result === null && !d.isToday)).toBe(true);
  });

  it('«+ Расход» «Каждый месяц» on 2 October puts a dot on the 2nd of every month from then on', () => {
    const data = saveEvent(exampleA(), { kind: 'payment', incomeKind: 'other', name: 'Спортзал', amountKopecks: 2500, date: '2026-10-02', repeat: 'monthly' }, null);
    const dotOn = (month: string, day: string) => calendarMonth(data, TODAY, month).find((d) => d.date === `${month.slice(0, 8)}${day}`)!.dots;
    expect(dotOn('2026-10-01', '02')).toEqual([{ kind: 'payment', done: false }]);
    expect(dotOn('2026-11-01', '02')).toEqual([{ kind: 'payment', done: false }]);
    expect(dotOn('2026-09-01', '02')).toEqual([]);
  });
});

describe('past days', () => {
  it('tinted from the start of tracking to yesterday: in the limit, over it, or no record', () => {
    const days = calendarMonth(trackedSinceSunday(), TODAY, '2026-09-01');
    const results = Object.fromEntries(days.filter((d) => d.date >= '2026-09-19' && d.date <= '2026-09-27').map((d) => [d.date.slice(8), d.result]));
    // The 23rd spent 12,00 from the limit: groceries go to their reserve.
    expect(results).toEqual({ 19: null, 20: 'in', 21: 'over', 22: 'none', 23: 'in', 24: 'in', 25: 'in', 26: null, 27: null });
    expect(days.find((d) => d.date === TODAY)!.isToday).toBe(true);
  });

  it('a screen reader hears the date, the kinds of events and how the day went', () => {
    const days = calendarMonth(trackedSinceSunday(), TODAY, '2026-09-01');
    expect(dayLabel(days.find((d) => d.date === '2026-09-21')!)).toBe('21 сентября, перерасход');
    // Today is aria-current; the word would make the cell a second «Сегодня» button next to the tab.
    expect(dayLabel(days.find((d) => d.date === TODAY)!)).toBe('26 сентября');
    expect(dayLabel({ date: '2026-10-05', isToday: false, result: null, dots: [{ kind: 'income', done: false }, { kind: 'payment', done: false }] })).toBe(
      '5 октября, доход, расход',
    );
  });
});

describe('the day sheet line', () => {
  it('past: the recorded limit and what was spent from it; without a record, why', () => {
    const data = trackedSinceSunday();
    const budget = calculateBudget(data, TODAY);
    expect(dayLine(data, budget, '2026-09-21')).toEqual({ text: 'Лимит 20,00 · потрачено 25,00', danger: true });
    expect(dayLine(data, budget, '2026-09-23')).toEqual({ text: 'Лимит 20,00 · потрачено 12,00', danger: false });
    expect(dayLine(data, budget, '2026-09-22')).toEqual({ text: 'В этот день приложение не открывалось', danger: false });
    expect(dayLine(data, budget, '2026-09-19')).toEqual({ text: 'Учёт идёт с 20 сентября', danger: false });
  });

  it('today: what is left, an overspend or a shortfall, as on the home screen', () => {
    const data = exampleA();
    expect(dayLine(data, calculateBudget(data, TODAY), TODAY)).toEqual({ text: 'Сегодня осталось 28,54 из 28,54', danger: false });
    data.transactions.push(expense(TODAY, 350, 'cafe'), expense(TODAY, 500, 'delivery'), expense(TODAY, 4000, 'fun'));
    expect(dayLine(data, calculateBudget(data, TODAY), TODAY)).toEqual({ text: 'Сегодня перерасход 19,96 · лимит 28,54', danger: true });
    const short = exampleA({ balanceKopecks: 25000 });
    expect(dayLine(short, calculateBudget(short, TODAY), TODAY)).toEqual({ text: 'Не хватает 79,11 BYN до 5 октября', danger: true });
  });

  it('future: the forecast limit in whole BYN, rounded down', () => {
    const data = exampleA();
    const budget = calculateBudget(data, TODAY);
    // The forecast of example А: 28,54 until the scholarship, 7,80 from 5 October.
    expect(dayLine(data, budget, '2026-09-27').text).toBe('Прогноз: около 28 BYN в день');
    expect(dayLine(data, budget, '2026-10-05').text).toBe('Прогноз: около 7 BYN в день');
    expect([0, 50, 100, 2899].map(forecastText)).toEqual([
      'Прогноз: 0 BYN в день',
      'Прогноз: меньше 1 BYN в день',
      'Прогноз: около 1 BYN в день',
      'Прогноз: около 28 BYN в день',
    ]);
  });
});

describe('event rows', () => {
  it('how an event repeats, whether it is done, and its signed amount', () => {
    expect(repeatText({ dayOfMonth: 13, weekday: null, date: null })).toBe('каждый месяц, 13-го');
    expect(repeatText({ dayOfMonth: null, weekday: 1, date: null })).toBe('по понедельникам');
    expect(repeatText({ dayOfMonth: null, weekday: null, date: '2026-10-13' })).toBe('разово');
    expect(eventStatus(event({ done: true }), TODAY)).toBe('оплачено');
    expect(eventStatus(event({ kind: 'income', done: true }), TODAY)).toBe('получено');
    expect(eventStatus(event({ date: '2026-09-25' }), TODAY)).toBe('не оплачено');
    expect(eventStatus(event({ kind: 'income', date: '2026-09-25' }), TODAY)).toBe('не отмечено');
    expect(eventStatus(event({}), TODAY)).toBeNull();
    expect(eventAmount(event({}))).toBe('−45,00');
    expect(eventAmount(event({ kind: 'income', amountKopecks: 102000 }))).toBe('+1 020,00');
  });

  it('an empty calendar is one without planned incomes or payments', () => {
    const data = emptyData(TODAY);
    expect(hasPlans(data)).toBe(false);
    data.incomeSources.push({ ...source('parents', 'parents', 5000, null, TODAY), isActive: true });
    expect(hasPlans(data)).toBe(false); // irregular: nothing on any day
    data.payments.push({ ...oneOffPayment('concert', 2500, '2026-10-02', TODAY), isActive: false });
    expect(hasPlans(data)).toBe(false);
    data.payments.push(oneOffPayment('cinema', 1000, '2026-10-03', TODAY));
    expect(hasPlans(data)).toBe(true);
  });
});
