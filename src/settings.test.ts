import { describe, expect, it } from 'vitest';
import {
  addIncome,
  buyGoal,
  createInitialData,
  markPaymentPaid,
  reconcileBalance,
  removeIncomeSource,
  saveGoal,
  setCushionFixed,
  setCushionPercent,
  setReserve,
  takeFromCushion,
} from './appData';
import { calculateBudget, cushionSavedBy } from './domain/budget';
import { incomesToConfirm, occurrenceToClose, paymentOccurrence } from './domain/planned';
import type { AppData } from './domain/types';
import { hideBanner, isBannerHidden } from './uiState';

const NOW = new Date('2026-09-26T09:00:00');

/** Onboarding with the numbers of example А (PROJECT_MAP.md section 2). */
function onboarded(): AppData {
  return createInitialData(
    '2026-09-26',
    {
      balanceKopecks: 58600,
      income: { kind: 'scholarship', amountKopecks: 22000, date: '2026-10-05' },
      payments: [
        { name: 'Общежитие', amountKopecks: 4500, date: '2026-10-01' },
        { name: 'Интернет', amountKopecks: 3000, date: '2026-10-03' },
        { name: 'Телефон', amountKopecks: 2000, date: '2026-10-04' },
      ],
    },
    NOW,
  );
}

/** Example А after the settings: reserves 500 and 100, cushion 30, headphones 150 by 20 November. */
function configured(): AppData {
  let data = onboarded();
  data = setReserve(data, 'groceries', 50000);
  data = setReserve(data, 'transport', 10000);
  data = setCushionFixed(data, 3000);
  return saveGoal(data, {
    id: 'headphones',
    name: 'Наушники',
    targetKopecks: 15000,
    initialSavedKopecks: 0,
    startDate: '2026-09-26',
    deadline: '2026-11-20',
    status: 'active',
  });
}

const scholarshipId = (data: AppData) => data.settings.mainIncomeSourceId!;

describe('onboarding', () => {
  it('first limit (2e): (586,00 − 95,00) ÷ 9 = 54,55 until 5 October', () => {
    const r = calculateBudget(onboarded(), '2026-09-26');
    expect(r.period).toEqual({ start: '2026-09-05', end: '2026-10-04' });
    expect(r.bindingCheckpoint.date).toBe('2026-10-05');
    expect(r.breakdown).toMatchObject({ startOfDayKopecks: 58600, paymentsKopecks: 9500, freeKopecks: 49100, days: 9 });
    expect(r.dailyLimitKopecks).toBe(5455);
  });

  it('the income picked for the same day next month is not expected today', () => {
    const data = createInitialData(
      '2026-09-26',
      { balanceKopecks: 30000, income: { kind: 'salary', amountKopecks: 50000, date: '2026-10-26' }, payments: [] },
      NOW,
    );
    const r = calculateBudget(data, '2026-09-26');
    expect(r.period).toEqual({ start: '2026-09-26', end: '2026-10-25' });
    expect(r.expectedIncomes).toEqual([]);
    expect(r.dailyLimitKopecks).toBe(1000); // 300,00 ÷ 30
  });
});

describe('settings', () => {
  it('reserves, cushion and a goal bring the limit to 28,54', () => {
    expect(calculateBudget(configured(), '2026-09-26').dailyLimitKopecks).toBe(2854);
  });

  it('a paid payment is not deducted again and does not touch the limit', () => {
    let data = configured();
    const dorm = data.payments.find((p) => p.name === 'Общежитие')!;
    const period = calculateBudget(data, '2026-09-26').period;
    expect(paymentOccurrence(data, dorm.id, period)).toBe('2026-10-01');
    data = markPaymentPaid(data, dorm, '2026-10-01', '2026-09-26', NOW);
    const r = calculateBudget(data, '2026-09-26');
    expect(r.unpaidPayments.map((p) => p.date)).toEqual(['2026-10-03', '2026-10-04']);
    expect(r.balanceKopecks).toBe(54100);
    expect(r.dailyLimitKopecks).toBe(2854);
  });

  it('reconcile adds the difference as an adjustment', () => {
    const data = reconcileBalance(configured(), 56000, 58600, '2026-09-26', NOW);
    const r = calculateBudget(data, '2026-09-26');
    expect(r.balanceKopecks).toBe(56000);
    expect(data.transactions.at(-1)).toMatchObject({ type: 'adjustment', amountKopecks: -2600, note: 'Сверка баланса' });
    expect(reconcileBalance(data, 56000, 56000, '2026-09-26', NOW)).toBe(data);
  });

  it('percent cushion keeps what is saved; taking from it frees the money', () => {
    let data = setCushionPercent(configured(), 3, '2026-09-26');
    expect(cushionSavedBy(data, '2026-09-26')).toBe(3000);
    data = addIncome(data, 22000, scholarshipId(data), '2026-10-05', '2026-10-05', NOW);
    expect(cushionSavedBy(data, '2026-10-05')).toBe(3660); // 30,00 + 3% of 220,00
    const before = calculateBudget(data, '2026-10-05').breakdown;
    data = takeFromCushion(data, 1000, '2026-10-05');
    expect(cushionSavedBy(data, '2026-10-05')).toBe(2660);
    const after = calculateBudget(data, '2026-10-05').breakdown;
    expect(after.freeKopecks - before.freeKopecks).toBe(1000);
  });

  it('buying a goal frees its saved money without touching the limit', () => {
    const data = buyGoal(configured(), 'headphones', 15000, '2026-09-26', NOW);
    const r = calculateBudget(data, '2026-09-26');
    expect(data.goals[0]!.status).toBe('done');
    expect(r.breakdown.goalsKopecks).toBe(0);
    expect(r.spentTodayKopecks).toBe(0);
    // 586,00 − 150,00 − 95,00 − 180,00 − 30,00 = 131,00 ÷ 9
    expect(r.dailyLimitKopecks).toBe(1455);
  });

  it('removing the main income falls back to the calendar month', () => {
    const base = configured();
    const data = removeIncomeSource(base, scholarshipId(base));
    expect(data.settings.mainIncomeSourceId).toBeNull();
    expect(calculateBudget(data, '2026-09-26').period).toEqual({ start: '2026-09-01', end: '2026-09-30' });
  });
});

describe('confirmations', () => {
  it('asks «Стипендия пришла?» on its day and later, until confirmed', () => {
    const data = configured();
    const id = scholarshipId(data);
    expect(incomesToConfirm(data, '2026-10-04')).toEqual([]);
    expect(incomesToConfirm(data, '2026-10-05')).toEqual([{ sourceId: id, date: '2026-10-05', amountKopecks: 22000 }]);
    expect(incomesToConfirm(data, '2026-10-07').map((o) => o.date)).toEqual(['2026-10-05']);
    const confirmed = addIncome(data, 22000, id, '2026-10-05', '2026-10-07', NOW);
    expect(incomesToConfirm(confirmed, '2026-10-07')).toEqual([]);
  });

  it('confirming on the expected day does not change the limit', () => {
    const data = configured();
    const before = calculateBudget(data, '2026-10-05');
    const after = calculateBudget(addIncome(data, 22000, scholarshipId(data), '2026-10-05', '2026-10-05', NOW), '2026-10-05');
    expect(after.dailyLimitKopecks).toBe(before.dailyLimitKopecks);
  });

  it('an income that came a day early closes the planned occurrence', () => {
    const data = configured();
    expect(occurrenceToClose(data, scholarshipId(data), '2026-10-04')).toBe('2026-10-05');
    expect(occurrenceToClose(data, scholarshipId(data), '2026-09-26')).toBeNull();
  });

  it('«Ещё нет» hides a banner until tomorrow', () => {
    const state = hideBanner({ hiddenBanners: { old: '2026-10-04' } }, 'income|x|2026-10-05', '2026-10-05');
    expect(state.hiddenBanners).toEqual({ 'income|x|2026-10-05': '2026-10-05' });
    expect(isBannerHidden(state, 'income|x|2026-10-05', '2026-10-05')).toBe(true);
    expect(isBannerHidden(state, 'income|x|2026-10-05', '2026-10-06')).toBe(false);
  });
});
