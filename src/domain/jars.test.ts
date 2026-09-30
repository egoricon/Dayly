import { describe, expect, it } from 'vitest';
import { calculateBudget, calculateDay, cushionSavedBy, goalSavedBy } from './budget';
import { addDays, daysInclusive } from './dates';
import { bike, exampleA, exampleG, exampleV, headphones, headphonesPercent, move, percentCushion, trip, tx } from './fixtures';
import { savingsHistory } from './jarHistory';
import { depositEffect, fillForecast, jarsOf, milestone, piggyFill, putInMax, roundUpRest, takeOutMax, withdrawEffect } from './jars';
import { limitLevers } from './levers';
import type { AppData, Goal } from './types';

// Update 2: saved amounts with moves, goals on a schedule and by hand, the jars of «Копилка»,
// the piggy, fill forecasts and the history. Examples А, В and Г of PROJECT_MAP.md section 2.

const saved = (data: AppData, goal: Goal, date: string) => goalSavedBy(data, goal, date);

describe('a deadline goal with moves', () => {
  it('without moves it is the even plan of update 1', () => {
    const data = exampleA();
    for (let date = '2026-09-20'; date <= '2026-11-25'; date = addDays(date, 1)) {
      const elapsed = Math.min(Math.max(daysInclusive('2026-09-26', date), 0), 56);
      expect(saved(data, headphones, date)).toBe(Math.ceil((15000 * elapsed) / 56));
    }
  });

  it('every day with moves starts the plan afresh; the days before keep their values', () => {
    const data = exampleA();
    data.savingsMoves = [
      move({ goalId: 'headphones', amountKopecks: 1000, date: '2026-09-30' }),
      move({ goalId: 'headphones', amountKopecks: -500, date: '2026-10-02' }),
    ];
    // By 29 September 10,72 as planned. On the 30th 20,72 is the base and 129,28 is spread over 52 days;
    // by 1 October that is 25,70. On the 2nd 20,70 is the base and 129,30 is spread over 50 days:
    // 2,59 that day, 20,70 + 126,72 by 19 November.
    expect(['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-11-19', '2026-11-20'].map((d) => saved(data, headphones, d))).toEqual([
      1072, 2321, 2570, 2329, 14742, 15000,
    ]);
  });

  it('a move before the start is in the base; after the deadline the whole target is due', () => {
    const data = exampleA();
    data.savingsMoves = [move({ goalId: 'headphones', amountKopecks: 1000, date: '2026-09-20' })];
    expect([saved(data, headphones, '2026-09-25'), saved(data, headphones, '2026-09-26')]).toEqual([1000, 1000 + 250]);
    data.savingsMoves.push(move({ goalId: 'headphones', amountKopecks: -3000, date: '2026-11-25' }));
    expect(saved(data, headphones, '2026-11-25')).toBe(15000);
  });
});

describe('percent goals, scheduled and manual goals, the cushion', () => {
  it('a percent goal adds its moves, never below 0 nor above the target', () => {
    const data = exampleV();
    data.savingsMoves = [move({ goalId: 'headphones', amountKopecks: 2000, date: '2026-10-06' })];
    expect([saved(data, headphonesPercent, '2026-10-05'), saved(data, headphonesPercent, '2026-10-06')]).toEqual([3300, 5300]);
    data.savingsMoves.push(move({ goalId: 'headphones', amountKopecks: -9000, date: '2026-10-07' }));
    expect(saved(data, headphonesPercent, '2026-10-07')).toBe(0);
    data.savingsMoves = [move({ goalId: 'headphones', amountKopecks: 20000, date: '2026-10-06' })];
    expect(saved(data, headphonesPercent, '2026-10-06')).toBe(15000);
  });

  it('a scheduled goal: its amount on every occurrence from the start, a short month on its last day', () => {
    const monthly: Goal = { ...trip, targetKopecks: 100000, schedule: { amountKopecks: 5000, dayOfMonth: 31, weekday: null } };
    const data = exampleA();
    // 30 September is the last day of September.
    expect([saved(data, monthly, '2026-09-29'), saved(data, monthly, '2026-09-30'), saved(data, monthly, '2026-10-31')]).toEqual([0, 5000, 10000]);
    const winter = { ...monthly, startDate: '2027-01-01' };
    expect(saved(data, winter, '2027-03-01')).toBe(10000); // 31 January and 28 February
    expect(saved(data, { ...trip, initialSavedKopecks: 9000 }, '2026-10-12')).toBe(10000); // up to its target
  });

  it('at a checkpoint a scheduled goal counts its occurrences before it', () => {
    // Example Г: Monday 5 October is the day after the period, so only 28 September counts.
    const data = exampleG();
    const r = calculateDay(data, '2026-09-26');
    expect(r.breakdown.date).toBe('2026-10-05');
    expect(r.breakdown.goalTerms).toEqual([
      { goalId: 'headphones', kopecks: 2411 },
      { goalId: 'bike', kopecks: 4000 },
      { goalId: 'trip', kopecks: 2000 },
    ]);
  });

  it('a goal by hand holds what it started with and its moves', () => {
    const manual: Goal = { ...bike, id: 'manual', percent: null, initialSavedKopecks: 1000, targetKopecks: 3000 };
    const data = exampleA();
    data.savingsMoves = [move({ goalId: 'manual', amountKopecks: 1500, date: '2026-09-28' }), move({ goalId: 'manual', amountKopecks: 5000, date: '2026-09-29' })];
    expect(['2026-09-27', '2026-09-28', '2026-09-29'].map((d) => saved(data, manual, d))).toEqual([1000, 2500, 3000]);
  });

  it('the cushion adds its moves in both modes and never goes below 0', () => {
    const data = exampleV();
    data.savingsMoves = [move({ amountKopecks: -2000, date: '2026-10-06' })];
    expect([cushionSavedBy(data, '2026-10-05'), cushionSavedBy(data, '2026-10-06')]).toEqual([7200, 5200]);
    data.savingsMoves.push(move({ amountKopecks: -99999, date: '2026-10-07' }));
    expect(cushionSavedBy(data, '2026-10-07')).toBe(0);
    const fixed = exampleA();
    fixed.savingsMoves = [move({ amountKopecks: 700, date: '2026-09-27' })];
    expect([cushionSavedBy(fixed, '2026-09-26'), cushionSavedBy(fixed, '2026-09-27')]).toEqual([3000, 3700]);
  });
});

describe('jars and the piggy', () => {
  it('the cushion first, then active goals in data order, with their kind and progress', () => {
    const data = exampleG();
    data.goals.push({ ...bike, id: 'old', status: 'done' }, { ...bike, id: 'manual', name: 'Просто', percent: null });
    expect(jarsOf(data, '2026-09-26').map((j) => [j.key, j.kind, j.savedKopecks, j.progress])).toEqual([
      ['cushion', 'cushion', 3000, null],
      ['headphones', 'deadline', 268, 268 / 15000],
      ['bike', 'percent', 4000, 4000 / 19000],
      ['trip', 'schedule', 0, 0],
      ['manual', 'manual', 4000, 4000 / 19000],
    ]);
  });

  it('fills against the sum of the targets; a cushion with a target counts up to it', () => {
    const data = exampleG();
    // 2,68 + 40,00 + 0 of 150 + 190 + 100; the cushion's 30,00 only in the total.
    expect(piggyFill(data, '2026-09-26')).toEqual({ savedKopecks: 7268, targetKopecks: 44000, fill: 4268 / 44000 });
    data.settings.cushion = { ...data.settings.cushion, targetKopecks: 2000 };
    expect(piggyFill(data, '2026-09-26')).toEqual({ savedKopecks: 7268, targetKopecks: 46000, fill: 6268 / 46000 });
    data.goals = [];
    data.settings.cushion = { ...data.settings.cushion, targetKopecks: null };
    expect(piggyFill(data, '2026-09-26')).toEqual({ savedKopecks: 3000, targetKopecks: null, fill: null });
  });

  it('milestones 25, 50, 75 and 100 %', () => {
    expect([null, 0, 0.2499, 0.25, 0.5, 0.7499, 0.75, 0.99, 1].map(milestone)).toEqual([null, null, null, 25, 50, 50, 75, 75, 100]);
    expect(milestone(3750 / 15000)).toBe(25);
  });
});

describe('when a jar gets full', () => {
  it('a deadline goal on its deadline, a full jar today, a jar by hand never', () => {
    const data = exampleG();
    expect(fillForecast(data, { goalId: 'headphones' }, '2026-09-26')).toBe('2026-11-20');
    data.goals.push({ ...bike, id: 'manual', percent: null }, { ...bike, id: 'full', initialSavedKopecks: 19000 });
    expect(fillForecast(data, { goalId: 'manual' }, '2026-09-26')).toBeNull();
    expect(fillForecast(data, { goalId: 'full' }, '2026-09-26')).toBe('2026-09-26');
    expect(fillForecast(data, { goalId: 'nope' }, '2026-09-26')).toBeNull();
  });

  it('a percent jar by the planned incomes, the unconfirmed one of today too', () => {
    // «Велосипед» 40,00 of 190,00 at 15 %: +33,00 on 5 October, +45,00 on the 10th, +75,00 on the 20th.
    expect(fillForecast(exampleG(), { goalId: 'bike' }, '2026-09-26')).toBe('2026-10-20');
    expect(fillForecast(exampleG(), { goalId: 'bike' }, '2026-10-05')).toBe('2026-10-20');
    // Nothing planned: it does not fill.
    const none = exampleG();
    none.incomeSources = [];
    expect(fillForecast(none, { goalId: 'bike' }, '2026-09-26')).toBeNull();
    // 1 % of 1 020,00 a month is 10,20: 100 000,00 is out of reach in three years.
    const far = exampleG();
    far.goals = [{ ...bike, percent: 1, targetKopecks: 10_000_000 }];
    expect(fillForecast(far, { goalId: 'bike' }, '2026-09-26')).toBeNull();
  });

  it('a scheduled jar by its next occurrences; the cushion only in percent mode with a target', () => {
    expect(fillForecast(exampleG(), { goalId: 'trip' }, '2026-09-26')).toBe('2026-10-26'); // 20,00 on 5 Mondays
    const data = exampleV();
    expect(fillForecast(data, { cushion: true }, '2026-10-05')).toBeNull(); // no target
    data.settings.cushion = percentCushion(10, 5000, '2026-10-05', 13000);
    // 72,00 now, +50,00 on 20 October, +22,00 on 5 November.
    expect(fillForecast(data, { cushion: true }, '2026-10-05')).toBe('2026-11-05');
    const fixed = exampleA();
    fixed.settings.cushion = { ...fixed.settings.cushion, targetKopecks: 5000 };
    expect(fillForecast(fixed, { cushion: true }, '2026-09-26')).toBeNull();
  });
});

describe('the most a move can take', () => {
  it('putting in stops at the smallest free sum of today, taking out at what the jar holds', () => {
    const data = exampleG();
    expect(putInMax(data, { cushion: true }, '2026-09-26')).toBe(19689);
    expect(putInMax(data, { goalId: 'trip' }, '2026-09-26')).toBe(10000);
    expect(takeOutMax(data, { goalId: 'bike' }, '2026-09-26')).toBe(4000);
    expect(takeOutMax(data, { cushion: true }, '2026-09-26')).toBe(3000);
    const done = { ...data, goals: data.goals.map((g) => (g.id === 'bike' ? { ...g, status: 'done' as const } : g)) };
    expect([putInMax(done, { goalId: 'bike' }, '2026-09-26'), takeOutMax(done, { goalId: 'bike' }, '2026-09-26')]).toEqual([0, 0]);
  });

  it('what a move does: the limit, a scheduled jar fills later, the amount within the limits', () => {
    // Example Г on 30 September: limit 196,89 ÷ 5 = 39,37; «Поездка» holds 20,00 and fills on 26 October.
    const data = exampleG();
    expect(withdrawEffect(data, { goalId: 'trip' }, 1000, '2026-09-30')).toEqual({
      amountKopecks: 1000,
      limitKopecks: 4137, // 206,89 ÷ 5
      dailyKopecks: null,
      fillDate: { before: '2026-10-26', after: '2026-11-02' },
    });
    expect(withdrawEffect(data, { goalId: 'trip' }, 99999, '2026-09-30').amountKopecks).toBe(2000);
    expect(depositEffect(data, { cushion: true }, 500, '2026-09-30')).toEqual({ amountKopecks: 500, limitKopecks: 3837, dailyKopecks: null, fillDate: null });
    expect(depositEffect(data, { goalId: 'trip' }, 99999, '2026-09-30').amountKopecks).toBe(8000);
  });

  it('rounding up to whole BYN', () => {
    expect([430, 400, 1, 99, 101].map(roundUpRest)).toEqual([70, 0, 99, 1, 99]);
  });
});

describe('the history of «Копилка»', () => {
  it('income shares, amounts on a schedule and moves, newest first', () => {
    const data = exampleV();
    data.goals = [{ ...headphonesPercent, targetKopecks: 5000 }, { ...trip, startDate: '2026-10-05' }];
    data.transactions.push(tx({ type: 'income', amountKopecks: 50000, date: '2026-10-20', incomeSourceId: 'salary', plannedDate: '2026-10-20' }));
    data.savingsMoves = [
      move({ amountKopecks: -2000, date: '2026-10-07', source: 'withdraw' }),
      move({ goalId: 'trip', amountKopecks: 800, date: '2026-10-06', source: 'leftover' }),
    ];
    const rows = savingsHistory(data, '2026-10-20');
    expect(rows.map((r) => [r.date, r.label, r.jarName, r.amountKopecks])).toEqual([
      // The goal of 50,00 had 33,00: it takes 17,00 of the salary's 75,00.
      ['2026-10-20', 'salary', 'Подушка', 5000],
      ['2026-10-20', 'salary', 'Наушники', 1700],
      ['2026-10-19', 'По расписанию', 'Поездка', 2000],
      ['2026-10-12', 'По расписанию', 'Поездка', 2000],
      ['2026-10-07', 'Забрал', 'Подушка', -2000],
      ['2026-10-06', 'Остаток дня', 'Поездка', 800],
      ['2026-10-05', 'scholarship', 'Подушка', 2200],
      ['2026-10-05', 'scholarship', 'Наушники', 3300],
      ['2026-10-05', 'По расписанию', 'Поездка', 2000],
    ]);
    expect(rows.find((r) => r.source === 'withdraw')).toMatchObject({ moveId: data.savingsMoves[0]!.id, target: { cushion: true } });
    expect(rows.find((r) => r.source === 'income')).toMatchObject({ moveId: null, transactionId: data.transactions.at(-1)!.id });
    expect(new Set(rows.map((r) => r.key)).size).toBe(rows.length);
  });

  it('computed rows start on the day the jar started; closed jars and later days are left out', () => {
    const data = exampleV();
    data.goals = [{ ...headphonesPercent, startDate: '2026-10-06' }, { ...trip, startDate: '2026-10-05', status: 'cancelled' }];
    data.settings.cushion = percentCushion(10, 5000, '2026-10-06');
    data.savingsMoves = [move({ goalId: 'trip', amountKopecks: 800, date: '2026-10-06' }), move({ amountKopecks: 800, date: '2026-10-21' })];
    expect(savingsHistory(data, '2026-10-20')).toEqual([]);
  });
});

describe('«Как дотянуть» with scheduled goals and moves', () => {
  it('example Г on 26 September (21,87): a scheduled goal gives up 25 %, a percent one here nothing', () => {
    const data = exampleG();
    expect(calculateBudget(data, '2026-09-26').dailyLimitKopecks).toBe(2187);
    const levers = limitLevers(data, '2026-09-26');
    expect(levers.map(({ apply: _apply, ...rest }) => rest)).toEqual([
      { kind: 'reserve', targetId: 'groceries', oldValue: 50000, newValue: 45000, newLimitKopecks: 2354, deltaKopecks: 167 },
      { kind: 'goalDeadline', targetId: 'headphones', oldValue: '2026-11-20', newValue: '2026-12-20', newLimitKopecks: 2281, deltaKopecks: 94 },
      { kind: 'cushion', targetId: null, mode: 'fixed', oldValue: 3000, newValue: 2300, newLimitKopecks: 2265, deltaKopecks: 78 },
      // 15,00 instead of 20,00 on 28 September
      { kind: 'goalSchedule', targetId: 'trip', oldValue: 2000, newValue: 1500, newLimitKopecks: 2243, deltaKopecks: 56 },
      { kind: 'reserve', targetId: 'transport', oldValue: 10000, newValue: 9000, newLimitKopecks: 2221, deltaKopecks: 34 },
    ]);
    for (const lever of levers) expect(calculateBudget(lever.apply(data), '2026-09-26').dailyLimitKopecks).toBe(lever.newLimitKopecks);
  });

  it('a smaller scheduled amount keeps what is saved; a goal by hand has no lever', () => {
    const data = exampleG();
    data.goals = [trip, { ...bike, id: 'manual', percent: null }];
    // On 28 September the trip holds 20,00; from then on 15,00 a Monday, and none is left in the period.
    const lever = limitLevers(data, '2026-09-26').find((l) => l.kind === 'goalSchedule')!;
    const applied = lever.apply(data).goals[0]!;
    expect(applied).toMatchObject({ startDate: '2026-09-26', initialSavedKopecks: 0, schedule: { amountKopecks: 1500, weekday: 1 } });
    expect(limitLevers(data, '2026-09-26').some((l) => l.targetId === 'manual')).toBe(false);
    expect(limitLevers(data, '2026-09-30').some((l) => l.kind === 'goalSchedule')).toBe(false);
  });

  it('a fixed cushion lever starts from what the cushion holds with its moves', () => {
    const data = exampleA();
    data.savingsMoves = [move({ amountKopecks: -1000, date: '2026-09-26' })];
    const lever = limitLevers(data, '2026-09-26').find((l) => l.kind === 'cushion')!;
    expect(lever).toMatchObject({ mode: 'fixed', oldValue: 2000, newValue: 1500 });
    expect(cushionSavedBy(lever.apply(data), '2026-09-26')).toBe(1500);
  });
});
