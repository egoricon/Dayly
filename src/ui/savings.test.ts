import { describe, expect, it } from 'vitest';
import { addExpense, addIncome, setAsideLeftover } from '../appData';
import { calculateBudget, goalSavedBy } from '../domain/budget';
import { addDays } from '../domain/dates';
import { exampleA, exampleV, expense, headphones, headphonesPercent, source } from '../domain/fixtures';
import { incomeSplit, rebasedGoal } from '../domain/savings';
import type { AppData, Goal } from '../domain/types';
import { defaultUiState, dismissCard, isCardDismissed, loadUiState, MAX_DISMISSED_CARDS, UI_KEY, type FeatureKey } from '../uiState';
import {
  carrySavedKey,
  fromIncomeText,
  leftoverKey,
  limitAfterSetAside,
  maxPercent,
  moneyInText,
  percentLimitText,
  percentLine,
  percentRules,
  pickSavingsCard,
  recordedIncome,
  referenceIncome,
  savedShares,
  savingsRing,
  setAsideAmount,
  shortMoney,
  splitTitle,
  summaryKey,
  summaryText,
  targetOptions,
  wholeMoney,
  type SavingsCardContext,
} from './savings';

// «Копилка» on screen (update 1, task B): percent rules, texts and which savings card shows.

const NOW = new Date('2026-10-05T09:00:00');

const bike: Goal = { ...headphonesPercent, id: 'bike', name: 'Велосипед', percent: 20 };

describe('percent rules', () => {
  it('example В reads «10% подушка · 15% наушники · 75% на жизнь»', () => {
    const rules = percentRules(exampleV());
    expect(rules).toEqual([
      { goalId: null, name: 'Подушка', percent: 10 },
      { goalId: 'headphones', name: 'Наушники', percent: 15 },
    ]);
    expect(percentLine(rules)).toBe('10% подушка · 15% наушники · 75% на жизнь');
  });

  it('names typed with capitals stay as typed; deadline, done and cancelled goals are no rules', () => {
    const data = exampleV();
    data.goals = [{ ...headphonesPercent, name: 'PS5' }, { ...bike, status: 'done' }, headphones];
    data.settings.cushion = { mode: 'fixed', amountKopecks: 5000 };
    expect(percentLine(percentRules(data))).toBe('15% PS5 · 85% на жизнь');
  });

  it('together they stay below 100 %: the most a new goal can take, and why', () => {
    const others = percentRules(exampleV());
    expect(maxPercent(others)).toBe(74);
    expect(percentLimitText(others)).toBe('Можно не больше 74%: ещё 25% уходит в подушку и «Наушники»');
    // The goal itself does not count against its own percent; the cushion's form counts only goals.
    expect(percentLimitText(others.filter((r) => r.goalId !== 'headphones'))).toBe('Можно не больше 89%: ещё 10% уходит в подушку');
    expect(percentLimitText(others.filter((r) => r.goalId !== null))).toBe('Можно не больше 84%: ещё 15% уходит в «Наушники»');
  });

  it('several goals are «цели»; when everything is taken, says so', () => {
    const data = exampleV();
    data.goals = [headphonesPercent, bike];
    expect(percentLimitText(percentRules(data))).toBe('Можно не больше 54%: ещё 45% уходит в подушку и цели');
    data.goals = [{ ...headphonesPercent, percent: 89 }];
    expect(maxPercent(percentRules(data))).toBe(0);
    expect(percentLimitText(percentRules(data))).toBe('С поступлений уже уходит 99% в подушку и «Наушники». Уменьши там процент');
  });
});

describe('the income the hints count with', () => {
  it('the main income, else the next planned one, else none', () => {
    const data = exampleV();
    expect(referenceIncome(data, '2026-10-06')).toMatchObject({ source: { id: 'scholarship' }, amountKopecks: 22000 });
    expect(fromIncomeText(referenceIncome(data, '2026-10-06')!)).toBe('со стипендии 220,00\u00a0BYN');
    data.settings.mainIncomeSourceId = null;
    expect(referenceIncome(data, '2026-10-06')).toMatchObject({ source: { id: 'salary' }, amountKopecks: 50000 });
    data.incomeSources = [];
    expect(referenceIncome(data, '2026-10-06')).toBeNull();
  });
});

describe('the split sheet', () => {
  it('finds the income an update recorded, and nothing after an expense', () => {
    const data = exampleV();
    const withIncome = addIncome(data, 30000, 'scholarship', '2026-11-05', '2026-11-05', NOW);
    expect(recordedIncome(data, withIncome)).toMatchObject({ type: 'income', amountKopecks: 30000, incomeSourceId: 'scholarship' });
    expect(recordedIncome(data, addExpense(data, 500, 'cafe', '2026-10-05', NOW))).toBeNull();
  });

  it('what went into savings, and a title that agrees with the kind of income', () => {
    expect(savedShares(incomeSplit(exampleV(), 30000))).toBe(7500); // 30,00 cushion + 45,00 headphones
    const scholarship = source('s', 'scholarship', 30000, 5, '2026-10-05');
    expect(splitTitle({ ...scholarship, name: 'Стипендия' }, 30000)).toBe('Стипендия 300,00\u00a0BYN разложилась');
    expect(splitTitle({ ...scholarship, kind: 'parents', name: 'От родителей' }, 30000)).toBe('Деньги от родителей 300,00\u00a0BYN разложились');
    expect(splitTitle({ ...scholarship, kind: 'other', name: 'Подарок' }, 5000)).toBe('Поступление «Подарок» 50,00\u00a0BYN разложилось');
    expect(splitTitle(undefined, 5000)).toBe('Доход 50,00\u00a0BYN разложился');
  });
});

describe('the savings ring', () => {
  it('example В on 5 October: 55,00 of 180,00; nothing planned draws no ring', () => {
    expect(savingsRing(exampleV(), '2026-10-05')).toEqual({ savedKopecks: 5500, plannedKopecks: 18000, fraction: 5500 / 18000 });
    const data = exampleA({ full: false });
    expect(savingsRing(data, '2026-09-26')).toBeNull();
  });

  it('captions in whole BYN, kopecks only when there are any; a sum in a sentence keeps «BYN» on its line', () => {
    expect([wholeMoney(5500), wholeMoney(268), wholeMoney(102000)]).toEqual(['55', '2', '1 020']);
    expect([shortMoney(4500), shortMoney(751)]).toEqual(['45', '7,51']);
    expect(moneyInText(102000)).toBe('1\u202f020,00\u00a0BYN');
  });
});

describe('where leftover money goes', () => {
  it('active goals that still need money, then the cushion when it is in use', () => {
    const data = exampleA(); // headphones by date, fixed cushion 30,00
    expect(targetOptions(data, '2026-09-30').map((o) => [o.key, o.roomKopecks])).toEqual([
      ['headphones', 15000 - 1340],
      ['cushion', null],
    ]);
    data.goals = [{ ...headphones, initialSavedKopecks: 15000 }, { ...bike, status: 'cancelled' }];
    data.settings.cushion = { mode: 'fixed', amountKopecks: 0 };
    expect(targetOptions(data, '2026-09-30')).toEqual([]);
    expect(targetOptions(exampleV(), '2026-10-06').map((o) => o.key)).toEqual(['headphones', 'cushion']);
  });

  it('no more than the goal needs and than is free at every checkpoint', () => {
    const data = exampleA();
    const budget = calculateBudget(data, '2026-09-30');
    const [goal, cushion] = targetOptions(data, '2026-09-30');
    expect(setAsideAmount(budget, goal!, 800)).toBe(800);
    expect(setAsideAmount(budget, goal!, 20000)).toBe(15000 - 1340); // 136,60 is all it still needs
    // 256,89 is free at the end of the period, the only checkpoint.
    expect(setAsideAmount(budget, cushion!, 99999)).toBe(25689);
  });

  it('the limit after setting aside matches example А: 51,37 → 49,93', () => {
    const data = exampleA();
    const [goal] = targetOptions(data, '2026-09-30');
    expect(calculateBudget(data, '2026-09-30').dailyLimitKopecks).toBe(5137);
    expect(limitAfterSetAside(data, goal!, 800, '2026-09-30')).toBe(4993);
  });
});

describe('which savings card the home screen shows', () => {
  const allOn = (_key: FeatureKey) => true;

  function context(data: AppData, today: string, overrides: Partial<SavingsCardContext> = {}): SavingsCardContext {
    return {
      data,
      budget: calculateBudget(data, today),
      today,
      feature: allOn,
      isBannerHidden: () => false,
      isCardDismissed: () => false,
      ...overrides,
    };
  }

  /** Example А on 27 September after 3,50 in a café yesterday: 25,04 left of the 28,54 limit. */
  function dayAfter(): AppData {
    const data = exampleA();
    data.transactions.push(expense('2026-09-26', 350, 'cafe'));
    data.daySummaries = [{ date: '2026-09-26', dailyLimitKopecks: 2854 }];
    return data;
  }

  /** Example А tracked up to the end of its period; 5 October starts a new one. */
  function trackedMonth(): AppData {
    const data = exampleA();
    data.transactions.push(expense('2026-09-26', 350, 'cafe'), expense('2026-09-27', 4000, 'fun'));
    for (let date = '2026-09-26'; date <= '2026-10-04'; date = addDays(date, 1)) data.daySummaries.push({ date, dailyLimitKopecks: 2854 });
    return data;
  }

  it('yesterday’s leftover while there is somewhere to put it', () => {
    expect(pickSavingsCard(context(dayAfter(), '2026-09-27'))).toEqual({ kind: 'leftover', key: 'leftover|2026-09-26', carryKopecks: 2504 });
  });

  it('none when put off till tomorrow, turned off, nothing left or nowhere to put it', () => {
    const hidden = (key: string) => key === leftoverKey('2026-09-26');
    expect(pickSavingsCard(context(dayAfter(), '2026-09-27', { isBannerHidden: hidden }))).toBeNull();
    expect(pickSavingsCard(context(dayAfter(), '2026-09-27', { feature: (key) => key !== 'leftover' }))).toBeNull();
    const overspent = dayAfter();
    overspent.transactions.push(expense('2026-09-26', 3000, 'fun'));
    expect(pickSavingsCard(context(overspent, '2026-09-27'))).toBeNull();
    const nowhere = dayAfter();
    nowhere.goals = [];
    nowhere.settings.cushion = { mode: 'fixed', amountKopecks: 0 };
    expect(pickSavingsCard(context(nowhere, '2026-09-27'))).toBeNull();
    expect(pickSavingsCard(context(exampleA(), '2026-09-26'))).toBeNull(); // no limit recorded yesterday
  });

  it('«Итоги периода» first in a new period, then the leftover once they are closed', () => {
    const data = trackedMonth();
    const summary = pickSavingsCard(context(data, '2026-10-05'));
    expect(summary).toMatchObject({ kind: 'summary', key: 'summary|2026-09-05', summary: { daysInLimit: 8, daysTracked: 9 } });
    const dismissed = (key: string) => key === 'summary|2026-09-05';
    expect(pickSavingsCard(context(data, '2026-10-05', { isCardDismissed: dismissed }))).toMatchObject({ kind: 'leftover', carryKopecks: 2854 });
    expect(pickSavingsCard(context(data, '2026-10-05', { feature: (key) => key !== 'periodSummary' }))).toMatchObject({ kind: 'leftover' });
  });

  it('«Итоги периода» only during the first three days of the period', () => {
    const data = trackedMonth();
    expect(pickSavingsCard(context(data, '2026-10-07'))).toMatchObject({ kind: 'summary' });
    expect(pickSavingsCard(context(data, '2026-10-08'))).toBeNull();
  });

  it('the summary’s text; days «из 1 дня», «из 9 дней»', () => {
    const summary = pickSavingsCard(context(trackedMonth(), '2026-10-05'));
    expect(summary?.kind === 'summary' && summaryText(summary.summary)).toBe('В лимите 8 из 9 дней, отложено 24,11\u00a0BYN, осталось 488,39\u00a0BYN');
    const period = { start: '2026-09-05', end: '2026-10-04' };
    expect(summaryText({ period, daysInLimit: 1, daysTracked: 1, savedKopecks: 0, leftoverKopecks: 1400 })).toBe('В лимите 1 из 1 дня, осталось 14,00\u00a0BYN');
    expect(summaryText({ period, daysInLimit: 0, daysTracked: 0, savedKopecks: 9000, leftoverKopecks: 0 })).toBe('Отложено 90,00\u00a0BYN, осталось 0,00\u00a0BYN');
    expect(summaryKey({ period, daysInLimit: 0, daysTracked: 0, savedKopecks: 0, leftoverKopecks: 0 })).toBe('summary|2026-09-05');
  });

  it('setting the leftover aside keeps the balance and lowers the limit; the carry pill key is per day', () => {
    const data = dayAfter();
    const before = calculateBudget(data, '2026-09-27');
    const after = calculateBudget(setAsideLeftover(data, { goalId: 'headphones' }, 2504, '2026-09-27'), '2026-09-27');
    expect(after.balanceKopecks).toBe(before.balanceKopecks);
    expect(after.dailyLimitKopecks).toBeLessThan(before.dailyLimitKopecks);
    expect(carrySavedKey('2026-09-26')).toBe('carry-saved|2026-09-26');
  });
});

describe('cards closed for good (dayly:ui)', () => {
  function storageWith(value: unknown): Storage {
    return { getItem: (key: string) => (key === UI_KEY ? JSON.stringify(value) : null) } as Storage;
  }

  it('none by default and in state saved before; unknown values are dropped', () => {
    expect(defaultUiState().dismissedCards).toEqual([]);
    expect(loadUiState(storageWith({ accent: 'mint' })).dismissedCards).toEqual([]);
    expect(loadUiState(storageWith({ dismissedCards: 'summary|x' })).dismissedCards).toEqual([]);
    expect(loadUiState(storageWith({ dismissedCards: ['summary|a', 5, null, 'summary|b'] })).dismissedCards).toEqual(['summary|a', 'summary|b']);
  });

  it('remembers a closed card once, and only the newest ones', () => {
    let state = dismissCard(defaultUiState(), 'summary|2026-09-05');
    expect(isCardDismissed(state, 'summary|2026-09-05')).toBe(true);
    expect(isCardDismissed(state, 'summary|2026-10-05')).toBe(false);
    expect(dismissCard(state, 'summary|2026-09-05')).toBe(state);
    for (let i = 0; i < MAX_DISMISSED_CARDS; i += 1) state = dismissCard(state, `summary|${i}`);
    expect(state.dismissedCards).toHaveLength(MAX_DISMISSED_CARDS);
    expect(isCardDismissed(state, 'summary|2026-09-05')).toBe(false);
    const saved = Array.from({ length: 30 }, (_, i) => `k${i}`);
    expect(loadUiState(storageWith({ dismissedCards: saved })).dismissedCards).toEqual(saved.slice(-MAX_DISMISSED_CARDS));
  });
});

describe('a goal switched to a percent in its form', () => {
  it('keeps what it saved by yesterday and takes 15 % from today’s incomes on', () => {
    // What GoalForm saves: { ...rebasedGoal(data, goal, today), deadline: null, percent }.
    const data = exampleA();
    const goal: Goal = { ...rebasedGoal(data, headphones, '2026-09-30'), deadline: null, percent: 15 };
    expect(goal).toMatchObject({ startDate: '2026-09-30', initialSavedKopecks: 1072 });
    const withGoal = { ...data, goals: [goal] };
    expect(incomeSplit(withGoal, 30000).goals).toEqual([{ goalId: 'headphones', kopecks: 4500 }]);
    const paid = addIncome(withGoal, 30000, null, null, '2026-09-30', NOW);
    expect(goalSavedBy(paid, goal, '2026-09-30')).toBe(1072 + 4500);
    expect(goalSavedBy(paid, goal, '2026-09-29')).toBe(1072);
  });
});
