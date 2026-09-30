import { describe, expect, it } from 'vitest';
import {
  addExpense,
  addFavoriteExpense,
  createInitialData,
  deleteTransaction,
  putIntoJar,
  recordDaySummary,
  removeFavorite,
  saveFavorite,
  saveGoal,
  setReserve,
  setRoundUp,
} from './appData';
import { transactionName } from './components/TransactionRow';
import { calculateBudget } from './domain/budget';
import { exampleV } from './domain/fixtures';
import { backupFileName, makeBackup, parseBackup } from './backup';
import { DATA_KEY, loadData, saveData, upgradeData } from './storage';
import { applyKey, type KeypadKey } from './ui/amountInput';
import { formatDayHeader, untilPeriodEnd } from './ui/labels';
import type { AppData } from './domain/types';

function memoryStorage(): Storage {
  const items = new Map<string, string>();
  return {
    get length() {
      return items.size;
    },
    clear: () => items.clear(),
    getItem: (key) => items.get(key) ?? null,
    key: (index) => [...items.keys()][index] ?? null,
    removeItem: (key) => void items.delete(key),
    setItem: (key, value) => void items.set(key, value),
  };
}

function type(keys: string): string {
  return [...keys].reduce((input, ch) => applyKey(input, (ch === '<' ? 'backspace' : ch) as KeypadKey), '');
}

const NOW = new Date('2026-09-26T09:12:00');

/** The same data as version 5 saved it: without the fields version 6 added. */
function toV5(data: AppData) {
  const { savingsMoves: _m, ...rest } = data;
  const { roundUp: _r, cushion, ...settings } = data.settings;
  const { targetKopecks: _t, ...oldCushion } = cushion;
  return {
    ...rest,
    schemaVersion: 5,
    settings: { ...settings, cushion: oldCushion },
    goals: data.goals.map(({ schedule: _s, ...goal }) => goal),
  };
}

/** The same data as version 4 saved it: without the fields versions 5 and 6 added. */
function toV4(data: AppData) {
  const v5 = toV5(data);
  const { targetDailyLimitKopecks: _t, ...settings } = v5.settings;
  return {
    ...v5,
    schemaVersion: 4,
    settings,
    incomeSources: v5.incomeSources.map(({ date: _d, ...rest }) => rest),
    payments: v5.payments.map(({ weekday: _w, date: _d, ...rest }) => rest),
    goals: v5.goals.map(({ percent: _p, ...rest }) => rest),
  };
}

/** Example А after onboarding and settings, with an expense: everything version 5 changed is present. */
function exampleData(): AppData {
  let data = createInitialData(
    '2026-09-26',
    {
      balanceKopecks: 58600,
      income: { kind: 'scholarship', amountKopecks: 22000, date: '2026-10-05' },
      payments: [{ name: 'Общежитие', amountKopecks: 4500, date: '2026-10-01' }],
    },
    NOW,
  );
  data = saveGoal(setReserve(data, 'groceries', 50000), {
    id: 'headphones',
    name: 'Наушники',
    targetKopecks: 15000,
    initialSavedKopecks: 0,
    startDate: '2026-09-26',
    deadline: '2026-11-20',
    percent: null,
    schedule: null,
    status: 'active',
  });
  return addExpense(data, 1840, 'groceries', '2026-09-26', NOW);
}

describe('keypad input', () => {
  it('follows the design rules', () => {
    expect(type('12,4')).toBe('12,4');
    expect(type('3,55')).toBe('3,55');
    expect(type('3,555')).toBe('3,55'); // 2 decimals at most
    expect(type('1,2,3')).toBe('1,23'); // second comma ignored
    expect(type('07')).toBe('7'); // leading 0 replaced
    expect(type(',5')).toBe('0,5');
    expect(type('1234567')).toBe('12345'); // 5 digits before the comma
    expect(type('12<')).toBe('1');
  });
});

describe('first launch and quick entry', () => {
  it('starting balance becomes an adjustment; without an income the period is a month from the start', () => {
    const data = createInitialData('2026-09-26', { balanceKopecks: 58600, income: null, payments: [] }, NOW);
    const budget = calculateBudget(data, '2026-09-26');
    expect(budget.balanceKopecks).toBe(58600);
    expect(budget.period).toEqual({ start: '2026-09-26', end: '2026-10-25' });
    expect(budget.dailyLimitKopecks).toBe(1953); // 586,00 ÷ 30 days
    expect(untilPeriodEnd(data, budget)).toBe('до конца периода 30 дн.');
    expect(formatDayHeader('2026-09-26')).toBe('Сб, 26 сентября');
  });

  it('an added expense recalculates the day at once and becomes the last category', () => {
    let data = createInitialData('2026-09-26', { balanceKopecks: 58600, income: null, payments: [] }, NOW);
    data = addExpense(data, 350, 'delivery', '2026-09-26', NOW);
    const budget = calculateBudget(data, '2026-09-26');
    expect(budget.remainingTodayKopecks).toBe(1953 - 350);
    expect(budget.balanceKopecks).toBe(58250);
    expect(data.settings.lastCategory).toBe('delivery');

    const expense = data.transactions.find((t) => t.type === 'expense')!;
    data = deleteTransaction(data, expense.id);
    expect(calculateBudget(data, '2026-09-26').remainingTodayKopecks).toBe(1953);
  });

  it('records the day limit once per value', () => {
    const data = createInitialData('2026-09-26', { balanceKopecks: 58600, income: null, payments: [] }, NOW);
    const recorded = recordDaySummary(data, '2026-09-26', 11720);
    expect(recorded.daySummaries).toEqual([{ date: '2026-09-26', dailyLimitKopecks: 11720 }]);
    expect(recordDaySummary(recorded, '2026-09-26', 11720)).toBe(recorded);
    expect(recordDaySummary(recorded, '2026-09-26', 9000).daySummaries).toEqual([{ date: '2026-09-26', dailyLimitKopecks: 9000 }]);
  });
});

describe('first setup (update 1)', () => {
  const exampleA = {
    balanceKopecks: 58600,
    income: { kind: 'scholarship' as const, amountKopecks: 22000, date: '2026-10-05' },
    payments: [
      { name: 'Общежитие', amountKopecks: 4500, date: '2026-10-01' },
      { name: 'Интернет', amountKopecks: 3000, date: '2026-10-03' },
      { name: 'Телефон', amountKopecks: 2000, date: '2026-10-04' },
    ],
  };
  const reserveOf = (data: AppData) => data.settings.categories.map((c) => [c.id, c.reserveKopecks]);

  it('example А: payments become monthly events from their day, «Продукты» and «Транспорт» stay without a reserve', () => {
    const data = createInitialData('2026-09-26', exampleA, NOW);
    expect(data.payments.map((p) => [p.name, p.amountKopecks, p.dayOfMonth, p.weekday, p.date, p.startDate, p.isActive])).toEqual([
      ['Общежитие', 4500, 1, null, null, '2026-10-01', true],
      ['Интернет', 3000, 3, null, null, '2026-10-03', true],
      ['Телефон', 2000, 4, null, null, '2026-10-04', true],
    ]);
    expect(data.incomeSources[0]).toMatchObject({ name: 'Стипендия', dayOfMonth: 5, startDate: '2026-10-05' });
    expect(reserveOf(data)).toEqual([['cafe', null], ['delivery', null], ['shopping', null], ['fun', null], ['groceries', 0], ['transport', 0]]);
    expect(calculateBudget(data, '2026-09-26').dailyLimitKopecks).toBe(5455); // (586 − 95) ÷ 9
  });

  it('the reserves of «Продукты» and «Транспорт» are per full period and take the first period’s share', () => {
    const data = createInitialData('2026-09-26', { ...exampleA, reserves: { groceriesKopecks: 50000, transportKopecks: 10000 } }, NOW);
    expect(reserveOf(data).slice(4)).toEqual([['groceries', 50000], ['transport', 10000]]);
    const budget = calculateBudget(data, '2026-09-26');
    expect(budget.reserves.map((r) => [r.category, r.budgetKopecks])).toEqual([['groceries', 15000], ['transport', 3000]]);
    expect(budget.dailyLimitKopecks).toBe(3455); // (586 − 95 − 150 − 30) ÷ 9
  });

  it('a payment repeats as chosen in its form: every week or once', () => {
    const data = createInitialData(
      '2026-09-26',
      {
        ...exampleA,
        payments: [
          { name: 'Спортзал', amountKopecks: 1500, date: '2026-09-30', repeat: 'weekly' },
          { name: 'Подписки', amountKopecks: 999, date: '2026-10-10', repeat: 'once' },
        ],
      },
      NOW,
    );
    expect(data.payments.map((p) => [p.name, p.dayOfMonth, p.weekday, p.date, p.startDate])).toEqual([
      ['Спортзал', null, 3, null, '2026-09-30'],
      ['Подписки', null, null, '2026-10-10', '2026-10-10'],
    ]);
    // Before 5 October: the gym on 30 September; the subscription on 10 October is in the next period.
    expect(calculateBudget(data, '2026-09-26').breakdown.paymentsKopecks).toBe(1500);
  });

  it('«Другое» comes as «Доход»; «Пока нет постоянных» keeps the whole month from today', () => {
    const other = createInitialData('2026-09-26', { ...exampleA, income: { kind: 'other', name: 'Доход', amountKopecks: 22000, date: '2026-10-05' } }, NOW);
    expect(other.incomeSources[0]!.name).toBe('Доход');
    const none = createInitialData('2026-09-26', { ...exampleA, income: null }, NOW);
    expect(none.settings.mainIncomeSourceId).toBeNull();
    expect(calculateBudget(none, '2026-09-26').period).toEqual({ start: '2026-09-26', end: '2026-10-25' });
  });
});

describe('storage', () => {
  it('survives a save and a reload', () => {
    const storage = memoryStorage();
    expect(loadData(storage)).toBeNull();
    const data = addExpense(createInitialData('2026-09-26', { balanceKopecks: 58600, income: null, payments: [] }, NOW), 350, 'cafe', '2026-09-26', NOW);
    saveData(storage, data);
    expect(loadData(storage)).toEqual(data);
  });

  it('upgrades version 1 data: incomes get weekday null, favourites start empty', () => {
    const storage = memoryStorage();
    const data = createInitialData('2026-09-26', { balanceKopecks: 58600, income: { kind: 'scholarship', amountKopecks: 22000, date: '2026-10-05' }, payments: [] }, NOW);
    const v4 = toV4(data);
    const { favorites: _f, categories: _c, ...rest } = v4.settings;
    const v1Settings = { ...rest, reserves: { groceriesKopecks: 0, transportKopecks: 0 } };
    const v1 = { ...v4, schemaVersion: 1, settings: v1Settings, incomeSources: v4.incomeSources.map(({ weekday: _, ...rest }) => rest) };
    storage.setItem(DATA_KEY, JSON.stringify(v1));
    expect(loadData(storage)).toEqual(data);
  });

  it('upgrades version 3 data: reserves become «Продукты» and «Транспорт» with a reserve, the limit stays', () => {
    const storage = memoryStorage();
    let data = createInitialData('2026-09-26', { balanceKopecks: 58600, income: { kind: 'scholarship', amountKopecks: 22000, date: '2026-10-05' }, payments: [] }, NOW);
    data = addExpense(setReserve(setReserve(data, 'groceries', 50000), 'transport', 10000), 1840, 'groceries', '2026-09-26', NOW);
    const v4 = toV4(data);
    const { categories: _c, ...rest } = v4.settings;
    const v3 = { ...v4, schemaVersion: 3, settings: { ...rest, reserves: { groceriesKopecks: 50000, transportKopecks: 10000 } } };
    storage.setItem(DATA_KEY, JSON.stringify(v3));
    const loaded = loadData(storage)!;
    expect(loaded).toEqual(data);
    expect(loaded.settings.categories.map((c) => [c.name, c.reserveKopecks])).toEqual([
      ['Кафе', null],
      ['Доставка', null],
      ['Покупки', null],
      ['Развлечения', null],
      ['Продукты', 50000],
      ['Транспорт', 10000],
    ]);
    expect(calculateBudget(loaded, '2026-09-26')).toEqual(calculateBudget(data, '2026-09-26'));
  });

  it('upgrades version 4 data: everything planned repeats, goals keep their deadline, no target limit', () => {
    const storage = memoryStorage();
    const data = exampleData();
    const v4 = toV4(data);
    expect(['targetDailyLimitKopecks' in v4.settings, 'date' in v4.incomeSources[0]!, 'weekday' in v4.payments[0]!, 'percent' in v4.goals[0]!]).toEqual([
      false,
      false,
      false,
      false,
    ]);
    storage.setItem(DATA_KEY, JSON.stringify(v4));
    const loaded = loadData(storage)!;
    expect(loaded).toEqual(data);
    expect(loaded.schemaVersion).toBe(6);
    expect(loaded.settings.targetDailyLimitKopecks).toBeNull();
    expect(loaded.incomeSources[0]).toMatchObject({ dayOfMonth: 5, weekday: null, date: null });
    expect(loaded.payments[0]).toMatchObject({ dayOfMonth: 1, weekday: null, date: null });
    expect(loaded.goals[0]).toMatchObject({ deadline: '2026-11-20', percent: null });
    expect(calculateBudget(loaded, '2026-09-26')).toEqual(calculateBudget(data, '2026-09-26'));
  });

  it('upgrades version 5 data: no moves yet, goals keep their way of saving, rounding up off, no cushion target', () => {
    const storage = memoryStorage();
    const data = exampleData();
    const v5 = toV5(data);
    expect(['roundUp' in v5.settings, 'targetKopecks' in v5.settings.cushion, 'schedule' in v5.goals[0]!, 'savingsMoves' in v5]).toEqual([
      false,
      false,
      false,
      false,
    ]);
    storage.setItem(DATA_KEY, JSON.stringify(v5));
    const loaded = loadData(storage)!;
    expect(loaded).toEqual(data);
    expect(loaded.schemaVersion).toBe(6);
    expect(loaded.settings.roundUp).toBeNull();
    expect(loaded.settings.cushion).toEqual({ mode: 'fixed', amountKopecks: 0, targetKopecks: null });
    expect(loaded.goals[0]).toMatchObject({ deadline: '2026-11-20', percent: null, schedule: null });
    expect(loaded.savingsMoves).toEqual([]);
    expect(calculateBudget(loaded, '2026-09-30')).toEqual(calculateBudget(data, '2026-09-30'));
  });

  it('upgrades what update 1 set aside as it is: a percent cushion and goal keep their base, the limit stays', () => {
    // Example В after «Отложить остаток» 8,00 in update 1: the amount went into the goal's initial savings.
    const data = exampleV();
    data.goals = [{ ...data.goals[0]!, initialSavedKopecks: 800 }];
    const loaded = upgradeData(JSON.parse(JSON.stringify(toV5(data))))!;
    expect(loaded).toEqual(data);
    expect(calculateBudget(loaded, '2026-10-06').dailyLimitKopecks).toBe(226);
  });

  it('keeps unreadable data aside instead of losing it', () => {
    const storage = memoryStorage();
    storage.setItem(DATA_KEY, '{broken');
    expect(loadData(storage)).toBeNull();
    expect(storage.getItem('dayly:data:corrupt')).toBe('{broken');
  });
});

describe('favourite expenses', () => {
  const coffee = { id: 'coffee', label: 'Кофе', amountKopecks: 350, category: 'cafe' as const };

  it('one tap adds an ordinary expense named by the label, and undo removes it', () => {
    const data = saveFavorite(createInitialData('2026-09-26', { balanceKopecks: 58600, income: null, payments: [] }, NOW), coffee);
    const { data: next, transactionId } = addFavoriteExpense(data, coffee, '2026-09-26', NOW);
    const t = next.transactions.find((x) => x.id === transactionId)!;
    expect(t).toMatchObject({ type: 'expense', amountKopecks: 350, category: 'cafe', note: 'Кофе' });
    expect(transactionName(t, next)).toBe('Кофе');
    expect(calculateBudget(next, '2026-09-26').remainingTodayKopecks).toBe(calculateBudget(data, '2026-09-26').remainingTodayKopecks - 350);
    expect(deleteTransaction(next, transactionId).transactions).toEqual(data.transactions);
  });

  it('keeps at most six favourites, edits in place and removes', () => {
    let data = createInitialData('2026-09-26', { balanceKopecks: 0, income: null, payments: [] }, NOW);
    for (let i = 0; i < 7; i++) data = saveFavorite(data, { ...coffee, id: `f${i}`, label: `F${i}` });
    expect(data.settings.favorites.map((f) => f.id)).toEqual(['f0', 'f1', 'f2', 'f3', 'f4', 'f5']);
    data = saveFavorite(data, { ...coffee, id: 'f2', label: 'Метро', category: 'transport', amountKopecks: 90 });
    expect(data.settings.favorites[2]).toMatchObject({ label: 'Метро', category: 'transport', amountKopecks: 90 });
    expect(removeFavorite(data, 'f0').settings.favorites).toHaveLength(5);
  });
});

describe('backup', () => {
  const data = addExpense(createInitialData('2026-09-26', { balanceKopecks: 58600, income: null, payments: [] }, NOW), 350, 'cafe', '2026-09-26', NOW);

  it('a saved copy restores the same data', () => {
    const restored = parseBackup(makeBackup(data, NOW));
    expect(restored).toEqual({ data, exportedAt: NOW.toISOString() });
    expect(backupFileName('2026-09-26')).toBe('dayly-2026-09-26.json');
  });

  it('upgrades a copy made by an older version', () => {
    const v4 = toV4(data);
    const { favorites: _f, categories: _c, ...rest } = v4.settings;
    const oldSettings = { ...rest, reserves: { groceriesKopecks: 0, transportKopecks: 0 } };
    const old = { app: 'dayly', exportedAt: NOW.toISOString(), data: { ...v4, schemaVersion: 2, settings: oldSettings } };
    expect(parseBackup(JSON.stringify(old))?.data).toEqual(data);
  });

  it('restores a copy made before update 1 (version 4)', () => {
    const full = exampleData();
    const old = { app: 'dayly', exportedAt: NOW.toISOString(), data: toV4(full) };
    expect(parseBackup(JSON.stringify(old, null, 1))).toEqual({ data: full, exportedAt: NOW.toISOString() });
  });

  it('restores a copy made before update 2 (version 5)', () => {
    const full = exampleData();
    const old = { app: 'dayly', exportedAt: NOW.toISOString(), data: toV5(full) };
    expect(parseBackup(JSON.stringify(old, null, 1))).toEqual({ data: full, exportedAt: NOW.toISOString() });
  });

  it('a copy keeps savings moves, schedules and rounding up', () => {
    const full = putIntoJar(setRoundUp(exampleData(), { cushion: true }), { goalId: 'headphones' }, 1000, '2026-09-26', NOW);
    const withSchedule = saveGoal(full, { ...full.goals[0]!, id: 'trip', deadline: null, schedule: { amountKopecks: 2000, dayOfMonth: null, weekday: 1 } });
    expect(parseBackup(makeBackup(withSchedule, NOW))?.data).toEqual(withSchedule);
  });

  it('rejects files that are not a Dayly copy', () => {
    expect(parseBackup('not json')).toBeNull();
    expect(parseBackup(JSON.stringify({ app: 'other', data }))).toBeNull();
    expect(parseBackup(JSON.stringify({ app: 'dayly', data: { schemaVersion: 3 } }))).toBeNull();
    expect(parseBackup(JSON.stringify({ app: 'dayly', data: { ...data, schemaVersion: 99 } }))).toBeNull();
  });
});
