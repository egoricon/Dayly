import { describe, expect, it } from 'vitest';
import { calculateBudget, goalSavedBy, previewExpense, splitExpenses } from './budget';
import { emptyData, exampleA, exampleB, exampleV, expense, headphones, headphonesPercent, oneOffPayment, source, tx, weeklyPayment } from './fixtures';

// Reference numbers: PROJECT_MAP.md section 2, examples А, Б and В.

describe('standard case (example А)', () => {
  it('first limit without reserves: (586,00 − 95,00) ÷ 9 = 54,55', () => {
    const r = calculateBudget(exampleA({ full: false }), '2026-09-26');
    expect(r.period).toEqual({ start: '2026-09-05', end: '2026-10-04' });
    expect(r.dailyLimitKopecks).toBe(5455);
  });

  it('with reserves, goal and cushion the limit is 28,54', () => {
    const r = calculateBudget(exampleA(), '2026-09-26');
    expect(r.status).toBe('ok');
    expect(r.dailyLimitKopecks).toBe(2854);
    expect(r.breakdown).toMatchObject({
      date: '2026-10-05',
      kind: 'periodEnd',
      incomeSourceId: 'scholarship',
      days: 9,
      startOfDayKopecks: 58600,
      incomeKopecks: 0,
      paymentsKopecks: 9500,
      reservesKopecks: 18000, // 150,00 + 30,00 for 9 of 30 days
      goalsKopecks: 2411,
      cushionKopecks: 3000,
      freeKopecks: 25689,
    });
    expect(r.reserves.map((x) => x.budgetKopecks)).toEqual([15000, 3000]);
  });

  it('cafe 3,50 and delivery 5,00: 20,04 left, balance 577,50, tomorrow 31,04', () => {
    const data = exampleA();
    data.transactions.push(expense('2026-09-26', 350, 'cafe'), expense('2026-09-26', 500, 'delivery'));
    const r = calculateBudget(data, '2026-09-26');
    expect(r.dailyLimitKopecks).toBe(2854);
    expect(r.spentTodayKopecks).toBe(850);
    expect(r.remainingTodayKopecks).toBe(2004);
    expect(r.balanceKopecks).toBe(57750);
    expect(r.tomorrowLimitKopecks).toBe(3104);
  });
});

describe('reserves', () => {
  it('groceries 18,40 come from the reserve and do not change the limit', () => {
    const data = exampleA();
    data.transactions.push(
      expense('2026-09-26', 350, 'cafe'),
      expense('2026-09-26', 500, 'delivery'),
      expense('2026-09-26', 1840, 'groceries'),
    );
    const r = calculateBudget(data, '2026-09-26');
    expect(r.dailyLimitKopecks).toBe(2854);
    expect(r.remainingTodayKopecks).toBe(2004);
    expect(r.reserves[0]).toMatchObject({ category: 'groceries', usedKopecks: 1840, remainingKopecks: 13160 });
  });

  it('groceries 160,00 with a 150,00 reserve: 10,00 go to the limit, 18,54 left, tomorrow 30,86', () => {
    const data = exampleA();
    data.transactions.push(expense('2026-09-26', 16000, 'groceries'));
    const r = calculateBudget(data, '2026-09-26');
    expect(r.dailyLimitKopecks).toBe(2854);
    expect(r.spentTodayKopecks).toBe(1000);
    expect(r.remainingTodayKopecks).toBe(1854);
    expect(r.tomorrowLimitKopecks).toBe(3086);
    expect(splitExpenses(data, '2026-09-26')).toEqual([
      { transactionId: expect.any(String), fromLimitKopecks: 1000, fromReserveKopecks: 15000 },
    ]);
  });

  it('preview shows the reserve overflow before the expense is added', () => {
    const data = exampleA();
    expect(previewExpense(data, '2026-09-26', 1840, 'groceries')).toEqual({
      fromLimitKopecks: 0,
      fromReserveKopecks: 1840,
      remainingTodayKopecks: 2854,
    });
    expect(previewExpense(data, '2026-09-26', 16000, 'groceries')).toEqual({
      fromLimitKopecks: 1000,
      fromReserveKopecks: 15000,
      remainingTodayKopecks: 1854,
    });
    expect(previewExpense(data, '2026-09-26', 4000, 'fun').remainingTodayKopecks).toBe(-1146);
  });
});

describe('last day of the period', () => {
  it('4 October with nothing spent since 26 September: 256,89', () => {
    const r = calculateBudget(exampleA(), '2026-10-04');
    expect(r.period.end).toBe('2026-10-04');
    expect(r.breakdown.days).toBe(1);
    expect(r.dailyLimitKopecks).toBe(25689);
  });

  it('tomorrow is a new period with the scholarship expected on its first day', () => {
    const data = exampleA();
    const lastDay = calculateBudget(data, '2026-10-04');
    const firstDay = calculateBudget(data, '2026-10-05');
    expect(firstDay.period).toEqual({ start: '2026-10-05', end: '2026-11-04' });
    expect(firstDay.expectedIncomes.map((i) => i.sourceId)).toEqual(['scholarship', 'parents', 'salary']);
    // Unpaid October payments of the previous period are not carried over.
    expect(firstDay.unpaidPayments.map((p) => p.date)).toEqual(['2026-11-01', '2026-11-03', '2026-11-04']);
    // (586,00 + 1 020,00 − 95,00 − 600,00 − 107,15 − 30,00) ÷ 31
    expect(firstDay.dailyLimitKopecks).toBe(2496);
    expect(lastDay.tomorrowLimitKopecks).toBe(firstDay.dailyLimitKopecks);
  });
});

describe('income in the middle of the period', () => {
  it('example Б: the salary checkpoint on 20 October limits to 5,80', () => {
    const r = calculateBudget(exampleB(), '2026-10-05');
    expect(r.period).toEqual({ start: '2026-10-05', end: '2026-11-04' });
    expect(r.checkpoints.map((c) => [c.date, c.days, c.reservesKopecks, c.freeKopecks, c.limitKopecks])).toEqual([
      ['2026-10-20', 15, 21291, 8709, 580],
      ['2026-11-05', 31, 44000, 26500, 854],
    ]);
    expect(r.dailyLimitKopecks).toBe(580);
    expect(r.bindingCheckpoint).toEqual({ date: '2026-10-20', incomeSourceId: 'salary' });
  });

  it('confirming a planned income on its day does not change the limit', () => {
    const data = exampleB();
    const expected = calculateBudget(data, '2026-10-20');
    data.transactions.push(
      tx({ type: 'income', amountKopecks: 50000, date: '2026-10-20', incomeSourceId: 'salary', plannedDate: '2026-10-20' }),
    );
    const confirmed = calculateBudget(data, '2026-10-20');
    expect(confirmed.dailyLimitKopecks).toBe(expected.dailyLimitKopecks);
    expect(confirmed.tomorrowLimitKopecks).toBe(expected.tomorrowLimitKopecks);
    expect(expected.balanceKopecks).toBe(35000);
    expect(confirmed.balanceKopecks).toBe(85000);
  });

  it('an unplanned income raises the limit at once', () => {
    const data = exampleB();
    data.transactions.push(tx({ type: 'income', amountKopecks: 10000, date: '2026-10-05' }));
    const r = calculateBudget(data, '2026-10-05');
    // 20 Oct: 187,09 ÷ 15 = 12,47; 5 Nov: 365,00 ÷ 31 = 11,77
    expect(r.dailyLimitKopecks).toBe(1177);
    expect(r.bindingCheckpoint.date).toBe('2026-11-05');
  });

  it('a late planned income is not counted until confirmed', () => {
    const data = exampleB();
    const late = calculateBudget(data, '2026-10-21');
    expect(late.expectedIncomes).toEqual([]);
    expect(late.status).toBe('deficit');
    expect(late.shortfall).toEqual({ amountKopecks: 23500, until: '2026-11-05' });

    data.transactions.push(
      tx({ type: 'income', amountKopecks: 50000, date: '2026-10-21', incomeSourceId: 'salary', plannedDate: '2026-10-20' }),
    );
    const confirmed = calculateBudget(data, '2026-10-21');
    expect(confirmed.status).toBe('ok');
    expect(confirmed.dailyLimitKopecks).toBe(1766); // 265,00 ÷ 15
  });
});

describe('expense bigger than the daily limit', () => {
  it('cafe, delivery and fun 48,50 in total: overspent 19,96, tomorrow 26,04', () => {
    const data = exampleA();
    data.transactions.push(
      expense('2026-09-26', 350, 'cafe'),
      expense('2026-09-26', 500, 'delivery'),
      expense('2026-09-26', 4000, 'fun'),
    );
    const r = calculateBudget(data, '2026-09-26');
    expect(r.dailyLimitKopecks).toBe(2854);
    expect(r.spentTodayKopecks).toBe(4850);
    expect(r.remainingTodayKopecks).toBe(-1996);
    expect(r.tomorrowLimitKopecks).toBe(2604);
  });
});

describe('negative free money', () => {
  it('250,00 on hand: limit 0, short of 79,11 until 5 October', () => {
    const r = calculateBudget(exampleA({ balanceKopecks: 25000 }), '2026-09-26');
    expect(r.status).toBe('deficit');
    expect(r.dailyLimitKopecks).toBe(0);
    expect(r.remainingTodayKopecks).toBe(0);
    expect(r.shortfall).toEqual({ amountKopecks: 7911, until: '2026-10-05' });
  });
});

describe('zero categories', () => {
  it('only a balance: limit = balance ÷ days of a month from the start of tracking', () => {
    const data = emptyData('2026-09-26');
    data.transactions = [tx({ type: 'adjustment', amountKopecks: 10000, date: '2026-09-26' })];
    const r = calculateBudget(data, '2026-09-26');
    expect(r.period).toEqual({ start: '2026-09-26', end: '2026-10-25' });
    expect(r.breakdown).toMatchObject({ days: 30, paymentsKopecks: 0, reservesKopecks: 0, goalsKopecks: 0, cushionKopecks: 0 });
    expect(r.dailyLimitKopecks).toBe(333);
    // Later periods keep the day: from the 26th to the 25th.
    expect(calculateBudget(data, '2026-11-02').period).toEqual({ start: '2026-10-26', end: '2026-11-25' });
    expect(r.reserves.every((x) => x.budgetKopecks === 0)).toBe(true);
  });

  it('empty data gives a zero limit without errors', () => {
    const r = calculateBudget(emptyData('2026-09-26'), '2026-09-26');
    expect(r.dailyLimitKopecks).toBe(0);
    expect(r.status).toBe('ok');
    expect(r.carryFromYesterdayKopecks).toBeNull();
  });
});

describe('payments, goals and cushion', () => {
  it('a paid payment is not deducted twice', () => {
    const data = exampleA();
    data.transactions.push(
      tx({ type: 'expense', amountKopecks: 4500, date: '2026-09-26', paymentId: 'dorm', plannedDate: '2026-10-01' }),
    );
    const r = calculateBudget(data, '2026-09-26');
    expect(r.balanceKopecks).toBe(54100);
    expect(r.breakdown.paymentsKopecks).toBe(5000);
    expect(r.spentTodayKopecks).toBe(0);
    expect(r.dailyLimitKopecks).toBe(2854);
  });

  it('an overdue unpaid payment of the current period is still deducted', () => {
    const r = calculateBudget(exampleA(), '2026-10-02');
    expect(r.unpaidPayments.map((p) => p.date)).toEqual(['2026-10-01', '2026-10-03', '2026-10-04']);
  });

  it('the whole saved goal amount is deducted, and a purchase frees it', () => {
    const data = exampleA();
    expect(calculateBudget(data, '2026-10-04').breakdown.goalsKopecks).toBe(2411);
    data.goals = [{ ...headphones, status: 'done' }];
    data.transactions.push(tx({ type: 'expense', amountKopecks: 2411, date: '2026-09-26', goalId: 'headphones' }));
    const r = calculateBudget(data, '2026-09-26');
    expect(r.breakdown.goalsKopecks).toBe(0);
    expect(r.spentTodayKopecks).toBe(0);
    expect(r.dailyLimitKopecks).toBe(2854);
  });

  it('percent cushion: saved share of incomes plus the share of expected incomes', () => {
    const data = exampleB();
    data.settings.cushion = { mode: 'percent', percent: 3, baseKopecks: 5000, sinceDate: '2026-10-05' };
    const r = calculateBudget(data, '2026-10-05');
    // 50,00 + 3% of 220,00; at 5 Nov plus 3% of the expected 500,00
    expect(r.checkpoints.map((c) => c.cushionKopecks)).toEqual([5660, 7160]);
  });
});

describe('periods and carry-over', () => {
  it('day 31 falls back to the last day of a short month', () => {
    const data = emptyData('2026-01-01');
    data.incomeSources = [source('salary', 'salary', 50000, 31, '2026-01-01')];
    data.settings.mainIncomeSourceId = 'salary';
    expect(calculateBudget(data, '2026-02-15').period).toEqual({ start: '2026-01-31', end: '2026-02-27' });
    expect(calculateBudget(data, '2026-02-28').period).toEqual({ start: '2026-02-28', end: '2026-03-30' });
  });

  it('first partial period gets a proportional reserve', () => {
    const r = calculateBudget(exampleA(), '2026-09-30');
    expect(r.reserves.map((x) => x.budgetKopecks)).toEqual([15000, 3000]);
    const next = calculateBudget(exampleA(), '2026-10-05');
    expect(next.reserves.map((x) => x.budgetKopecks)).toEqual([50000, 10000]);
  });

  it('carry from yesterday = yesterday limit − spent from the limit yesterday', () => {
    const data = exampleA();
    data.transactions.push(expense('2026-09-26', 350, 'cafe'), expense('2026-09-26', 1840, 'groceries'));
    data.daySummaries = [{ date: '2026-09-26', dailyLimitKopecks: 2854 }];
    expect(calculateBudget(data, '2026-09-27').carryFromYesterdayKopecks).toBe(2504);
    expect(calculateBudget(data, '2026-09-28').carryFromYesterdayKopecks).toBeNull();
  });
});

describe('weekly income', () => {
  // 26 September 2026 is a Saturday.
  it('a weekly main income makes the period a week: Friday to Thursday', () => {
    const data = emptyData('2026-09-26');
    data.incomeSources = [source('job', 'salary', 5000, null, '2026-09-26', 5)];
    data.settings.mainIncomeSourceId = 'job';
    data.transactions = [tx({ type: 'adjustment', amountKopecks: 10000, date: '2026-09-26' })];
    const r = calculateBudget(data, '2026-09-26');
    expect(r.period).toEqual({ start: '2026-09-25', end: '2026-10-01' });
    expect(r.checkpoints.map((c) => c.date)).toEqual(['2026-10-02']);
    expect(r.dailyLimitKopecks).toBe(1666); // 100,00 ÷ 6 days, rounded down
  });

  it('a weekly income that is not the main one is expected every week of the period', () => {
    // Tracking since 1 September and no main income: the period is September.
    const data = emptyData('2026-09-01');
    data.incomeSources = [source('tips', 'other', 5000, null, '2026-09-26', 3)];
    data.transactions = [tx({ type: 'adjustment', amountKopecks: 10000, date: '2026-09-26' })];
    const r = calculateBudget(data, '2026-09-26');
    expect(r.period).toEqual({ start: '2026-09-01', end: '2026-09-30' });
    // Wednesday 30 September: 100,00 ÷ 4 = 25,00; to 1 October: 150,00 ÷ 5 = 30,00.
    expect(r.checkpoints.map((c) => [c.date, c.limitKopecks])).toEqual([
      ['2026-09-30', 2500],
      ['2026-10-01', 3000],
    ]);
    expect(r.dailyLimitKopecks).toBe(2500);
  });
});

describe('weekly and one-off payments (update 1)', () => {
  // Example А on 26 September: free 256,89 over 9 days, limit 28,54.
  it('a weekly payment is due on every weekday of the period: Sundays 27 September and 4 October', () => {
    const data = exampleA();
    data.payments.push(weeklyPayment('gym', 500, 7, '2026-09-26'));
    const r = calculateBudget(data, '2026-09-26');
    expect(r.unpaidPayments.filter((p) => p.sourceId === 'gym').map((p) => p.date)).toEqual(['2026-09-27', '2026-10-04']);
    expect(r.breakdown.paymentsKopecks).toBe(10500);
    expect(r.dailyLimitKopecks).toBe(2743); // (256,89 − 10,00) ÷ 9

    // Paying one Sunday closes only that occurrence.
    data.transactions.push(tx({ type: 'expense', amountKopecks: 500, date: '2026-09-27', paymentId: 'gym', plannedDate: '2026-09-27' }));
    const paid = calculateBudget(data, '2026-09-27');
    expect(paid.unpaidPayments.filter((p) => p.sourceId === 'gym').map((p) => p.date)).toEqual(['2026-10-04']);
  });

  it('a one-off payment counts only in the period of its date', () => {
    const data = exampleA();
    data.payments.push(oneOffPayment('concert', 2500, '2026-10-02', '2026-09-26'), oneOffPayment('later', 9900, '2026-10-10', '2026-09-26'));
    const r = calculateBudget(data, '2026-09-26');
    expect(r.unpaidPayments.map((p) => [p.sourceId, p.date])).toEqual([
      ['dorm', '2026-10-01'],
      ['concert', '2026-10-02'],
      ['internet', '2026-10-03'],
      ['phone', '2026-10-04'],
    ]);
    expect(r.dailyLimitKopecks).toBe(2576); // (256,89 − 25,00) ÷ 9
    expect(calculateBudget(data, '2026-10-05').unpaidPayments.map((p) => p.sourceId)).toEqual(['later', 'dorm', 'internet', 'phone']);
  });
});

describe('one-off incomes (update 1)', () => {
  it('a one-off income is expected on its day and adds a checkpoint', () => {
    const data = exampleA();
    data.incomeSources.push(source('gift', 'other', 5000, null, '2026-09-26', null, '2026-09-30'));
    const r = calculateBudget(data, '2026-09-26');
    expect(r.expectedIncomes).toEqual([{ sourceId: 'gift', date: '2026-09-30', amountKopecks: 5000 }]);
    // 30 Sep: 465,27 ÷ 4 = 116,31; 5 Oct: (256,89 + 50,00) ÷ 9 = 34,09
    expect(r.checkpoints.map((c) => [c.date, c.freeKopecks, c.limitKopecks])).toEqual([
      ['2026-09-30', 46527, 11631],
      ['2026-10-05', 30689, 3409],
    ]);
    expect(r.dailyLimitKopecks).toBe(3409);
    // After its day it is late, like any planned income.
    expect(calculateBudget(data, '2026-10-01').expectedIncomes).toEqual([]);
  });

  it('a one-off main income cannot define the period: a month from the start of tracking', () => {
    const data = exampleA();
    data.incomeSources[0] = source('scholarship', 'scholarship', 22000, null, '2026-09-26', null, '2026-10-05');
    expect(calculateBudget(data, '2026-09-26').period).toEqual({ start: '2026-09-26', end: '2026-10-25' });
  });
});

describe('percent goals (example В)', () => {
  it('saved = 15 % of every income since the start, never above the target', () => {
    const data = exampleV();
    expect(goalSavedBy(data, headphonesPercent, '2026-10-04')).toBe(0);
    expect(goalSavedBy(data, headphonesPercent, '2026-10-05')).toBe(3300); // 15 % of 220,00
    data.transactions.push(tx({ type: 'income', amountKopecks: 200000, date: '2026-10-07' }));
    expect(goalSavedBy(data, headphonesPercent, '2026-10-07')).toBe(15000);
  });

  it('the checkpoint adds 15 % of the expected incomes before it: limit 2,13 until 20 October', () => {
    const r = calculateBudget(exampleV(), '2026-10-05');
    expect(r.checkpoints.map((c) => [c.date, c.goalsKopecks, c.cushionKopecks, c.freeKopecks, c.limitKopecks])).toEqual([
      ['2026-10-20', 3300, 7200, 3209, 213],
      ['2026-11-05', 10800, 12200, 8500, 274],
    ]);
    expect(r.dailyLimitKopecks).toBe(213);
    expect(r.bindingCheckpoint).toEqual({ date: '2026-10-20', incomeSourceId: 'salary' });
  });

  it('confirming the salary on its day does not change the limit', () => {
    const data = exampleV();
    const expected = calculateBudget(data, '2026-10-20');
    data.transactions.push(
      tx({ type: 'income', amountKopecks: 50000, date: '2026-10-20', incomeSourceId: 'salary', plannedDate: '2026-10-20' }),
    );
    const confirmed = calculateBudget(data, '2026-10-20');
    expect(goalSavedBy(data, headphonesPercent, '2026-10-20')).toBe(10800); // 33,00 + 75,00
    expect(confirmed.dailyLimitKopecks).toBe(expected.dailyLimitKopecks);
    expect(confirmed.breakdown.goalsKopecks).toBe(expected.breakdown.goalsKopecks);
  });

  it('a deadline goal keeps its even saving', () => {
    expect(goalSavedBy(exampleA(), headphones, '2026-10-04')).toBe(2411);
  });
});
