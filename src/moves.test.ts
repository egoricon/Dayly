import { describe, expect, it } from 'vitest';
import {
  addExpense,
  addFavoriteExpense,
  deleteSavingsMove,
  deleteTransaction,
  putIntoJar,
  saveGoal,
  setCushionFixed,
  setCushionTarget,
  setRoundUp,
  takeFromJar,
  updateExpense,
} from './appData';
import { calculateBudget, cushionSavedBy, goalSavedBy } from './domain/budget';
import { exampleA, exampleG, exampleV, expense, headphones, headphonesPercent, trip, tx } from './domain/fixtures';
import { depositEffect, fillForecast, jarsOf, piggyFill, withdrawEffect } from './domain/jars';
import { savingsHistory } from './domain/jarHistory';
import { periodSavings } from './domain/savings';
import type { AppData } from './domain/types';
import { putInMax, takeOutMax } from './ui/savings';

// Update 2, app layer: savings moves in and out, rounding expenses up, and example Г of PROJECT_MAP.md section 2.

const NOW = new Date('2026-09-30T09:00:00');
const TODAY = '2026-09-30';

const goal = (data: AppData, id: string) => data.goals.find((g) => g.id === id)!;
const saved = (data: AppData, id: string, date = TODAY) => goalSavedBy(data, goal(data, id), date);
const limit = (data: AppData, today = TODAY) => calculateBudget(data, today).dailyLimitKopecks;

describe('example Г: moves on 30 September', () => {
  // Example А with «Велосипед» (15 %, 40,00 saved, 190,00) and «Поездка» (20,00 every Monday, 100,00);
  // nothing spent since 26 September. Balance 586,00, 5 days to the end of the period.
  const start = exampleG;

  it('before: «Поездка» put 20,00 in on Monday 28 September; limit 196,89 ÷ 5 = 39,37', () => {
    const data = start();
    expect(saved(data, 'trip', '2026-09-27')).toBe(0);
    expect(saved(data, 'trip')).toBe(2000);
    expect(saved(data, 'trip', '2026-10-04')).toBe(2000); // Monday 5 October is the next period
    expect(saved(data, 'bike')).toBe(4000);
    expect(saved(data, 'headphones')).toBe(1340);
    // 586,00 − 95,00 − 180,00 − 24,11 headphones − 30,00 cushion − 40,00 bike − 20,00 trip
    const r = calculateBudget(data, TODAY);
    expect(r.breakdown).toMatchObject({ goalsKopecks: 2411 + 4000 + 2000, cushionKopecks: 3000, freeKopecks: 19689, days: 5 });
    expect(r.dailyLimitKopecks).toBe(3937);
    expect(periodSavings(data, TODAY)).toEqual({ savedKopecks: 1340 + 2000, plannedKopecks: 2411 + 2000 });
  });

  it('coffee 4,30 is rounded up: 0,70 into the cushion; limit 39,23, 34,93 left today', () => {
    const data = addExpense(start(), 430, 'cafe', TODAY, NOW);
    const coffee = data.transactions.at(-1)!;
    expect(data.savingsMoves).toEqual([
      { id: expect.any(String), goalId: null, amountKopecks: 70, date: TODAY, createdAt: NOW.toISOString(), source: 'roundup', transactionId: coffee.id },
    ]);
    expect(cushionSavedBy(data, TODAY)).toBe(3070);
    const r = calculateBudget(data, TODAY);
    expect(r.balanceKopecks).toBe(58170);
    expect(r.breakdown.freeKopecks).toBe(19619);
    expect([r.dailyLimitKopecks, r.remainingTodayKopecks]).toEqual([3923, 3493]);
  });

  it('«Положить» 10,00 into «Наушники»: 23,21 today, 33,16 by 4 October, 2,49 a day instead of 2,68; limit 37,42', () => {
    const data = addExpense(start(), 430, 'cafe', TODAY, NOW);
    expect(depositEffect(data, { goalId: 'headphones' }, 1000, TODAY)).toEqual({
      amountKopecks: 1000,
      limitKopecks: 3742,
      dailyKopecks: { before: 268, after: 249 },
      fillDate: null,
    });
    const next = putIntoJar(data, { goalId: 'headphones' }, 1000, TODAY, NOW);
    // 10,72 by yesterday + 10,00 = 20,72; the 129,28 left spread over the 52 days to 20 November.
    expect([saved(next, 'headphones', '2026-09-29'), saved(next, 'headphones'), saved(next, 'headphones', '2026-10-04')]).toEqual([1072, 2321, 3316]);
    expect(calculateBudget(next, TODAY).breakdown.freeKopecks).toBe(18714);
    expect(limit(next)).toBe(3742);
  });

  it('«Забрать» 15,00 from «Велосипед»: 25,00 left, full on 5 November instead of 20 October; limit 40,42', () => {
    let data = addExpense(start(), 430, 'cafe', TODAY, NOW);
    data = putIntoJar(data, { goalId: 'headphones' }, 1000, TODAY, NOW);
    expect(takeOutMax(data, { goalId: 'bike' }, TODAY)).toBe(4000);
    expect(withdrawEffect(data, { goalId: 'bike' }, 1500, TODAY)).toEqual({
      amountKopecks: 1500,
      limitKopecks: 4042,
      dailyKopecks: null,
      fillDate: { before: '2026-10-20', after: '2026-11-05' },
    });
    const next = takeFromJar(data, { goalId: 'bike' }, 1500, TODAY, NOW);
    expect(goal(next, 'bike')).toEqual(goal(data, 'bike')); // within its target: no rebase
    expect(saved(next, 'bike')).toBe(2500);
    expect(calculateBudget(next, TODAY).breakdown.freeKopecks).toBe(20214);
    expect(limit(next)).toBe(4042);
  });

  it('after all four: the jars, the piggy, the ring and the history', () => {
    let data = addExpense(start(), 430, 'cafe', TODAY, NOW);
    data = putIntoJar(data, { goalId: 'headphones' }, 1000, TODAY, new Date('2026-09-30T09:01:00'));
    data = takeFromJar(data, { goalId: 'bike' }, 1500, TODAY, new Date('2026-09-30T09:02:00'));
    expect(jarsOf(data, TODAY).map((j) => [j.name, j.kind, j.savedKopecks, j.targetKopecks])).toEqual([
      ['Подушка', 'cushion', 3070, null],
      ['Наушники', 'deadline', 2321, 15000],
      ['Велосипед', 'percent', 2500, 19000],
      ['Поездка', 'schedule', 2000, 10000],
    ]);
    // 23,21 + 25,00 + 20,00 of 440,00; the cushion has no target, so it counts only in the total.
    expect(piggyFill(data, TODAY)).toEqual({ savedKopecks: 9891, targetKopecks: 44000, fill: 6821 / 44000 });
    expect(fillForecast(data, { goalId: 'trip' }, TODAY)).toBe('2026-10-26'); // 40, 60, 80, 100 on the next Mondays
    expect(fillForecast(data, { goalId: 'headphones' }, TODAY)).toBe('2026-11-20');
    expect(fillForecast(data, { cushion: true }, TODAY)).toBeNull();
    // Ring: headphones +23,21, bike −15,00, trip +20,00, cushion +0,70; the headphones plan 9,95 more by 4 October.
    expect(periodSavings(data, TODAY)).toEqual({ savedKopecks: 2891, plannedKopecks: 3886 });
    expect(savingsHistory(data, TODAY).map((r) => [r.date, r.jarName, r.amountKopecks, r.label])).toEqual([
      ['2026-09-30', 'Велосипед', -1500, 'Забрал'],
      ['2026-09-30', 'Наушники', 1000, 'Вручную'],
      ['2026-09-30', 'Подушка', 70, 'Округление'],
      ['2026-09-28', 'Поездка', 2000, 'По расписанию'],
    ]);
    expect(limit(data)).toBe(4042);
  });
});

describe('rounding expenses up', () => {
  it('only when turned on, only a sum that is not whole BYN', () => {
    expect(addExpense(exampleA(), 430, 'cafe', TODAY, NOW).savingsMoves).toEqual([]);
    const on = setRoundUp(exampleA(), { cushion: true });
    expect(on.settings.roundUp).toEqual({ goalId: null });
    expect(addExpense(on, 500, 'cafe', TODAY, NOW).savingsMoves).toEqual([]);
    expect(addExpense(on, 1, 'cafe', TODAY, NOW).savingsMoves.map((m) => m.amountKopecks)).toEqual([99]);
    expect(setRoundUp(on, null).settings.roundUp).toBeNull();
  });

  it('into a goal while it is active and not full, no more than it still needs', () => {
    const data = setRoundUp(exampleA(), { goalId: 'headphones' });
    expect(addExpense(data, 430, 'cafe', TODAY, NOW).savingsMoves).toMatchObject([{ goalId: 'headphones', amountKopecks: 70 }]);
    const almost = saveGoal(data, { ...headphones, deadline: null, initialSavedKopecks: 14990 }); // by hand, 0,10 to go
    expect(addExpense(almost, 430, 'cafe', TODAY, NOW).savingsMoves.map((m) => m.amountKopecks)).toEqual([10]);
    const full = saveGoal(data, { ...headphones, initialSavedKopecks: 15000 });
    expect(addExpense(full, 430, 'cafe', TODAY, NOW).savingsMoves).toEqual([]);
    const cancelled = saveGoal(data, { ...headphones, status: 'cancelled' });
    expect(addExpense(cancelled, 430, 'cafe', TODAY, NOW).savingsMoves).toEqual([]);
  });

  it('never makes a shortfall: capped by what is free at every checkpoint after the expense', () => {
    // On hand 250,00: short of 79,11 already, so nothing is rounded up.
    const short = setRoundUp(exampleA({ balanceKopecks: 25000 }), { cushion: true });
    expect(addExpense(short, 430, 'cafe', '2026-09-26', NOW).savingsMoves).toEqual([]);
    // 0,20 free after the expense (spent from today's limit, it leaves the money at the start of the day
    // as it was): only 0,20 of the 0,70 goes in.
    const tight = setRoundUp(exampleA({ balanceKopecks: 58600 - 25689 + 20 }), { cushion: true });
    const next = addExpense(tight, 430, 'cafe', TODAY, NOW);
    expect(next.savingsMoves.map((m) => m.amountKopecks)).toEqual([20]);
    expect(calculateBudget(next, TODAY).breakdown.freeKopecks).toBe(0);
  });

  it('a favourite is rounded up too; payments and goal purchases are not expenses of the sheet', () => {
    const data = setRoundUp(exampleA(), { cushion: true });
    const { data: next, transactionId } = addFavoriteExpense(data, { id: 'coffee', label: 'Кофе', amountKopecks: 350, category: 'cafe' }, TODAY, NOW);
    expect(next.savingsMoves).toMatchObject([{ amountKopecks: 50, transactionId }]);
    // Undo is a delete: the round-up leaves with the expense.
    expect(deleteTransaction(next, transactionId)).toEqual({ ...data, settings: { ...data.settings, lastCategory: 'cafe' } });
  });

  it('editing recounts it in the same jar, a whole sum removes it; deleting the expense deletes it', () => {
    let data = addExpense(setRoundUp(exampleA(), { goalId: 'headphones' }), 430, 'cafe', TODAY, NOW);
    const coffee = data.transactions.at(-1)!;
    const move = data.savingsMoves[0]!;
    data = setRoundUp(data, { cushion: true }); // a later change of the setting does not move old round-ups
    const edited = updateExpense(data, coffee.id, 410, 'cafe', TODAY);
    expect(edited.savingsMoves).toEqual([{ ...move, amountKopecks: 90 }]);
    expect(updateExpense(data, coffee.id, 400, 'cafe', TODAY).savingsMoves).toEqual([]);
    expect(deleteTransaction(edited, coffee.id).savingsMoves).toEqual([]);
    // A round-up is never deleted on its own.
    expect(deleteSavingsMove(edited, move.id)).toBe(edited);
  });

  it('the move is dated like the expense, the limit it keeps to is today’s', () => {
    // An expense of yesterday edited today: its round-up stays on yesterday.
    const yesterday = addExpense(setRoundUp(exampleA(), { cushion: true }), 430, 'cafe', '2026-09-29', new Date('2026-09-29T12:00:00'));
    const coffee = yesterday.transactions.at(-1)!;
    const edited = updateExpense(yesterday, coffee.id, 420, 'cafe', TODAY);
    expect(edited.savingsMoves).toMatchObject([{ amountKopecks: 80, date: '2026-09-29' }]);
    expect(cushionSavedBy(edited, '2026-09-29')).toBe(3080);
  });

  it('an expense without a round-up gets none when edited', () => {
    const data = addExpense(exampleA(), 430, 'cafe', TODAY, NOW);
    const on = setRoundUp(data, { cushion: true });
    expect(updateExpense(on, data.transactions.at(-1)!.id, 410, 'cafe', TODAY).savingsMoves).toEqual([]);
  });
});

describe('«Положить» and «Забрать»', () => {
  it('the cushion: moves on top of a fixed sum, never taken below 0', () => {
    let data = putIntoJar(exampleA(), { cushion: true }, 2000, TODAY, NOW);
    expect(cushionSavedBy(data, TODAY)).toBe(5000);
    expect(takeOutMax(data, { cushion: true }, TODAY)).toBe(5000);
    data = takeFromJar(data, { cushion: true }, 9999, TODAY, NOW);
    expect(data.savingsMoves.map((m) => [m.amountKopecks, m.source])).toEqual([
      [2000, 'manual'],
      [-5000, 'withdraw'],
    ]);
    expect(cushionSavedBy(data, TODAY)).toBe(0);
    expect(cushionSavedBy(data, '2026-09-29')).toBe(3000); // the day before keeps its value
  });

  it('the limits: in no more than is free and the goal needs, out no more than it holds', () => {
    const data = exampleA();
    // 256,89 is free at the only checkpoint; the headphones need 136,60 more.
    expect([putInMax(data, { cushion: true }, TODAY), putInMax(data, { goalId: 'headphones' }, TODAY)]).toEqual([25689, 13660]);
    expect(putInMax(exampleA({ balanceKopecks: 25000 }), { cushion: true }, '2026-09-26')).toBe(0);
    expect(takeOutMax(data, { goalId: 'headphones' }, TODAY)).toBe(1340);
    expect(putInMax(data, { goalId: 'nope' }, TODAY)).toBe(0);
    expect(takeOutMax(data, { goalId: 'nope' }, TODAY)).toBe(0);
    // On and after its deadline a deadline goal asks for the whole target: nothing comes out.
    expect(takeOutMax(data, { goalId: 'headphones' }, '2026-11-20')).toBe(0);
    expect(takeFromJar(data, { goalId: 'headphones' }, 1000, '2026-11-20', NOW)).toBe(data);
  });

  it('out of a deadline goal: the daily amount grows, the days before keep their values', () => {
    const data = exampleA();
    expect(withdrawEffect(data, { goalId: 'headphones' }, 1000, TODAY)).toMatchObject({ amountKopecks: 1000, dailyKopecks: { before: 268, after: 288 } });
    const next = takeFromJar(data, { goalId: 'headphones' }, 1000, TODAY, NOW);
    // 10,72 − 10,00 = 0,72; the 149,28 left over 52 days: 2,88 today.
    expect([saved(next, 'headphones', '2026-09-29'), saved(next, 'headphones')]).toEqual([1072, 72 + 288]);
    expect(limit(next)).toBeGreaterThan(limit(data));
  });

  it('a percent goal full on paper gives exactly what is taken out', () => {
    // Example В on 20 October with the salary in: 33,00 + 75,00 = 108,00 on paper, the goal is 50,00.
    const data = exampleV();
    data.goals = [{ ...headphonesPercent, targetKopecks: 5000 }];
    data.transactions.push(tx({ type: 'income', amountKopecks: 50000, date: '2026-10-20', incomeSourceId: 'salary', plannedDate: '2026-10-20' }));
    expect(saved(data, 'headphones', '2026-10-21')).toBe(5000);
    const next = takeFromJar(data, { goalId: 'headphones' }, 2000, '2026-10-21', NOW);
    // Counted afresh at the target from 21 October, then the move: exactly 20,00 less.
    expect(goal(next, 'headphones')).toMatchObject({ startDate: '2026-10-21', initialSavedKopecks: 5000 });
    expect([saved(next, 'headphones', '2026-10-20'), saved(next, 'headphones', '2026-10-21')]).toEqual([5000, 3000]);
    // Without the rebase the 20,00 would vanish in the 58,00 over the target.
    const plain = { ...data, savingsMoves: next.savingsMoves };
    expect(saved(plain, 'headphones', '2026-10-21')).toBe(5000);
    // The next income fills it again: 15 % of 220,00 on 5 November.
    const scholarship = tx({ type: 'income', amountKopecks: 22000, date: '2026-11-05', incomeSourceId: 'scholarship', plannedDate: '2026-11-05' });
    const later = { ...next, transactions: [...next.transactions, scholarship] };
    expect(saved(later, 'headphones', '2026-11-05')).toBe(5000);
  });

  it('a goal that went over its target only today: today is exact, yesterday gives way', () => {
    // 33,00 saved; the salary of 20 October adds 75,00 to a goal of 50,00. Keeping 33,00 on the 19th
    // and taking exactly 20,00 on the 20th cannot both hold: today wins, the 19th shows 50,00 − 75,00, never below 0.
    const data = exampleV();
    data.goals = [{ ...headphonesPercent, targetKopecks: 5000 }];
    data.transactions.push(tx({ type: 'income', amountKopecks: 50000, date: '2026-10-20', incomeSourceId: 'salary', plannedDate: '2026-10-20' }));
    const next = takeFromJar(data, { goalId: 'headphones' }, 2000, '2026-10-20', NOW);
    expect(saved(next, 'headphones', '2026-10-20')).toBe(3000);
    expect(saved(next, 'headphones', '2026-10-19')).toBe(0);
  });

  it('a manual goal holds what is put in; a scheduled one its amounts', () => {
    const manual = { ...headphones, id: 'manual', name: 'Просто коплю', deadline: null, initialSavedKopecks: 1000 };
    let data = saveGoal(saveGoal(exampleA(), manual), trip);
    data = putIntoJar(data, { goalId: 'manual' }, 2500, TODAY, NOW);
    expect([saved(data, 'manual', '2026-09-29'), saved(data, 'manual')]).toEqual([1000, 3500]);
    data = takeFromJar(data, { goalId: 'trip' }, 500, TODAY, NOW);
    expect(saved(data, 'trip')).toBe(1500);
    expect(saved(data, 'trip', '2026-10-05')).toBe(3500); // the next Monday adds 20,00
  });

  it('deleting a move by hand gives it back; setting a fixed cushion counts the moves in', () => {
    let data = putIntoJar(exampleA(), { cushion: true }, 2000, TODAY, NOW, 'leftover');
    expect(deleteSavingsMove(data, data.savingsMoves[0]!.id).savingsMoves).toEqual([]);
    expect(deleteSavingsMove(data, 'nope')).toBe(data);
    data = setCushionFixed(data, 4000, TODAY);
    expect(cushionSavedBy(data, TODAY)).toBe(4000);
    expect(data.settings.cushion).toMatchObject({ mode: 'fixed', amountKopecks: 2000 });
    data = setCushionTarget(data, 10000);
    expect(jarsOf(data, TODAY)[0]).toMatchObject({ targetKopecks: 10000, progress: 0.4 });
    expect(setCushionFixed(data, 4000, TODAY).settings.cushion.targetKopecks).toBe(10000);
  });

  it('a move in the period counts in the savings ring; an expense of the day does not change what is saved', () => {
    const data = exampleA();
    data.transactions.push(expense(TODAY, 350, 'cafe'));
    const next = putIntoJar(data, { cushion: true }, 800, TODAY, NOW, 'leftover');
    expect(periodSavings(next, TODAY).savedKopecks - periodSavings(data, TODAY).savedKopecks).toBe(800);
  });
});
