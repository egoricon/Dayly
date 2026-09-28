import { calculateDay, type DayBudget } from './budget';
import { addDays, daysInclusive } from './dates';
import type { AppData, LocalDate, Transaction } from './types';

// Forecast of the daily limit for the calendar (update 1). Simulation, day by day from today:
// the student spends exactly the day's limit and the reserves evenly, planned incomes come
// on their day and payments are paid on theirs. Late incomes are not expected, as in the model.

export interface DayForecast {
  date: LocalDate;
  limitKopecks: number;
}

function simulated(date: LocalDate, index: number, fields: Partial<Transaction>): Transaction {
  return {
    id: `forecast:${date}:${index}`,
    type: 'expense',
    amountKopecks: 0,
    date,
    createdAt: '\uffff', // after every real operation of the day
    category: null, // not a reserve category: the whole amount is from the limit
    incomeSourceId: null,
    paymentId: null,
    goalId: null,
    plannedDate: null,
    note: null,
    ...fields,
  };
}

/** What the student does on the day of `day` in the simulation, as operations. */
function simulateDay(day: DayBudget): Transaction[] {
  const date = day.today;
  const operations: Partial<Transaction>[] = [];
  // The rest of the day's limit is spent; after an overspend nothing more.
  if (day.remainingTodayKopecks > 0) operations.push({ amountKopecks: day.remainingTodayKopecks });
  // Reserves go evenly over the days left, so the next period does not inherit them.
  const daysLeft = daysInclusive(date, day.period.end);
  for (const reserve of day.reserves) {
    if (reserve.remainingKopecks > 0) {
      operations.push({ amountKopecks: Math.ceil(reserve.remainingKopecks / daysLeft), category: reserve.category });
    }
  }
  for (const income of day.expectedIncomes) {
    if (income.date === date) {
      operations.push({ type: 'income', amountKopecks: income.amountKopecks, incomeSourceId: income.sourceId, plannedDate: income.date });
    }
  }
  // Payments due by this day are paid, overdue ones of the current period on the first day.
  for (const payment of day.unpaidPayments) {
    if (payment.date <= date) operations.push({ amountKopecks: payment.amountKopecks, paymentId: payment.sourceId, plannedDate: payment.date });
  }
  return operations.map((fields, index) => simulated(date, index, fields));
}

/**
 * Projected daily limit for every day from tomorrow to `until`. Pure: `data` is not changed,
 * and today's own limit stays calculateBudget's. Each day is one calculateDay on the growing simulation.
 */
export function forecastDailyLimits(data: AppData, today: LocalDate, until: LocalDate): DayForecast[] {
  const result: DayForecast[] = [];
  if (until <= today) return result;
  const transactions = [...data.transactions];
  const simulation: AppData = { ...data, transactions };
  for (let date = today; date <= until; date = addDays(date, 1)) {
    const day = calculateDay(simulation, date);
    if (date !== today) result.push({ date, limitKopecks: day.dailyLimitKopecks });
    transactions.push(...simulateDay(day));
  }
  return result;
}
