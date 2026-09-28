import { describe, expect, it } from 'vitest';
import { calculateBudget } from './budget';
import { addDays } from './dates';
import { emptyData, exampleA, expense, source, tx } from './fixtures';
import { forecastDailyLimits } from './forecast';

// Forecast of the daily limit (update 1), example А from 26 September.

describe('forecast of the daily limit', () => {
  it('spending exactly the limit keeps it until the period ends; the new period starts from what is left', () => {
    const forecast = forecastDailyLimits(exampleA(), '2026-09-26', '2026-10-06');
    expect(forecast.map((d) => d.date)).toEqual([
      '2026-09-27', '2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01',
      '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06',
    ]);
    // 256,89 = 9 × 28,54 + 0,03: the 3 kopecks left by rounding down come back in the last three days.
    // On 5 October 54,11 are left (the headphones and the cushion), and the new period's incomes come.
    expect(forecast.map((d) => d.limitKopecks)).toEqual([2854, 2854, 2854, 2854, 2854, 2855, 2855, 2855, 780, 780]);
  });

  it('after an overspend today nothing more is spent: tomorrow is 26,04, as in example А', () => {
    const data = exampleA();
    data.transactions.push(expense('2026-09-26', 350, 'cafe'), expense('2026-09-26', 500, 'delivery'), expense('2026-09-26', 4000, 'fun'));
    expect(forecastDailyLimits(data, '2026-09-26', '2026-09-27')).toEqual([{ date: '2026-09-27', limitKopecks: 2604 }]);
    expect(calculateBudget(data, '2026-09-26').tomorrowLimitKopecks).toBe(2604);
  });

  it('a weekly main income: the next week lives on what comes on Friday; the data is not changed', () => {
    // 100,00 on hand, 50,00 every Friday: the week runs Friday to Thursday.
    const data = emptyData('2026-09-26');
    data.incomeSources = [source('job', 'salary', 5000, null, '2026-09-26', 5)];
    data.settings.mainIncomeSourceId = 'job';
    data.transactions = [tx({ type: 'adjustment', amountKopecks: 10000, date: '2026-09-26' })];
    const before = JSON.stringify(data);
    const forecast = forecastDailyLimits(data, '2026-09-26', '2026-10-03');
    expect(JSON.stringify(data)).toBe(before);
    // Today 100,00 ÷ 6 = 16,66, the 4 kopecks left come back later. From Friday 50,00 ÷ 7 = 7,14.
    expect(calculateBudget(data, '2026-09-26').dailyLimitKopecks).toBe(1666);
    expect(forecast.map((d) => [d.date, d.limitKopecks])).toEqual([
      ['2026-09-27', 1666],
      ['2026-09-28', 1667],
      ['2026-09-29', 1667],
      ['2026-09-30', 1667],
      ['2026-10-01', 1667],
      ['2026-10-02', 714],
      ['2026-10-03', 714],
    ]);
  });

  it('nothing to forecast up to today', () => {
    expect(forecastDailyLimits(exampleA(), '2026-09-26', '2026-09-26')).toEqual([]);
  });

  it('45 days over a year of operations stay fast', () => {
    const data = exampleA();
    data.settings.trackingStartDate = '2025-09-26';
    for (let date = '2025-09-26'; date < '2026-09-26'; date = addDays(date, 1)) {
      for (let i = 0; i < 10; i++) data.transactions.push(expense(date, 100, i % 2 === 0 ? 'cafe' : 'groceries'));
    }
    const started = performance.now();
    expect(forecastDailyLimits(data, '2026-09-26', addDays('2026-09-26', 45))).toHaveLength(45);
    expect(performance.now() - started).toBeLessThan(2000);
  });
});
