import { describe, expect, it } from 'vitest';
import { addIncome, createInitialData, saveIncomeSource, setAsideLeftover, setTargetDailyLimit } from './appData';
import { calculateBudget, cushionSavedBy, goalSavedBy } from './domain/budget';
import { exampleA, exampleV, headphones, headphonesPercent, source, tx } from './domain/fixtures';
import { incomeSplit, periodSavings } from './domain/savings';
import type { AppData } from './domain/types';

// Update 1, app layer: «Отложить остаток», the split of a confirmed income, the target limit.

const NOW = new Date('2026-10-05T09:00:00');

const goal = (data: AppData) => data.goals.find((g) => g.id === 'headphones')!;

describe('«Отложить остаток»', () => {
  it('8,00 into a deadline goal: +8,00 by yesterday exactly, today’s share recounted; balance stays, limit goes down', () => {
    // Example А on 30 September: headphones 10,72 by yesterday, 13,40 by today; limit 256,89 ÷ 5 = 51,37.
    const data = exampleA();
    const before = calculateBudget(data, '2026-09-30');
    const next = setAsideLeftover(data, { goalId: 'headphones' }, 800, '2026-09-30');
    expect(goal(next)).toMatchObject({ startDate: '2026-09-30', initialSavedKopecks: 1872, deadline: '2026-11-20' });
    const savedBy = (d: AppData, date: string) => goalSavedBy(d, goal(d), date);
    expect([savedBy(data, '2026-09-29'), savedBy(next, '2026-09-29')]).toEqual([1072, 1872]); // exactly +8,00
    // Today's share was 2,68 of what was left over 56 days; now 2,53 of 131,28 over the 52 days left.
    expect([savedBy(data, '2026-09-30'), savedBy(next, '2026-09-30')]).toEqual([1340, 2125]);
    expect([savedBy(data, '2026-10-04'), savedBy(next, '2026-10-04')]).toEqual([2411, 3135]);
    expect(savedBy(next, '2026-11-20')).toBe(15000);
    expect(goal(data)).toEqual(headphones);
    const after = calculateBudget(next, '2026-09-30');
    expect(after.balanceKopecks).toBe(before.balanceKopecks);
    expect(next.transactions).toEqual(data.transactions);
    expect([before.dailyLimitKopecks, after.dailyLimitKopecks]).toEqual([5137, 4993]);
  });

  it('8,00 into a percent goal: +8,00 today and after every later income; the period keeps its growth', () => {
    const data = exampleV();
    const next = setAsideLeftover(data, { goalId: 'headphones' }, 800, '2026-10-06');
    expect(goal(next)).toMatchObject({ startDate: '2026-10-05', initialSavedKopecks: 800, percent: 15 });
    expect(goalSavedBy(next, goal(next), '2026-10-06')).toBe(4100); // 33,00 + 8,00
    const salary = tx({ type: 'income', amountKopecks: 50000, date: '2026-10-20', incomeSourceId: 'salary', plannedDate: '2026-10-20' });
    const later = { ...next, transactions: [...next.transactions, salary] };
    expect(goalSavedBy(later, goal(later), '2026-10-20')).toBe(11600); // 108,00 + 8,00
    expect([calculateBudget(data, '2026-10-06').dailyLimitKopecks, calculateBudget(next, '2026-10-06').dailyLimitKopecks]).toEqual([283, 226]);
    expect(periodSavings(next, '2026-10-06')).toEqual(periodSavings(data, '2026-10-06'));
    expect(calculateBudget(next, '2026-10-06').balanceKopecks).toBe(calculateBudget(data, '2026-10-06').balanceKopecks);
  });

  it('into the cushion: a percent cushion gets the amount on its base, a fixed one simply grows', () => {
    const percent = setAsideLeftover(exampleV(), { cushion: true }, 800, '2026-10-06');
    expect(percent.settings.cushion).toEqual({ mode: 'percent', percent: 10, baseKopecks: 5800, sinceDate: '2026-10-05' });
    expect(cushionSavedBy(percent, '2026-10-06')).toBe(cushionSavedBy(exampleV(), '2026-10-06') + 800); // 72,00 → 80,00
    expect(setAsideLeftover(exampleA(), { cushion: true }, 800, '2026-09-30').settings.cushion).toEqual({ mode: 'fixed', amountKopecks: 3800 });
  });

  it('a goal never holds more than its target; an unknown goal changes nothing', () => {
    expect(goal(setAsideLeftover(exampleA(), { goalId: 'headphones' }, 20000, '2026-09-30')).initialSavedKopecks).toBe(15000);
    expect(goal(setAsideLeftover(exampleV(), { goalId: 'headphones' }, 20000, '2026-10-06')).initialSavedKopecks).toBe(15000);
    const data = exampleA();
    expect(setAsideLeftover(data, { goalId: 'nope' }, 800, '2026-09-30')).toBe(data);
  });
});

describe('a confirmed income with percent savings', () => {
  it('«Стипендия пришла?» with 300,00: 45,00 go to the headphones, 30,00 to the cushion, the savings ring grows by 75,00', () => {
    const data = exampleV();
    data.incomeSources[0] = { ...data.incomeSources[0]!, amountKopecks: 30000 };
    expect(incomeSplit(data, 30000)).toEqual({ cushionKopecks: 3000, goals: [{ goalId: 'headphones', kopecks: 4500 }], lifeKopecks: 22500 });
    const confirmed = addIncome(data, 30000, 'scholarship', '2026-11-05', '2026-11-05', NOW);
    expect(goalSavedBy(confirmed, headphonesPercent, '2026-11-05') - goalSavedBy(data, headphonesPercent, '2026-11-05')).toBe(4500);
    const ring = periodSavings(data, '2026-11-05');
    const filled = periodSavings(confirmed, '2026-11-05');
    expect(filled.savedKopecks - ring.savedKopecks).toBe(7500);
    expect(filled.plannedKopecks).toBe(ring.plannedKopecks); // it was planned
  });
});

describe('model v5 in the app layer', () => {
  it('onboarding creates version 5 data: monthly payments, no target limit', () => {
    const data = createInitialData(
      '2026-09-26',
      {
        balanceKopecks: 58600,
        income: { kind: 'scholarship', amountKopecks: 22000, date: '2026-10-05' },
        payments: [{ name: 'Общежитие', amountKopecks: 4500, date: '2026-10-01' }],
      },
      NOW,
    );
    expect(data.schemaVersion).toBe(5);
    expect(data.settings.targetDailyLimitKopecks).toBeNull();
    expect(data.incomeSources[0]).toMatchObject({ dayOfMonth: 5, weekday: null, date: null });
    expect(data.payments[0]).toMatchObject({ dayOfMonth: 1, weekday: null, date: null });
  });

  it('«Хочу тратить N в день» is kept in the settings and does not change the limit', () => {
    const data = setTargetDailyLimit(exampleA(), 3000);
    expect(data.settings.targetDailyLimitKopecks).toBe(3000);
    expect(calculateBudget(data, '2026-09-26').dailyLimitKopecks).toBe(2854);
    expect(setTargetDailyLimit(data, null).settings.targetDailyLimitKopecks).toBeNull();
  });

  it('a one-off income cannot become the main one', () => {
    const data = exampleA();
    const gift = source('gift', 'other', 5000, null, '2026-09-26', null, '2026-09-30');
    expect(saveIncomeSource(data, gift, true).settings.mainIncomeSourceId).toBe('scholarship');
    const oneOffScholarship = { ...data.incomeSources[0]!, dayOfMonth: null, date: '2026-10-05' };
    expect(saveIncomeSource(data, oneOffScholarship, true).settings.mainIncomeSourceId).toBeNull();
  });
});
