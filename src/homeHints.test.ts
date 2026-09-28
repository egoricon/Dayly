import { describe, expect, it } from 'vitest';
import { addExpense, addIncome, setTargetDailyLimit, updateExpense } from './appData';
import { calculateBudget } from './domain/budget';
import { exampleA, exampleV, expense } from './domain/fixtures';
import { limitLevers } from './domain/levers';
import { upcomingEvents, type PlannedEvent } from './domain/planned';
import type { AppData } from './domain/types';
import {
  addedTransaction,
  compactKopecks,
  isRunningLow,
  leverEffect,
  leverTitle,
  ringTone,
  runningLowLabel,
  streakText,
  targetLine,
  tomorrowGain,
  tomorrowIfStopped,
  undoText,
  upcomingDay,
  upcomingItems,
  upcomingText,
} from './ui/homeHints';

// Update 1 on the home screen (task C): the texts and thresholds of homeHints.ts on example А of
// PROJECT_MAP.md (26 September 2026, limit 28,54) and example В (5 October, limit 2,13).

const TODAY = '2026-09-26';
const NOW = new Date('2026-09-26T10:00:00');

/** Example А with the names a student would type. */
function named(data = exampleA()): AppData {
  const names: Record<string, string> = { scholarship: 'Стипендия', parents: 'От родителей', salary: 'Подработка', dorm: 'Общежитие', internet: 'Интернет', phone: 'Телефон' };
  return {
    ...data,
    incomeSources: data.incomeSources.map((s) => ({ ...s, name: names[s.id] ?? s.name })),
    payments: data.payments.map((p) => ({ ...p, name: names[p.id] ?? p.name })),
  };
}

/** Example А after spending `kopecks` in «Кафе» today, all of it from the limit. */
function spent(kopecks: number, data = exampleA()): AppData {
  return kopecks === 0 ? data : { ...data, transactions: [...data.transactions, expense(TODAY, kopecks, 'cafe')] };
}

const budgetOf = (data: AppData, today = TODAY) => calculateBudget(data, today);

/** Short of 79,11: a deficit, the limit is 0. */
const deficit = () => exampleA({ balanceKopecks: 25000 });

describe('the ring warns early', () => {
  it('turns yellow past 80 % of the limit up to all of it, red once overspent', () => {
    // 20 % of 28,54 is 5,708: 5,71 left is still the accent, 5,70 is yellow.
    const tones = [0, 2283, 2284, 2426, 2854, 2855].map((k) => ringTone(budgetOf(spent(k)), true));
    expect(tones).toEqual(['accent', 'accent', 'warning', 'warning', 'warning', 'danger']);
  });

  it('says why: less than 20 % left, and «На сегодня всё» at 0,00', () => {
    expect(runningLowLabel(budgetOf(spent(2426)))).toBe('Осталось меньше 20%');
    expect(runningLowLabel(budgetOf(spent(2854)))).toBe('На сегодня всё');
  });

  it('stays the accent with «Жёлтое кольцо на 80%» off; overspending is red anyway', () => {
    expect(ringTone(budgetOf(spent(2426)), false)).toBe('accent');
    expect(ringTone(budgetOf(spent(2855)), false)).toBe('danger');
  });

  it('is red in a deficit, never yellow', () => {
    const budget = budgetOf(deficit());
    expect(budget.status).toBe('deficit');
    expect(isRunningLow(budget)).toBe(false);
    expect(ringTone(budget, true)).toBe('danger');
  });
});

describe('«Завтра будет…»', () => {
  it('tomorrow if nothing more is spent today, with the gain against today', () => {
    // Nothing spent: 256,89 over 8 days from tomorrow.
    expect(tomorrowIfStopped(budgetOf(spent(0)))).toEqual({ limitKopecks: 3211, deltaKopecks: 357 });
    const stopped = tomorrowIfStopped(budgetOf(spent(850)))!;
    expect(stopped).toEqual({ limitKopecks: 3104, deltaKopecks: 250 });
    expect(tomorrowGain(stopped)).toBe('(+2,50)');
  });

  it('shows no «+» when tomorrow is not more than today', () => {
    expect(tomorrowGain({ limitKopecks: 2854, deltaKopecks: 0 })).toBe('');
    expect(tomorrowGain({ limitKopecks: 2700, deltaKopecks: -154 })).toBe('');
  });

  it('only while money is left today and there is no deficit', () => {
    expect(tomorrowIfStopped(budgetOf(spent(2853)))).not.toBeNull();
    expect(tomorrowIfStopped(budgetOf(spent(2854)))).toBeNull();
    expect(tomorrowIfStopped(budgetOf(spent(2855)))).toBeNull();
    expect(tomorrowIfStopped(budgetOf(deficit()))).toBeNull();
  });
});

describe('«Хочу тратить N в день»', () => {
  const withTarget = (kopecks: number | null, data = exampleA()) => setTargetDailyLimit(data, kopecks);

  it('says how much the limit is short of the target', () => {
    expect(targetLine(withTarget(3000), budgetOf(exampleA()))).toEqual({ reached: false, text: 'До 30,00 BYN в день не хватает 1,46' });
    expect(targetLine(withTarget(6000), budgetOf(exampleA()))).toEqual({ reached: false, text: 'До 60,00 BYN в день не хватает 31,46' });
    // Overspending today does not change the limit: the line stays.
    const over = withTarget(3000, spent(2855));
    expect(targetLine(over, budgetOf(over))?.text).toBe('До 30,00 BYN в день не хватает 1,46');
  });

  it('a reached target is a quiet line, gone on an overspent day', () => {
    expect(targetLine(withTarget(2500), budgetOf(exampleA()))).toEqual({ reached: true, text: 'Цель 25,00 BYN в день достигнута' });
    expect(targetLine(withTarget(2854), budgetOf(exampleA()))?.reached).toBe(true);
    const over = withTarget(2500, spent(2855));
    expect(targetLine(over, budgetOf(over))).toBeNull();
  });

  it('no line without a target or in a deficit', () => {
    expect(targetLine(exampleA(), budgetOf(exampleA()))).toBeNull();
    const short = withTarget(3000, deficit());
    expect(targetLine(short, budgetOf(short))).toBeNull();
  });
});

describe('«Как дотянуть» in plain words', () => {
  it('example А: reserves in whole BYN, the goal a month later, the cushion', () => {
    const data = exampleA();
    const levers = limitLevers(data, TODAY);
    expect(levers.map((l) => leverTitle(l, data, TODAY))).toEqual([
      'Резерв «Продукты» 450 вместо 500',
      'Сдвинуть «Наушники» на 20 декабря',
      'Подушка 23 вместо 30',
      'Резерв «Транспорт» 90 вместо 100',
    ]);
    expect(levers.map(leverEffect)).toEqual([
      '+1,67 в день · станет 30,21',
      '+0,93 в день · станет 29,47',
      '+0,78 в день · станет 29,32',
      '+0,33 в день · станет 28,87',
    ]);
  });

  it('example В: percents of every income', () => {
    const data = exampleV();
    const levers = limitLevers(data, '2026-10-05');
    expect(levers.map((l) => leverTitle(l, data, '2026-10-05'))).toEqual([
      'Резерв «Продукты» 360 вместо 400',
      'Откладывать на «Наушники» 10% вместо 15%',
      'Откладывать в подушку 5% вместо 10%',
      'Резерв «Транспорт» 36 вместо 40',
    ]);
    expect(levers.map(leverEffect)).toEqual([
      '+1,29 в день · станет 3,42',
      '+0,74 в день · станет 2,87',
      '+0,74 в день · станет 2,87',
      '+0,13 в день · станет 2,26',
    ]);
  });

  it('a date in another year says the year', () => {
    const data = exampleA();
    const moved = limitLevers(data, TODAY)
      .find((l) => l.kind === 'goalDeadline')!
      .apply(data);
    const again = limitLevers(moved, TODAY).find((l) => l.kind === 'goalDeadline')!;
    expect(leverTitle(again, moved, TODAY)).toBe('Сдвинуть «Наушники» на 20 января 2027');
  });
});

describe('the week strip', () => {
  it('«В лимите N дней подряд»', () => {
    expect([0, 1, 2, 5, 11, 21, 22].map(streakText)).toEqual([
      null,
      'Вчера в лимите',
      'В лимите 2 дня подряд',
      'В лимите 5 дней подряд',
      'В лимите 11 дней подряд',
      'В лимите 21 день подряд',
      'В лимите 22 дня подряд',
    ]);
  });
});

describe('«Ближайшее»', () => {
  it('today, tomorrow, a weekday within a week, then the date', () => {
    // 26 September 2026 is a Saturday: the 3rd of October would be «Сб» again, so it is a date.
    const days = ['2026-09-26', '2026-09-27', '2026-09-28', '2026-10-01', '2026-10-02', '2026-10-03', '2027-01-10'];
    expect(days.map((d) => upcomingDay(d, TODAY))).toEqual(['Сегодня', 'Завтра', 'Пн', 'Чт', 'Пт', '3 окт', '10 янв']);
  });

  it('the next two unpaid payments and expected incomes, whole BYN without «,00»', () => {
    const data = named();
    const items = upcomingItems(upcomingEvents(data, TODAY, 2), data, TODAY);
    expect(upcomingText(items)).toBe('Чт: Общежитие −45 · 3 окт: Интернет −30');
    expect(items.map((i) => i.date)).toEqual(['2026-10-01', '2026-10-03']);
  });

  it('a second event on the same day goes without its day; kopecks and thousands stay', () => {
    const data = named();
    const events: PlannedEvent[] = [
      { kind: 'income', sourceId: 'salary', date: '2026-10-05', amountKopecks: 102000, done: false },
      { kind: 'payment', sourceId: 'phone', date: '2026-10-05', amountKopecks: 1250, done: false },
    ];
    expect(upcomingText(upcomingItems(events, data, TODAY))).toBe('5 окт: Подработка +1 020 · Телефон −12,50');
    expect(compactKopecks(30000)).toBe('300');
  });
});

describe('«Отменить» after «Добавить»', () => {
  it('finds the new expense or income, not an edit', () => {
    const before = named();
    const withExpense = addExpense(before, 450, 'cafe', TODAY, NOW);
    const added = addedTransaction(before, withExpense)!;
    expect(added).toMatchObject({ type: 'expense', amountKopecks: 450 });
    expect(undoText(added, withExpense)).toBe('Кафе −4,50');

    const edited = updateExpense(withExpense, added.id, 300, 'cafe');
    expect(addedTransaction(withExpense, edited)).toBeNull();
  });

  it('names an income by its source', () => {
    const before = named();
    const extra = addIncome(before, 5000, null, null, TODAY, NOW);
    expect(undoText(addedTransaction(before, extra)!, extra)).toBe('Доход +50,00');
    const scholarship = addIncome(before, 22000, 'scholarship', '2026-10-05', TODAY, NOW);
    expect(undoText(addedTransaction(before, scholarship)!, scholarship)).toBe('Стипендия +220,00');
  });
});
