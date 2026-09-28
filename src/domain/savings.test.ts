import { describe, expect, it } from 'vitest';
import { goalSavedBy } from './budget';
import { addDays } from './dates';
import { exampleA, exampleV, expense, headphonesPercent, tx } from './fixtures';
import { incomeSplit, periodSavings, periodSummary, rebasedCushion, rebasedGoal } from './savings';

// Savings of update 1, on examples А and В (PROJECT_MAP.md section 2).

describe('how an income splits (example В)', () => {
  it('300,00: 10 % cushion 30,00 · 15 % headphones 45,00 · 225,00 for life', () => {
    expect(incomeSplit(exampleV(), 30000)).toEqual({
      cushionKopecks: 3000,
      goals: [{ goalId: 'headphones', kopecks: 4500 }],
      lifeKopecks: 22500,
    });
  });

  it('a goal takes no more than it still needs, shares are rounded up', () => {
    const data = exampleV();
    data.goals = [{ ...headphonesPercent, targetKopecks: 5000 }]; // 33,00 saved, 17,00 to go
    expect(incomeSplit(data, 30000)).toEqual({ cushionKopecks: 3000, goals: [{ goalId: 'headphones', kopecks: 1700 }], lifeKopecks: 25300 });
    // 10 % and 15 % of 0,01 are rounded up to 0,01 each.
    expect(incomeSplit(exampleV(), 1).lifeKopecks).toBe(0);
  });

  it('a fixed cushion, deadline goals and inactive goals take nothing', () => {
    const data = exampleA();
    data.goals.push({ ...headphonesPercent, id: 'old', status: 'cancelled' });
    expect(incomeSplit(data, 30000)).toEqual({ cushionKopecks: 0, goals: [], lifeKopecks: 30000 });
  });
});

describe('savings of the current period', () => {
  it('example В on 5 October: saved 55,00 (33,00 headphones + 22,00 cushion) of 180,00', () => {
    // Planned adds 15 % and 10 % of the salary expected on the 20th: 75,00 + 50,00.
    expect(periodSavings(exampleV(), '2026-10-05')).toEqual({ savedKopecks: 5500, plannedKopecks: 18000 });
  });

  it('once the salary is confirmed, everything planned is saved', () => {
    const data = exampleV();
    data.transactions.push(
      tx({ type: 'income', amountKopecks: 50000, date: '2026-10-20', incomeSourceId: 'salary', plannedDate: '2026-10-20' }),
    );
    expect(periodSavings(data, '2026-10-20')).toEqual({ savedKopecks: 18000, plannedKopecks: 18000 });
  });

  it('example А on 26 September: a deadline goal plans its growth to the end of the period', () => {
    // Headphones: 2,68 by today, 24,11 by 4 October; a fixed cushion does not grow.
    expect(periodSavings(exampleA(), '2026-09-26')).toEqual({ savedKopecks: 268, plannedKopecks: 2411 });
  });
});

describe('«Итоги периода»', () => {
  function trackedMonth() {
    const data = exampleA();
    data.transactions.push(
      expense('2026-09-26', 350, 'cafe'),
      expense('2026-09-27', 4000, 'fun'), // over the 28,54 limit
      tx({ type: 'expense', amountKopecks: 4500, date: '2026-10-01', paymentId: 'dorm', plannedDate: '2026-10-01' }),
    );
    for (let date = '2026-09-26'; date <= '2026-10-04'; date = addDays(date, 1)) data.daySummaries.push({ date, dailyLimitKopecks: 2854 });
    return data;
  }

  it('on the first day of a new period: 8 of 9 days in the limit, saved 24,11, left 443,39', () => {
    expect(periodSummary(trackedMonth(), '2026-10-05')).toEqual({
      period: { start: '2026-09-05', end: '2026-10-04' },
      daysInLimit: 8,
      daysTracked: 9,
      savedKopecks: 2411,
      // 586,00 − 3,50 − 40,00 − 45,00 = 497,50 on 4 October, minus 24,11 headphones and 30,00 cushion
      leftoverKopecks: 44339,
    });
  });

  it('none while the previous period ended before tracking started', () => {
    expect(periodSummary(trackedMonth(), '2026-09-30')).toBeNull();
  });

  it('percent savings grow with the incomes of the period (example В)', () => {
    const data = exampleV();
    data.transactions.push(
      tx({ type: 'income', amountKopecks: 50000, date: '2026-10-20', incomeSourceId: 'salary', plannedDate: '2026-10-20' }),
    );
    // 108,00 headphones + 72,00 cushion; 850,00 on hand minus 108,00 and 122,00.
    expect(periodSummary(data, '2026-11-05')).toMatchObject({ daysTracked: 0, savedKopecks: 18000, leftoverKopecks: 62000 });
  });
});

describe('counting savings afresh', () => {
  it('a goal keeps what it saved by yesterday', () => {
    const data = exampleV();
    const goal = rebasedGoal(data, headphonesPercent, '2026-10-06', 800);
    expect(goal).toMatchObject({ startDate: '2026-10-06', initialSavedKopecks: 4100, percent: 15 });
    expect(goalSavedBy(data, goal, '2026-10-06')).toBe(goalSavedBy(data, headphonesPercent, '2026-10-06') + 800);
    expect(rebasedGoal(data, headphonesPercent, '2026-10-06', 99999).initialSavedKopecks).toBe(15000);
  });

  it('a percent cushion keeps what it held by yesterday, never below 0', () => {
    expect(rebasedCushion(exampleV(), 5, '2026-10-06')).toEqual({ mode: 'percent', percent: 5, baseKopecks: 7200, sinceDate: '2026-10-06' });
    expect(rebasedCushion(exampleV(), 5, '2026-10-06', -9999).baseKopecks).toBe(0);
  });
});
