import { describe, expect, it } from 'vitest';
import { addExpense, buyGoal, createInitialData, deleteTransaction, recordDaySummary, saveGoal, setCushionFixed, setReserve, updateExpense } from './appData';
import { calculateBudget, previewExpense } from './domain/budget';
import { categoryTotals, dayResults, filterHistoryDays, historyDays, limitStreak, recentOperations } from './domain/history';
import { formatOperationTime } from './ui/labels';
import { pickSavingsCard } from './ui/savings';
import type { AppData } from './domain/types';

// Stage 4: history 2h, editing expenses and the terms of «Как считается». Numbers of example А.

const at = (time: string) => new Date(`2026-09-26T${time}:00`);

function configured(): AppData {
  let data = createInitialData(
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
    at('08:00'),
  );
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
    percent: null,
    status: 'active',
  });
}

/** 26 September: cafe 3,50 and groceries 18,40; the app recorded the limit 28,54. */
function withFirstDay(): AppData {
  let data = configured();
  data = addExpense(data, 350, 'cafe', '2026-09-26', at('09:12'));
  data = addExpense(data, 1840, 'groceries', '2026-09-26', at('18:30'));
  return recordDaySummary(data, '2026-09-26', calculateBudget(data, '2026-09-26').dailyLimitKopecks);
}

describe('history', () => {
  it('groups by day, newest first: spent from the limit, the limit and the carry', () => {
    let data = withFirstDay();
    data = addExpense(data, 500, 'delivery', '2026-09-27', new Date('2026-09-27T13:40:00'));
    const days = historyDays(data, '2026-09-27', 3104);

    expect(days.map((d) => d.date)).toEqual(['2026-09-27', '2026-09-26']);
    expect(days[0]).toMatchObject({ spentFromLimitKopecks: 500, dailyLimitKopecks: 3104, carryKopecks: null });
    // Groceries come from the reserve and are not in «из лимита»: 28,54 − 3,50 = +25,04
    expect(days[1]).toMatchObject({ spentFromLimitKopecks: 350, dailyLimitKopecks: 2854, carryKopecks: 2504 });
    expect(days[1]!.entries.map((e) => [e.transaction.category ?? e.transaction.note, e.fromLimitKopecks])).toEqual([
      ['groceries', 0],
      ['cafe', 350],
      ['Стартовый баланс', 0],
    ]);
    expect(calculateBudget(data, '2026-09-27').carryFromYesterdayKopecks).toBe(days[1]!.carryKopecks);
  });

  it('an overspent day carries a negative amount', () => {
    let data = withFirstDay();
    data = addExpense(data, 4000, 'fun', '2026-09-26', at('20:00'));
    const [day] = historyDays(data, '2026-09-27', 0);
    expect(day).toMatchObject({ date: '2026-09-26', spentFromLimitKopecks: 4350, carryKopecks: 2854 - 4350 });
  });
});

describe('home list', () => {
  it('recent operations: expenses and incomes of the last week, newest first, without adjustments', () => {
    let data = withFirstDay();
    data = addExpense(data, 500, 'delivery', '2026-10-02', new Date('2026-10-02T13:40:00'));
    data = addExpense(data, 200, 'cafe', '2026-10-03', new Date('2026-10-03T08:05:00'));

    const week = recentOperations(data, '2026-10-03', 7);
    expect(week.map((e) => [e.transaction.date, e.fromLimitKopecks])).toEqual([
      ['2026-10-03', 200],
      ['2026-10-02', 500],
    ]);
    // 26 September is exactly 7 days before 3 October, so it is left out; the day after it is in.
    expect(recentOperations(data, '2026-10-02', 7).map((e) => e.transaction.category)).toEqual(['delivery', 'groceries', 'cafe']);
  });

  it('the time says the day for earlier operations', () => {
    const createdAt = new Date('2026-09-25T21:30:00').toISOString();
    expect(formatOperationTime('2026-09-26', new Date('2026-09-26T09:05:00').toISOString(), '2026-09-26')).toBe('09:05');
    expect(formatOperationTime('2026-09-25', createdAt, '2026-09-26')).toBe('вчера, 21:30');
    expect(formatOperationTime('2026-09-25', createdAt, '2026-09-28')).toBe('25 сентября, 21:30');
  });

  it('an expense added today for yesterday shows only its day, not when it was entered', () => {
    const enteredToday = new Date('2026-09-26T09:05:00').toISOString();
    expect(formatOperationTime('2026-09-25', enteredToday, '2026-09-26')).toBe('вчера');
    expect(formatOperationTime('2026-09-25', enteredToday, '2026-09-28')).toBe('25 сентября');
  });
});

describe('editing expenses', () => {
  it('a changed amount and category recount the limit; the time stays', () => {
    const data = withFirstDay();
    const cafe = data.transactions.find((t) => t.category === 'cafe')!;
    expect(previewExpense(data, '2026-09-26', 4000, 'fun', cafe.id).remainingTodayKopecks).toBe(-1146);

    const next = updateExpense(data, cafe.id, 4000, 'fun');
    const edited = next.transactions.find((t) => t.id === cafe.id)!;
    expect(edited).toMatchObject({ amountKopecks: 4000, category: 'fun', createdAt: cafe.createdAt, date: '2026-09-26' });
    expect(calculateBudget(next, '2026-09-26').remainingTodayKopecks).toBe(-1146);
  });

  it('an edited reserve expense previews its overflow in its own place', () => {
    const data = withFirstDay();
    const groceries = data.transactions.find((t) => t.category === 'groceries')!;
    expect(previewExpense(data, '2026-09-26', 16000, 'groceries', groceries.id)).toEqual({
      fromLimitKopecks: 1000,
      fromReserveKopecks: 15000,
      remainingTodayKopecks: 2854 - 350 - 1000,
      dailyLimitKopecks: 2854,
    });
  });

  it('deleting a goal purchase makes the goal active again', () => {
    const bought = buyGoal(configured(), 'headphones', 15000, '2026-09-26', at('12:00'));
    const purchase = bought.transactions.find((t) => t.goalId === 'headphones')!;
    const restored = deleteTransaction(bought, purchase.id);
    expect(restored.goals[0]!.status).toBe('active');
    expect(calculateBudget(restored, '2026-09-26').dailyLimitKopecks).toBe(2854);
  });
});

describe('«Как считается»', () => {
  it('shows the terms behind each sum of the binding checkpoint', () => {
    const r = calculateBudget(configured(), '2026-09-26');
    const b = r.breakdown;
    expect(b.payments.map((p) => p.date)).toEqual(['2026-10-01', '2026-10-03', '2026-10-04']);
    expect(b.reserveTerms).toEqual([
      { category: 'groceries', kopecks: 15000 },
      { category: 'transport', kopecks: 3000 },
    ]);
    expect(b.goalTerms).toEqual([{ goalId: 'headphones', kopecks: 2411 }]);
    expect(b.startOfDayKopecks + b.incomeKopecks - b.paymentsKopecks - b.reservesKopecks - b.goalsKopecks - b.cushionKopecks).toBe(
      b.freeKopecks,
    );
    expect(Math.floor(b.freeKopecks / b.days)).toBe(r.dailyLimitKopecks);
  });
});

describe('days in the limit (update 1)', () => {
  /** 26 Sep within (3,50 of 28,54, groceries from the reserve), 27 Sep over, 28–29 Sep within, 25 Sep before tracking. */
  function week(): AppData {
    let data = withFirstDay();
    data = recordDaySummary(data, '2026-09-27', 3104);
    data = addExpense(data, 4000, 'fun', '2026-09-27', new Date('2026-09-27T20:00:00'));
    data = recordDaySummary(data, '2026-09-28', 2604);
    data = recordDaySummary(data, '2026-09-29', 2604);
    return addExpense(data, 2604, 'cafe', '2026-09-29', new Date('2026-09-29T12:00:00'));
  }

  it('each day: within the recorded limit, over it, or no limit recorded', () => {
    expect(dayResults(week(), '2026-09-25', '2026-09-29')).toEqual([
      { date: '2026-09-25', status: 'none', dailyLimitKopecks: null, spentFromLimitKopecks: 0 },
      { date: '2026-09-26', status: 'in', dailyLimitKopecks: 2854, spentFromLimitKopecks: 350 },
      { date: '2026-09-27', status: 'over', dailyLimitKopecks: 3104, spentFromLimitKopecks: 4000 },
      { date: '2026-09-28', status: 'in', dailyLimitKopecks: 2604, spentFromLimitKopecks: 0 },
      { date: '2026-09-29', status: 'in', dailyLimitKopecks: 2604, spentFromLimitKopecks: 2604 }, // exactly the limit
    ]);
  });

  it('the streak counts days in a row before today and stops at an overspent day or a day without a limit', () => {
    const data = week();
    expect(limitStreak(data, '2026-09-30')).toBe(2);
    expect(limitStreak(data, '2026-09-28')).toBe(0);
    expect(limitStreak(data, '2026-09-27')).toBe(1);
    expect(limitStreak(data, '2026-10-02')).toBe(0);
  });
});

describe('«Вчера» in the expense sheet (update 2)', () => {
  // 27 September: yesterday (26th) the limit was 28,54 and 3,50 went from it; today's limit is 31,67.
  const TODAY = '2026-09-27';
  const YESTERDAY = '2026-09-26';
  const NOW = new Date('2026-09-27T09:00:00');
  const forgotten = (kopecks: number) => addExpense(withFirstDay(), kopecks, 'cafe', TODAY, NOW, null, YESTERDAY);

  it('adds the expense to yesterday, entered now', () => {
    const data = forgotten(1000);
    const added = data.transactions[data.transactions.length - 1]!;
    expect(added).toMatchObject({ type: 'expense', amountKopecks: 1000, category: 'cafe', date: YESTERDAY, createdAt: NOW.toISOString() });
    expect(data.settings.lastCategory).toBe('cafe');
    // Without the day it stays today's.
    expect(addExpense(withFirstDay(), 1000, 'cafe', TODAY, NOW).transactions.at(-1)!.date).toBe(TODAY);
  });

  it('today\'s limit drops by the amount spread over the days left: 31,67 → 30,42, as the preview said', () => {
    expect(calculateBudget(withFirstDay(), TODAY).dailyLimitKopecks).toBe(3167);
    const preview = previewExpense(withFirstDay(), TODAY, 1000, 'cafe', null, YESTERDAY);
    expect(preview).toEqual({ fromLimitKopecks: 1000, fromReserveKopecks: 0, remainingTodayKopecks: 3042, dailyLimitKopecks: 3042 });
    expect(calculateBudget(forgotten(1000), TODAY).dailyLimitKopecks).toBe(3042);
  });

  it('yesterday\'s result, the carry, the history, the week strip and the streak recount', () => {
    const before = withFirstDay();
    expect(calculateBudget(before, TODAY).carryFromYesterdayKopecks).toBe(2504);
    expect(limitStreak(before, TODAY)).toBe(1);

    const within = forgotten(1000);
    expect(calculateBudget(within, TODAY).carryFromYesterdayKopecks).toBe(1504);
    expect(historyDays(within, TODAY, 3042)[0]).toMatchObject({ date: YESTERDAY, spentFromLimitKopecks: 1350, carryKopecks: 1504 });
    expect(dayResults(within, YESTERDAY, YESTERDAY)[0]!.status).toBe('in');
    expect(limitStreak(within, TODAY)).toBe(1);

    // 30,00 more makes yesterday overspent: the carry is negative, the strip turns red, the streak breaks.
    const over = forgotten(3000);
    expect(calculateBudget(over, TODAY).carryFromYesterdayKopecks).toBe(2854 - 3350);
    expect(dayResults(over, YESTERDAY, YESTERDAY)[0]).toMatchObject({ status: 'over', spentFromLimitKopecks: 3350 });
    expect(limitStreak(over, TODAY)).toBe(0);
  });

  it('«Вчера осталось» offers the smaller leftover, and none once yesterday is overspent', () => {
    const context = (data: AppData) => ({
      data,
      budget: calculateBudget(data, TODAY),
      today: TODAY,
      feature: () => true,
      isBannerHidden: () => false,
      isCardDismissed: () => false,
    });
    expect(pickSavingsCard(context(withFirstDay()))).toMatchObject({ kind: 'leftover', carryKopecks: 2504 });
    expect(pickSavingsCard(context(forgotten(1000)))).toMatchObject({ kind: 'leftover', carryKopecks: 1504 });
    expect(pickSavingsCard(context(forgotten(3000)))).toBeNull();
  });

  it('a reserve expense for yesterday spends the reserve and leaves today\'s limit', () => {
    const preview = previewExpense(withFirstDay(), TODAY, 1000, 'groceries', null, YESTERDAY);
    expect(preview).toMatchObject({ fromLimitKopecks: 0, fromReserveKopecks: 1000, dailyLimitKopecks: 3167 });
  });
});

describe('«Куда уходят деньги» (update 2)', () => {
  // The first period starts on 26 September with the reserve «Продукты» 500,00 × 9/30 = 150,00.
  function spent(): AppData {
    let data = withFirstDay(); // 26th: cafe 3,50, groceries 18,40
    data = addExpense(data, 500, 'delivery', '2026-09-27', new Date('2026-09-27T13:40:00'));
    data = addExpense(data, 14000, 'groceries', '2026-09-27', new Date('2026-09-27T18:00:00')); // 131,60 left in the reserve
    data = addExpense(data, 1200, 'cafe', '2026-09-28', new Date('2026-09-28T08:00:00'));
    data = buyGoal(data, 'headphones', 15000, '2026-09-28', new Date('2026-09-28T12:00:00'));
    return data;
  }

  it('sums each category of the period, the biggest first, reserve and limit apart; payments and purchases stay out', () => {
    expect(categoryTotals(spent(), '2026-09-26', '2026-09-28')).toEqual([
      { category: 'groceries', totalKopecks: 15840, fromLimitKopecks: 840, fromReserveKopecks: 15000 },
      { category: 'cafe', totalKopecks: 1550, fromLimitKopecks: 1550, fromReserveKopecks: 0 },
      { category: 'delivery', totalKopecks: 500, fromLimitKopecks: 500, fromReserveKopecks: 0 },
    ]);
    // The totals add up to the period's category expenses.
    const expenses = spent().transactions.filter((t) => t.type === 'expense' && t.category !== null);
    const sum = categoryTotals(spent(), '2026-09-26', '2026-09-28').reduce((total, t) => total + t.totalKopecks, 0);
    expect(sum).toBe(expenses.reduce((total, t) => total + t.amountKopecks, 0));
  });

  it('counts only the days asked for; equal totals keep the order of the categories', () => {
    expect(categoryTotals(spent(), '2026-09-28', '2026-09-28').map((t) => t.category)).toEqual(['cafe']);
    let data = withFirstDay();
    data = addExpense(data, 350, 'fun', '2026-09-27', new Date('2026-09-27T10:00:00'));
    data = addExpense(data, 350, 'delivery', '2026-09-27', new Date('2026-09-27T11:00:00'));
    expect(categoryTotals(data, '2026-09-27', '2026-09-27').map((t) => t.category)).toEqual(['delivery', 'fun']);
    expect(categoryTotals(configured(), '2026-09-26', '2026-09-28')).toEqual([]);
  });

  it('a chosen category leaves only its expenses of the period, and days without them go', () => {
    const data = spent();
    const days = filterHistoryDays(historyDays(data, '2026-09-28', 2800), 'cafe', '2026-09-26');
    expect(days.map((d) => [d.date, d.entries.map((e) => e.transaction.amountKopecks)])).toEqual([
      ['2026-09-28', [1200]],
      ['2026-09-26', [350]],
    ]);
    expect(filterHistoryDays(historyDays(data, '2026-09-28', 2800), 'cafe', '2026-09-27').map((d) => d.date)).toEqual(['2026-09-28']);
  });
});
