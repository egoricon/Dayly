import { describe, expect, it } from 'vitest';
import { addIncome, createInitialData, putIntoJar, saveIncomeSource, setTargetDailyLimit } from './appData';
import { calculateBudget, cushionSavedBy, goalSavedBy } from './domain/budget';
import { exampleA, exampleV, headphones, headphonesPercent, source, tx } from './domain/fixtures';
import { incomeSplit, periodSavings } from './domain/savings';
import type { AppData } from './domain/types';

// Update 1, app layer: «Отложить остаток» (a savings move since update 2), the split of a confirmed income, the target limit.

const NOW = new Date('2026-10-05T09:00:00');

const goal = (data: AppData) => data.goals.find((g) => g.id === 'headphones')!;

describe('«Отложить остаток»', () => {
  it('8,00 into a deadline goal: a move dated today, today’s share recounted; balance stays, limit goes down', () => {
    // Example А on 30 September: headphones 10,72 by yesterday, 13,40 by today; limit 256,89 ÷ 5 = 51,37.
    const data = exampleA();
    const before = calculateBudget(data, '2026-09-30');
    const next = putIntoJar(data, { goalId: 'headphones' }, 800, '2026-09-30', NOW, 'leftover');
    // Update 2: the goal is not counted afresh any more, the money is a move.
    expect(goal(next)).toEqual(headphones);
    expect(next.savingsMoves).toEqual([
      { id: expect.any(String), goalId: 'headphones', amountKopecks: 800, date: '2026-09-30', createdAt: NOW.toISOString(), source: 'leftover', transactionId: null },
    ]);
    const savedBy = (d: AppData, date: string) => goalSavedBy(d, goal(d), date);
    // The day before keeps its value (update 1 showed 18,72 there: the rebase moved the 8,00 into the past).
    expect([savedBy(data, '2026-09-29'), savedBy(next, '2026-09-29')]).toEqual([1072, 1072]);
    // Today's share was 2,68 of what was left over 56 days; now 2,53 of 131,28 over the 52 days left.
    expect([savedBy(data, '2026-09-30'), savedBy(next, '2026-09-30')]).toEqual([1340, 2125]);
    expect([savedBy(data, '2026-10-04'), savedBy(next, '2026-10-04')]).toEqual([2411, 3135]);
    expect(savedBy(next, '2026-11-20')).toBe(15000);
    const after = calculateBudget(next, '2026-09-30');
    expect(after.balanceKopecks).toBe(before.balanceKopecks);
    expect(next.transactions).toEqual(data.transactions);
    expect([before.dailyLimitKopecks, after.dailyLimitKopecks]).toEqual([5137, 4993]);
  });

  it('8,00 into a percent goal: +8,00 from today on and after every later income; the savings ring grows by 8,00', () => {
    const data = exampleV();
    const next = putIntoJar(data, { goalId: 'headphones' }, 800, '2026-10-06', NOW, 'leftover');
    expect(goal(next)).toEqual(headphonesPercent);
    expect([goalSavedBy(next, goal(next), '2026-10-05'), goalSavedBy(next, goal(next), '2026-10-06')]).toEqual([3300, 4100]); // 33,00 + 8,00
    const salary = tx({ type: 'income', amountKopecks: 50000, date: '2026-10-20', incomeSourceId: 'salary', plannedDate: '2026-10-20' });
    const later = { ...next, transactions: [...next.transactions, salary] };
    expect(goalSavedBy(later, goal(later), '2026-10-20')).toBe(11600); // 108,00 + 8,00
    expect([calculateBudget(data, '2026-10-06').dailyLimitKopecks, calculateBudget(next, '2026-10-06').dailyLimitKopecks]).toEqual([283, 226]);
    // Update 1 kept the ring as it was (the 8,00 went into the goal's base); a move counts in its period.
    expect(periodSavings(data, '2026-10-06')).toEqual({ savedKopecks: 5500, plannedKopecks: 18000 });
    expect(periodSavings(next, '2026-10-06')).toEqual({ savedKopecks: 6300, plannedKopecks: 18800 });
    expect(calculateBudget(next, '2026-10-06').balanceKopecks).toBe(calculateBudget(data, '2026-10-06').balanceKopecks);
  });

  it('into the cushion: a move on top of what it holds, in either mode', () => {
    const percent = putIntoJar(exampleV(), { cushion: true }, 800, '2026-10-06', NOW, 'leftover');
    expect(percent.settings.cushion).toEqual(exampleV().settings.cushion);
    expect([cushionSavedBy(exampleV(), '2026-10-06'), cushionSavedBy(percent, '2026-10-06')]).toEqual([7200, 8000]);
    const fixed = putIntoJar(exampleA(), { cushion: true }, 800, '2026-09-30', NOW, 'leftover');
    expect(fixed.settings.cushion).toEqual(exampleA().settings.cushion);
    expect(cushionSavedBy(fixed, '2026-09-30')).toBe(3800);
  });

  it('a goal never holds more than its target; an unknown goal changes nothing', () => {
    const deadline = putIntoJar(exampleA(), { goalId: 'headphones' }, 20000, '2026-09-30', NOW);
    expect(deadline.savingsMoves.map((m) => m.amountKopecks)).toEqual([15000 - 1340]);
    const percent = putIntoJar(exampleV(), { goalId: 'headphones' }, 20000, '2026-10-06', NOW);
    expect(percent.savingsMoves.map((m) => m.amountKopecks)).toEqual([15000 - 3300]);
    expect(goalSavedBy(percent, goal(percent), '2026-10-06')).toBe(15000);
    const data = exampleA();
    expect(putIntoJar(data, { goalId: 'nope' }, 800, '2026-09-30', NOW)).toBe(data);
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
  it('onboarding creates current data: monthly payments, no target limit', () => {
    const data = createInitialData(
      '2026-09-26',
      {
        balanceKopecks: 58600,
        income: { kind: 'scholarship', amountKopecks: 22000, date: '2026-10-05' },
        payments: [{ name: 'Общежитие', amountKopecks: 4500, date: '2026-10-01' }],
      },
      NOW,
    );
    expect(data.schemaVersion).toBe(6);
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
