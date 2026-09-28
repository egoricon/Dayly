import { describe, expect, it } from 'vitest';
import { exampleA, oneOffPayment, source, tx, weeklyPayment } from './fixtures';
import { paymentOccurrence, paymentOccurrences, plannedEvents, upcomingEvents } from './planned';

// Planned events for the calendar and «Ближайшее» (update 1), example А from 26 September.

describe('planned events', () => {
  it('incomes and payments of every schedule in date order; paid ones are done with the paid amount', () => {
    const data = exampleA();
    data.payments.push(weeklyPayment('gym', 500, 7, '2026-09-26'), oneOffPayment('concert', 2500, '2026-10-05', '2026-09-26'));
    data.incomeSources.push(source('gift', 'other', 5000, null, '2026-09-26', null, '2026-09-30'));
    data.transactions.push(tx({ type: 'expense', amountKopecks: 4600, date: '2026-09-30', paymentId: 'dorm', plannedDate: '2026-10-01' }));
    expect(plannedEvents(data, '2026-09-26', '2026-10-05').map((e) => [e.date, e.kind, e.sourceId, e.amountKopecks, e.done])).toEqual([
      ['2026-09-27', 'payment', 'gym', 500, false],
      ['2026-09-30', 'income', 'gift', 5000, false],
      ['2026-10-01', 'payment', 'dorm', 4600, true],
      ['2026-10-03', 'payment', 'internet', 3000, false],
      ['2026-10-04', 'payment', 'phone', 2000, false],
      ['2026-10-04', 'payment', 'gym', 500, false],
      ['2026-10-05', 'income', 'scholarship', 22000, false], // incomes first on the same day
      ['2026-10-05', 'payment', 'concert', 2500, false],
    ]);
  });

  it('nothing before the start of tracking or of the source, and nothing removed', () => {
    const data = exampleA();
    data.incomeSources.push(source('late', 'other', 1000, 1, '2026-11-01'));
    data.payments[0] = { ...data.payments[0]!, isActive: false };
    expect(plannedEvents(data, '2026-09-01', '2026-10-31').map((e) => e.sourceId)).toEqual([
      'internet', 'phone', 'scholarship', 'parents', 'salary',
    ]);
  });

  it('«Ближайшее»: the next events not done yet, from today', () => {
    const data = exampleA();
    data.transactions.push(tx({ type: 'expense', amountKopecks: 4500, date: '2026-09-30', paymentId: 'dorm', plannedDate: '2026-10-01' }));
    expect(upcomingEvents(data, '2026-09-30', 3).map((e) => [e.date, e.sourceId])).toEqual([
      ['2026-10-03', 'internet'],
      ['2026-10-04', 'phone'],
      ['2026-10-05', 'scholarship'],
    ]);
    expect(upcomingEvents(data, '2026-10-06', 1).map((e) => [e.date, e.sourceId])).toEqual([['2026-10-10', 'parents']]);
  });
});

describe('payment occurrences in a period', () => {
  const period = { start: '2026-09-05', end: '2026-10-04' };

  it('a weekly payment has several; the one to show is the first unpaid, then the last', () => {
    const data = exampleA();
    data.payments.push(weeklyPayment('gym', 500, 7, '2026-09-26'));
    expect(paymentOccurrences(data, 'gym', period)).toEqual(['2026-09-27', '2026-10-04']);
    expect(paymentOccurrence(data, 'gym', period)).toBe('2026-09-27');
    data.transactions.push(tx({ type: 'expense', amountKopecks: 500, date: '2026-09-27', paymentId: 'gym', plannedDate: '2026-09-27' }));
    expect(paymentOccurrence(data, 'gym', period)).toBe('2026-10-04');
    data.transactions.push(tx({ type: 'expense', amountKopecks: 500, date: '2026-10-04', paymentId: 'gym', plannedDate: '2026-10-04' }));
    expect(paymentOccurrence(data, 'gym', period)).toBe('2026-10-04');
  });

  it('a one-off payment outside the period has none', () => {
    const data = exampleA();
    data.payments.push(oneOffPayment('concert', 2500, '2026-10-05', '2026-09-26'));
    expect(paymentOccurrences(data, 'concert', period)).toEqual([]);
    expect(paymentOccurrence(data, 'concert', period)).toBeNull();
    expect(paymentOccurrence(data, 'dorm', period)).toBe('2026-10-01');
  });
});
