import { defaultCategories } from './categories';
import type { AppData, Category, Goal, IncomeSource, MandatoryPayment, Transaction } from './types';

// Test data for the domain tests: examples А, Б and В of PROJECT_MAP.md section 2. Not used by the app.

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

export function emptyData(trackingStartDate: string): AppData {
  return {
    schemaVersion: 5,
    settings: {
      onboardingCompleted: true,
      trackingStartDate,
      mainIncomeSourceId: null,
      categories: defaultCategories(),
      cushion: { mode: 'fixed', amountKopecks: 0 },
      theme: 'auto',
      lastCategory: 'cafe',
      favorites: [],
      targetDailyLimitKopecks: null,
    },
    incomeSources: [],
    payments: [],
    goals: [],
    transactions: [],
    daySummaries: [],
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
    data.settings.cushion = { mode: 'fixed', amountKopecks: 3000 };
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
  data.settings.cushion = { mode: 'fixed', amountKopecks: 5000 };
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
  status: 'active',
};

/**
 * Example В (update 1): example Б where the cushion is 10 % of every income on top of the 50,00
 * already there, and «Наушники» take 15 % of every income: 10 % cushion · 15 % headphones · 75 % for life.
 */
export function exampleV(): AppData {
  const data = exampleB();
  data.settings.cushion = { mode: 'percent', percent: 10, baseKopecks: 5000, sinceDate: '2026-10-05' };
  data.goals = [headphonesPercent];
  return data;
}
