import { describe, expect, it } from 'vitest';
import { addExpense, addFavoriteExpense, createInitialData, deleteTransaction, recordDaySummary, removeFavorite, saveFavorite } from './appData';
import { transactionName } from './components/TransactionRow';
import { calculateBudget } from './domain/budget';
import { backupFileName, makeBackup, parseBackup } from './backup';
import { DATA_KEY, loadData, saveData } from './storage';
import { applyKey, type KeypadKey } from './ui/amountInput';
import { formatDayHeader, untilPeriodEnd } from './ui/labels';

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
  it('starting balance becomes an adjustment; the period is the calendar month', () => {
    const data = createInitialData('2026-09-26', { balanceKopecks: 58600, income: null, payments: [] }, NOW);
    const budget = calculateBudget(data, '2026-09-26');
    expect(budget.balanceKopecks).toBe(58600);
    expect(budget.period).toEqual({ start: '2026-09-01', end: '2026-09-30' });
    expect(budget.dailyLimitKopecks).toBe(11720); // 586,00 ÷ 5 days
    expect(untilPeriodEnd(data, budget)).toBe('до конца месяца 5 дн.');
    expect(formatDayHeader('2026-09-26')).toBe('Сб, 26 сентября');
  });

  it('an added expense recalculates the day at once and becomes the last category', () => {
    let data = createInitialData('2026-09-26', { balanceKopecks: 58600, income: null, payments: [] }, NOW);
    data = addExpense(data, 350, 'delivery', '2026-09-26', NOW);
    const budget = calculateBudget(data, '2026-09-26');
    expect(budget.remainingTodayKopecks).toBe(11720 - 350);
    expect(budget.balanceKopecks).toBe(58250);
    expect(data.settings.lastCategory).toBe('delivery');

    const expense = data.transactions.find((t) => t.type === 'expense')!;
    data = deleteTransaction(data, expense.id);
    expect(calculateBudget(data, '2026-09-26').remainingTodayKopecks).toBe(11720);
  });

  it('records the day limit once per value', () => {
    const data = createInitialData('2026-09-26', { balanceKopecks: 58600, income: null, payments: [] }, NOW);
    const recorded = recordDaySummary(data, '2026-09-26', 11720);
    expect(recorded.daySummaries).toEqual([{ date: '2026-09-26', dailyLimitKopecks: 11720 }]);
    expect(recordDaySummary(recorded, '2026-09-26', 11720)).toBe(recorded);
    expect(recordDaySummary(recorded, '2026-09-26', 9000).daySummaries).toEqual([{ date: '2026-09-26', dailyLimitKopecks: 9000 }]);
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
    const { favorites: _f, ...v1Settings } = data.settings;
    const v1 = { ...data, schemaVersion: 1, settings: v1Settings, incomeSources: data.incomeSources.map(({ weekday: _, ...rest }) => rest) };
    storage.setItem(DATA_KEY, JSON.stringify(v1));
    expect(loadData(storage)).toEqual(data);
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
    const { favorites: _f, ...oldSettings } = data.settings;
    const old = { app: 'dayly', exportedAt: NOW.toISOString(), data: { ...data, schemaVersion: 2, settings: oldSettings } };
    expect(parseBackup(JSON.stringify(old))?.data).toEqual(data);
  });

  it('rejects files that are not a Dayly copy', () => {
    expect(parseBackup('not json')).toBeNull();
    expect(parseBackup(JSON.stringify({ app: 'other', data }))).toBeNull();
    expect(parseBackup(JSON.stringify({ app: 'dayly', data: { schemaVersion: 3 } }))).toBeNull();
    expect(parseBackup(JSON.stringify({ app: 'dayly', data: { ...data, schemaVersion: 99 } }))).toBeNull();
  });
});
