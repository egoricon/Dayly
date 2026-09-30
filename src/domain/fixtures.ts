import { defaultCategories } from './categories';
import type { AppData, Category, Cushion, Goal, IncomeSource, MandatoryPayment, SavingsMove, Transaction } from './types';

// Test data for the domain tests: examples А, Б, В and Г of PROJECT_MAP.md section 2. Not used by the app.

let seq = 0;
export function tx(fields: Partial<Transaction> & Pick<Transaction, 'type' | 'amountKopecks' | 'date'>): Transaction {
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

export const expense = (date: string, amountKopecks: number, category: Category) => tx({ type: 'expense', amountKopecks, date, category });

export function source(
  id: string,
  kind: IncomeSource['kind'],
  amountKopecks: number,
  dayOfMonth: number | null,
  startDate: string,
  weekday: number | null = null,
  date: string | null = null,
): IncomeSource {
  return { id, kind, name: id, amountKopecks, dayOfMonth, weekday, date, startDate, isActive: true };
}

/** A monthly payment. */
export function payment(id: string, amountKopecks: number, dayOfMonth: number, startDate: string): MandatoryPayment {
  return { id, name: id, amountKopecks, dayOfMonth, weekday: null, date: null, startDate, isActive: true };
}

export function weeklyPayment(id: string, amountKopecks: number, weekday: number, startDate: string): MandatoryPayment {
  return { id, name: id, amountKopecks, dayOfMonth: null, weekday, date: null, startDate, isActive: true };
}

export function oneOffPayment(id: string, amountKopecks: number, date: string, startDate: string): MandatoryPayment {
  return { id, name: id, amountKopecks, dayOfMonth: null, weekday: null, date, startDate, isActive: true };
}

/** A cushion of a fixed sum, without a target. */
export function fixedCushion(amountKopecks: number, targetKopecks: number | null = null): Cushion {
  return { mode: 'fixed', amountKopecks, targetKopecks };
}

/** A cushion that takes `percent` of every income since `sinceDate` on top of `baseKopecks`, without a target. */
export function percentCushion(percent: number, baseKopecks: number, sinceDate: string, targetKopecks: number | null = null): Cushion {
  return { mode: 'percent', percent, baseKopecks, sinceDate, targetKopecks };
}

let moveSeq = 0;
/** A savings move; into the cushion unless a goal is given, by hand unless a source is given. */
export function move(fields: Partial<SavingsMove> & Pick<SavingsMove, 'amountKopecks' | 'date'>): SavingsMove {
  moveSeq += 1;
  return {
    id: `m${moveSeq}`,
    goalId: null,
    createdAt: `${fields.date}T15:00:${String(moveSeq % 60).padStart(2, '0')}.000Z`,
    source: fields.amountKopecks < 0 ? 'withdraw' : 'manual',
    transactionId: null,
    ...fields,
  };
}

export function emptyData(trackingStartDate: string): AppData {
  return {
    schemaVersion: 6,
    settings: {
      onboardingCompleted: true,
      trackingStartDate,
      mainIncomeSourceId: null,
      categories: defaultCategories(),
      cushion: fixedCushion(0),
      theme: 'auto',
      lastCategory: 'cafe',
      favorites: [],
      targetDailyLimitKopecks: null,
      roundUp: null,
    },
    incomeSources: [],
    payments: [],
    goals: [],
    transactions: [],
    daySummaries: [],
    savingsMoves: [],
  };
}

export const headphones: Goal = {
  id: 'headphones',
  name: 'Наушники',
  targetKopecks: 15000,
  initialSavedKopecks: 0,
  startDate: '2026-09-26',
  deadline: '2026-11-20',
  percent: null,
  schedule: null,
  status: 'active',
};

/** Example А, first launch on 26 September: 586,00 on hand, scholarship on the 5th, three payments. */
export function exampleA(options: { full?: boolean; balanceKopecks?: number } = {}): AppData {
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
    data.settings.categories = defaultCategories(50000, 10000);
    data.settings.cushion = fixedCushion(3000);
    data.goals = [headphones];
  }
  return data;
}

/** Example Б: 5 October, scholarship arrived, 350,00 on hand, salary 500,00 on the 20th. */
export function exampleB(): AppData {
  const start = '2026-10-05';
  const data = emptyData(start);
  data.settings.mainIncomeSourceId = 'scholarship';
  data.settings.categories = defaultCategories(40000, 4000);
  data.settings.cushion = fixedCushion(5000);
  data.incomeSources = [source('scholarship', 'scholarship', 22000, 5, start), source('salary', 'salary', 50000, 20, start)];
  data.payments = [payment('dorm', 4500, 1, start), payment('internet', 3000, 3, start), payment('phone', 2000, 4, start)];
  data.transactions = [
    tx({ type: 'adjustment', amountKopecks: 13000, date: start }),
    tx({ type: 'income', amountKopecks: 22000, date: start, incomeSourceId: 'scholarship', plannedDate: start }),
  ];
  return data;
}

/** «Наушники» 150,00 as 15 % of every income, from 5 October. */
export const headphonesPercent: Goal = {
  id: 'headphones',
  name: 'Наушники',
  targetKopecks: 15000,
  initialSavedKopecks: 0,
  startDate: '2026-10-05',
  deadline: null,
  percent: 15,
  schedule: null,
  status: 'active',
};

/**
 * Example В (update 1): example Б where the cushion is 10 % of every income on top of the 50,00
 * already there, and «Наушники» take 15 % of every income: 10 % cushion · 15 % headphones · 75 % for life.
 */
export function exampleV(): AppData {
  const data = exampleB();
  data.settings.cushion = percentCushion(10, 5000, '2026-10-05');
  data.goals = [headphonesPercent];
  return data;
}

/** «Велосипед» 190,00 as 15 % of every income, 40,00 already saved, from 26 September. */
export const bike: Goal = {
  id: 'bike',
  name: 'Велосипед',
  targetKopecks: 19000,
  initialSavedKopecks: 4000,
  startDate: '2026-09-26',
  deadline: null,
  percent: 15,
  schedule: null,
  status: 'active',
};

/** «Поездка» 100,00 by 20,00 every Monday, from 26 September (a Saturday): the first on 28 September. */
export const trip: Goal = {
  id: 'trip',
  name: 'Поездка',
  targetKopecks: 10000,
  initialSavedKopecks: 0,
  startDate: '2026-09-26',
  deadline: null,
  percent: null,
  schedule: { amountKopecks: 2000, dayOfMonth: null, weekday: 1 },
  status: 'active',
};

/**
 * Example Г (update 2): example А with two more jars, «Велосипед» by percent and «Поездка» on a schedule,
 * and expenses rounded up to 1 BYN into the cushion.
 */
export function exampleG(): AppData {
  const data = exampleA();
  data.goals = [headphones, bike, trip];
  data.settings.roundUp = { goalId: null };
  return data;
}
