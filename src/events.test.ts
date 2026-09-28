import { describe, expect, it } from 'vitest';
import { repeatLabel } from './components/EventSheet';
import { calculateBudget } from './domain/budget';
import { emptyData, exampleA, tx } from './domain/fixtures';
import { plannedEvents } from './domain/planned';
import type { AppData } from './domain/types';
import { eventDraftOf, isCurrentPlan, removeEvent, saveEvent, startDateAfterSave, type EventDraft } from './events';

// Calendar events: an income or a «расход» (payment) with «Повтор», saved as planned incomes and payments.

const TODAY = '2026-09-26';

function draft(fields: Partial<EventDraft>): EventDraft {
  return { kind: 'payment', incomeKind: 'other', name: 'Кино', amountKopecks: 2000, date: '2026-10-13', repeat: 'once', ...fields };
}

function onlyNew<T extends { id: string }>(before: T[], after: T[]): T {
  const ids = new Set(before.map((i) => i.id));
  const added = after.filter((i) => !ids.has(i.id));
  expect(added).toHaveLength(1);
  return added[0]!;
}

describe('saveEvent', () => {
  it('«Каждый месяц, 13-го» becomes a monthly payment from the tapped day', () => {
    const data = emptyData(TODAY);
    const next = saveEvent(data, draft({ name: 'Общежитие', amountKopecks: 4500, repeat: 'monthly' }), null);
    const payment = onlyNew(data.payments, next.payments);
    expect(payment).toMatchObject({ name: 'Общежитие', amountKopecks: 4500, dayOfMonth: 13, weekday: null, date: null, startDate: '2026-10-13' });
    const dates = plannedEvents(next, '2026-09-01', '2026-12-31').map((e) => e.date);
    expect(dates).toEqual(['2026-10-13', '2026-11-13', '2026-12-13']);
  });

  it('«Каждую неделю» takes the weekday of the tapped day; «Не повторять» keeps just that day', () => {
    const data = emptyData(TODAY);
    // 2026-10-05 is a Monday.
    const weekly = saveEvent(data, draft({ date: '2026-10-05', repeat: 'weekly' }), null);
    expect(onlyNew(data.payments, weekly.payments)).toMatchObject({ dayOfMonth: null, weekday: 1, date: null });
    const once = saveEvent(data, draft({ repeat: 'once' }), null);
    expect(onlyNew(data.payments, once.payments)).toMatchObject({ dayOfMonth: null, weekday: null, date: '2026-10-13' });
    expect(plannedEvents(once, '2026-09-01', '2026-12-31').map((e) => e.date)).toEqual(['2026-10-13']);
  });

  it('a one-off «расход» in the current period lowers today\'s limit at once', () => {
    const data = exampleA();
    const before = calculateBudget(data, TODAY);
    // Example А: the period runs to 4 October; a 20 BYN payment on 1 October is set aside now.
    const after = calculateBudget(saveEvent(data, draft({ date: '2026-10-01', amountKopecks: 2000 }), null), TODAY);
    expect(after.dailyLimitKopecks).toBeLessThan(before.dailyLimitKopecks);
    expect(after.unpaidPayments.some((p) => p.date === '2026-10-01' && p.amountKopecks === 2000)).toBe(true);
  });

  it('a new repeating income becomes the main one only when there is none', () => {
    const data = emptyData(TODAY);
    const income = draft({ kind: 'income', incomeKind: 'scholarship', name: 'Стипендия', amountKopecks: 22000, date: '2026-10-05', repeat: 'monthly' });
    const withMain = saveEvent(data, income, null);
    const main = onlyNew(data.incomeSources, withMain.incomeSources);
    expect(withMain.settings.mainIncomeSourceId).toBe(main.id);
    expect(main).toMatchObject({ kind: 'scholarship', dayOfMonth: 5, startDate: '2026-10-05' });

    // A second one, and a one-off, leave the main income alone.
    const second = saveEvent(withMain, { ...income, name: 'Подработка', incomeKind: 'salary' }, null);
    expect(second.settings.mainIncomeSourceId).toBe(main.id);
    const oneOff = saveEvent(emptyData(TODAY), { ...income, repeat: 'once' }, null);
    expect(oneOff.settings.mainIncomeSourceId).toBeNull();
  });

  it('a change keeps the event, its start and its role, and applies to every repeat', () => {
    const data = saveEvent(emptyData(TODAY), draft({ kind: 'income', name: 'Стипендия', amountKopecks: 22000, date: '2026-10-05', repeat: 'monthly' }), null);
    const id = data.settings.mainIncomeSourceId!;
    const opened = eventDraftOf(data, { kind: 'income', id }, '2026-11-05')!;
    expect(opened).toMatchObject({ kind: 'income', name: 'Стипендия', amountKopecks: 22000, date: '2026-11-05', repeat: 'monthly' });

    const changed = saveEvent(data, { ...opened, amountKopecks: 25000 }, id);
    expect(changed.incomeSources).toHaveLength(1);
    expect(changed.incomeSources[0]).toMatchObject({ id, amountKopecks: 25000, dayOfMonth: 5, startDate: '2026-10-05' });
    expect(changed.settings.mainIncomeSourceId).toBe(id);
    expect(plannedEvents(changed, '2026-10-01', '2026-11-30').map((e) => e.amountKopecks)).toEqual([25000, 25000]);
  });

  it('new days start at the edited occurrence, so none of them appear in the past; a new amount keeps the start', () => {
    // Monthly on the 13th from 13 October, that one paid; opened on 13 November (a Friday) and made weekly.
    let data = saveEvent(emptyData(TODAY), draft({ repeat: 'monthly' }), null);
    const id = data.payments[0]!.id;
    const paid = tx({ type: 'expense', amountKopecks: 2000, date: '2026-10-13', paymentId: id, plannedDate: '2026-10-13' });
    data = { ...data, transactions: [paid] };
    const opened = eventDraftOf(data, { kind: 'payment', id }, '2026-11-13')!;

    const weekly = saveEvent(data, { ...opened, repeat: 'weekly' }, id);
    expect(weekly.payments[0]).toMatchObject({ id, dayOfMonth: null, weekday: 5, startDate: '2026-11-13' });
    expect(plannedEvents(weekly, '2026-10-01', '2026-11-30').map((e) => e.date)).toEqual(['2026-11-13', '2026-11-20', '2026-11-27']);
    expect(weekly.transactions).toEqual([paid]);

    const cheaper = saveEvent(data, { ...opened, amountKopecks: 1500 }, id);
    expect(cheaper.payments[0]).toMatchObject({ amountKopecks: 1500, dayOfMonth: 13, startDate: '2026-10-13' });
    expect(plannedEvents(cheaper, '2026-10-01', '2026-11-30').map((e) => [e.date, e.amountKopecks, e.done])).toEqual([
      ['2026-10-13', 2000, true],
      ['2026-11-13', 1500, false],
    ]);
  });

  it('the start after a save: new ones and new days from the given day, otherwise as it was', () => {
    const monthly = { dayOfMonth: 5, weekday: null, date: null, startDate: '2026-09-26' };
    expect(startDateAfterSave(undefined, monthly, '2026-10-01')).toBe('2026-10-01');
    expect(startDateAfterSave(monthly, { ...monthly }, '2026-10-01')).toBe('2026-09-26');
    expect(startDateAfterSave(monthly, { dayOfMonth: 7, weekday: null, date: null }, '2026-10-01')).toBe('2026-10-01');
    expect(startDateAfterSave(monthly, { dayOfMonth: null, weekday: null, date: '2026-10-20' }, '2026-10-01')).toBe('2026-10-01');
  });

  it('«Финансы» leaves out one-off plans of earlier periods', () => {
    const period = { start: '2026-09-05', end: '2026-10-04' };
    expect(isCurrentPlan({ dayOfMonth: 1, weekday: null, date: null }, period)).toBe(true);
    expect(isCurrentPlan({ dayOfMonth: null, weekday: null, date: '2026-09-05' }, period)).toBe(true);
    expect(isCurrentPlan({ dayOfMonth: null, weekday: null, date: '2026-11-05' }, period)).toBe(true);
    expect(isCurrentPlan({ dayOfMonth: null, weekday: null, date: '2026-09-04' }, period)).toBe(false);
  });

  it('removing stops every repeat but keeps the payment for old operations', () => {
    const data: AppData = saveEvent(emptyData(TODAY), draft({ repeat: 'monthly' }), null);
    const id = data.payments[0]!.id;
    const removed = removeEvent(data, { kind: 'payment', id });
    expect(removed.payments[0]).toMatchObject({ id, isActive: false });
    expect(plannedEvents(removed, '2026-09-01', '2026-12-31')).toEqual([]);
    expect(eventDraftOf(removed, { kind: 'payment', id: 'nope' }, TODAY)).toBeNull();
  });
});

describe('repeatLabel', () => {
  it('reads like a phone calendar', () => {
    expect(repeatLabel('once', '2026-10-13')).toBe('Не повторять');
    expect(repeatLabel('monthly', '2026-10-13')).toBe('Каждый месяц, 13-го');
    expect(repeatLabel('monthly', '2026-10-31')).toBe('Каждый месяц, 31-го (или в последний день)');
    expect(repeatLabel('weekly', '2026-10-05')).toBe('Каждую неделю, по понедельникам');
    expect(repeatLabel('weekly', null)).toBe('Каждую неделю');
  });
});
