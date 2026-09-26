import { describe, expect, it } from 'vitest';
import { calculateBudget, previewExpense, splitExpenses } from './budget';
import type { AppData, Category, Goal, IncomeSource, MandatoryPayment, Transaction } from './types';

// Reference numbers: PROJECT_MAP.md section 2, examples А and Б.

let seq = 0;
function tx(fields: Partial<Transaction> & Pick<Transaction, 'type' | 'amountKopecks' | 'date'>): Transaction {
  seq += 1;
  return {
    id: `t${seq}`,
    createdAt: `${fields.date}T12:00:${String(seq % 60).padStart(2, '0')}.000Z`,
    category: null,
    incomeSourceId: null,
    paymentId: null,
    goalId: null,
    plannedDate: null,
    note: null,
    ...fields,
  };
}

const expense = (date: string, amountKopecks: number, category: Category) =>
  tx({ type: 'expense', amountKopecks, date, category });

function source(id: string, kind: IncomeSource['kind'], amountKopecks: number, dayOfMonth: number | null, startDate: string): IncomeSource {
  return { id, kind, name: id, amountKopecks, dayOfMonth, startDate, isActive: true };
}

function payment(id: string, amountKopecks: number, dayOfMonth: number, startDate: string): MandatoryPayment {
  return { id, name: id, amountKopecks, dayOfMonth, startDate, isActive: true };
}

function emptyData(trackingStartDate: string): AppData {
  return {
    schemaVersion: 1,
    settings: {
      onboardingCompleted: true,
      trackingStartDate,
      mainIncomeSourceId: null,
      reserves: { groceriesKopecks: 0, transportKopecks: 0 },
      cushion: { mode: 'fixed', amountKopecks: 0 },
      theme: 'auto',
      lastCategory: 'cafe',
    },
    incomeSources: [],
    payments: [],
    goals: [],
    transactions: [],
    daySummaries: [],
  };
}

const headphones: Goal = {
  id: 'headphones',
  name: 'Наушники',
  targetKopecks: 15000,
  initialSavedKopecks: 0,
  startDate: '2026-09-26',
  deadline: '2026-11-20',
  status: 'active',
};

/** Example А, first launch on 26 September: 586,00 on hand, scholarship on the 5th, three payments. */
function exampleA(options: { full?: boolean; balanceKopecks?: number } = {}): AppData {
  const start = '2026-09-26';
  const data = emptyData(start);
  data.settings.mainIncomeSourceId = 'scholarship';
  data.incomeSources = [
    source('scholarship', 'scholarship', 22000, 5, start),
    source('parents', 'parents', 30000, 10, start),
    source('salary', 'salary', 50000, 20, start),
  ];
  data.payments = [payment('dorm', 4500, 1, start), payment('internet', 3000, 3, start), payment('phone', 2000, 4, start)];
  data.transactions = [tx({ type: 'adjustment', amountKopecks: options.balanceKopecks ?? 58600, date: start })];
  if (options.full ?? true) {
    data.settings.reserves = { groceriesKopecks: 50000, transportKopecks: 10000 };
    data.settings.cushion = { mode: 'fixed', amountKopecks: 3000 };
    data.goals = [headphones];
  }
  return data;
}

/** Example Б: 5 October, scholarship arrived, 350,00 on hand, salary 500,00 on the 20th. */
function exampleB(): AppData {
  const start = '2026-10-05';
  const data = emptyData(start);
  data.settings.mainIncomeSourceId = 'scholarship';
  data.settings.reserves = { groceriesKopecks: 40000, transportKopecks: 4000 };
  data.settings.cushion = { mode: 'fixed', amountKopecks: 5000 };
  data.incomeSources = [source('scholarship', 'scholarship', 22000, 5, start), source('salary', 'salary', 50000, 20, start)];
  data.payments = [payment('dorm', 4500, 1, start), payment('internet', 3000, 3, start), payment('phone', 2000, 4, start)];
  data.transactions = [
    tx({ type: 'adjustment', amountKopecks: 13000, date: start }),
    tx({ type: 'income', amountKopecks: 22000, date: start, incomeSourceId: 'scholarship', plannedDate: start }),
  ];
  return data;
}

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
  it('only a balance: limit = balance ÷ days to the end of the calendar month', () => {
    const data = emptyData('2026-09-26');
    data.transactions = [tx({ type: 'adjustment', amountKopecks: 10000, date: '2026-09-26' })];
    const r = calculateBudget(data, '2026-09-26');
    expect(r.period).toEqual({ start: '2026-09-01', end: '2026-09-30' });
    expect(r.breakdown).toMatchObject({ days: 5, paymentsKopecks: 0, reservesKopecks: 0, goalsKopecks: 0, cushionKopecks: 0 });
    expect(r.dailyLimitKopecks).toBe(2000);
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
