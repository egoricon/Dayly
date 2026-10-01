import { describe, expect, it } from 'vitest';
import { addExpense, buyGoal, cancelGoal, putIntoJar, setCushionTarget, setRoundUp, takeFromJar } from '../appData';
import { exampleG, exampleV, expense, headphones, move } from '../domain/fixtures';
import { cushionSavedBy, goalSavedBy } from '../domain/budget';
import { savingsHistory } from '../domain/jarHistory';
import { jarOf, jarsOf, type Jar } from '../domain/jars';
import type { AppData } from '../domain/types';
import {
  fillText,
  fullJarKeys,
  historyRowText,
  isDeletableRow,
  jarAmountLabel,
  jarAmountText,
  jarWayText,
  moveDeletion,
  putJars,
  putPreview,
  roundUpNote,
  savingsSummary,
  shortDate,
  takeJars,
  takePreview,
  withPercent,
} from './jars';
import { percentRules } from './savings';

// The «Копилка» tab of update 2 on example Г (PROJECT_MAP.md section 2): 30 September, the cushion 30,00,
// «Наушники» by 20 November, «Велосипед» 15 % with 40,00 saved, «Поездка» 20,00 every Monday.

const NOW = new Date('2026-09-30T09:00:00');
const TODAY = '2026-09-30';
const NBSP = ' ';

const jar = (data: AppData, key: string): Jar => jarsOf(data, TODAY).find((j) => j.key === key)!;
const at = (time: string) => new Date(`${TODAY}T${time}`);
/** Coffee 4,30 rounded up into the cushion at 9:00, then «Положить» 10,00 into «Наушники» at 9:05. */
const afterCoffeeAndPut = () => putIntoJar(addExpense(exampleG(), 430, 'cafe', TODAY, at('09:00:00')), { goalId: 'headphones' }, 1000, TODAY, at('09:05:00'));

describe('jar cards', () => {
  it('say how much, how each jar saves and when it fills', () => {
    const data = exampleG();
    expect(jarsOf(data, TODAY).map((j) => [j.name, jarAmountText(j), jarWayText(data, j, TODAY), fillText(data, j, TODAY)])).toEqual([
      ['Подушка', `30,00${NBSP}BYN`, 'запас на непредвиденное', null],
      ['Наушники', '13 из 150', 'к 20 ноября · 2,68 в день', null],
      ['Велосипед', '40 из 190', '15% с поступления', 'наполнится ~20 окт'],
      ['Поездка', '20 из 100', '20 BYN каждую неделю', 'наполнится ~26 окт'],
    ]);
    expect(jarAmountLabel(jar(data, 'bike'))).toBe('40 из 190 BYN');
  });

  it('a percent cushion and a monthly schedule, a jar by hand', () => {
    const data = exampleG();
    data.settings.cushion = { mode: 'percent', percent: 10, baseKopecks: 3000, sinceDate: TODAY, targetKopecks: 10000 };
    data.goals = data.goals.map((g) =>
      g.id === 'trip' ? { ...g, schedule: { amountKopecks: 5000, dayOfMonth: 5, weekday: null } } : g.id === 'bike' ? { ...g, percent: null } : g,
    );
    expect(jarWayText(data, jar(data, 'cushion'), TODAY)).toBe('10% с поступления');
    expect(jarAmountText(jar(data, 'cushion'))).toBe('30 из 100');
    expect(jarWayText(data, jar(data, 'trip'), TODAY)).toBe('50 BYN каждый месяц');
    expect(jarWayText(data, jar(data, 'bike'), TODAY)).toBe('вручную');
    expect(fillText(data, jar(data, 'bike'), TODAY)).toBeNull();
  });

  it('a full jar shows no forecast, and its key goes to the piggy’s cheer once', () => {
    const data = putIntoJar(exampleG(), { goalId: 'trip' }, 8000, TODAY, NOW);
    expect(jarAmountText(jar(data, 'trip'))).toBe('100 из 100');
    expect(fillText(data, jar(data, 'trip'), TODAY)).toBeNull();
    expect(fullJarKeys(data, TODAY)).toEqual(['trip']);
    expect(fullJarKeys(setCushionTarget(data, 2000), TODAY)).toEqual(['cushion', 'trip']);
  });

  it('short dates carry the year only when it is another one', () => {
    expect(shortDate('2026-12-12', TODAY)).toBe('12 дек');
    expect(shortDate('2027-01-05', TODAY)).toBe('5 янв 2027');
  });
});

describe('«Положить» and «Забрать»', () => {
  it('example Г: «Положить» 10,00 into «Наушники» makes the limit 37,42', () => {
    const data = addExpense(exampleG(), 430, 'cafe', TODAY, NOW);
    expect(putPreview(data, { goalId: 'headphones' }, 1000, TODAY)).toEqual({ lines: [`Лимит станет 37,42${NBSP}BYN в день`], danger: false, missing: null });
  });

  it('example Г: «Забрать» 15,00 from «Велосипед» fills it later, and the limit becomes 40,42', () => {
    expect(takePreview(afterCoffeeAndPut(), { goalId: 'bike' }, 1500, TODAY)).toEqual({
      lines: ['Наполнится позже: ~5 ноя вместо 20 окт', `Лимит станет 40,42${NBSP}BYN в день`],
      danger: true,
      missing: null,
    });
  });

  it('a deadline goal warns how much more a day it takes', () => {
    const preview = takePreview(afterCoffeeAndPut(), { goalId: 'headphones' }, 1000, TODAY);
    expect(preview.lines[0]).toBe('Чтобы успеть к 20 ноября, в день будет уходить 2,68 вместо 2,49');
    expect(preview.danger).toBe(true);
  });

  it('put in no more than the jar needs and than is free; nothing typed says how much fits', () => {
    const data = addExpense(exampleG(), 430, 'cafe', TODAY, NOW);
    expect(putPreview(data, { goalId: 'headphones' }, 0, TODAY)).toEqual({ lines: [`Можно положить до 136,60${NBSP}BYN`], danger: false, missing: 'Набери сумму' });
    const tooMuch = putPreview(data, { goalId: 'headphones' }, 20000, TODAY);
    expect(tooMuch).toEqual({ lines: [`В «Наушники» не хватает только 136,60${NBSP}BYN`], danger: true, missing: tooMuch.lines[0] });
    expect(putPreview(data, { cushion: true }, 25000, TODAY).lines).toEqual([`Свободно 196,19${NBSP}BYN: остальное нужно до 5 октября`]);
  });

  it('take out no more than the jar holds', () => {
    const data = exampleG();
    expect(takePreview(data, { goalId: 'bike' }, 0, TODAY).lines).toEqual([`В «Велосипед» 40,00${NBSP}BYN`]);
    expect(takePreview(data, { goalId: 'bike' }, 4001, TODAY)).toMatchObject({ lines: [`Можно забрать не больше 40,00${NBSP}BYN`], danger: true });
  });

  it('chips: a full goal cannot take, an empty one cannot give', () => {
    const data = putIntoJar(exampleG(), { goalId: 'trip' }, 8000, TODAY, NOW);
    data.goals.push({ ...headphones, id: 'empty', name: 'Пусто', deadline: null, startDate: TODAY });
    expect(putJars(data, TODAY).map((j) => j.key)).toEqual(['cushion', 'headphones', 'bike', 'empty']);
    expect(takeJars(data, TODAY).map((j) => j.key)).toEqual(['cushion', 'headphones', 'bike', 'trip']);
  });
});

describe('the piggy’s lines', () => {
  it('example Г: 98,91 in the jars, the period saved 28,91 of 38,86', () => {
    const data = takeFromJar(afterCoffeeAndPut(), { goalId: 'bike' }, 1500, TODAY, NOW);
    expect(savingsSummary(data, TODAY, 9891)).toEqual({ total: 'В копилке 98,91 BYN', period: 'в этом периоде +28 из 38' });
  });

  it('nothing planned and nothing saved: no period line', () => {
    const data = exampleG();
    data.goals = [];
    expect(savingsSummary(data, TODAY, 3000)).toEqual({ total: 'В копилке 30 BYN', period: null });
  });
});

describe('history and deleting a move', () => {
  it('example Г: «Забрал · Велосипед», «Вручную → Наушники», «Округление → Подушка», «По расписанию → Поездка»', () => {
    const data = takeFromJar(afterCoffeeAndPut(), { goalId: 'bike' }, 1500, TODAY, at('09:10:00'));
    const rows = savingsHistory(data, TODAY);
    expect(rows.map(historyRowText)).toEqual(['Забрал · Велосипед', 'Вручную → Наушники', 'Округление → Подушка', 'По расписанию → Поездка']);
    expect(rows.map(isDeletableRow)).toEqual([true, true, false, false]);
    const cushion = takeFromJar(data, { cushion: true }, 500, TODAY, at('09:15:00'));
    expect(historyRowText(savingsHistory(cushion, TODAY)[0]!)).toBe('Забрал из подушки');
  });

  it('a move may be deleted when the limit can do without it, and the new limit is told', () => {
    const data = putIntoJar(exampleG(), { goalId: 'headphones' }, 1000, TODAY, NOW);
    const id = data.savingsMoves[0]!.id;
    expect(moveDeletion(data, id, TODAY)).toEqual({ ok: true, limitKopecks: 3937 });
  });

  it('taking back a «Забрал» whose money is already spent is refused', () => {
    // Free money counts from the start of the day, so the money went on yesterday: 196,89 + 30,00 − 210,00.
    const data = takeFromJar(exampleG(), { cushion: true }, 3000, TODAY, NOW);
    data.transactions.push(expense('2026-09-29', 21000, 'fun'));
    const id = data.savingsMoves[0]!.id;
    expect(moveDeletion(data, id, TODAY)).toEqual({ ok: false, text: `Удалить нельзя: эти деньги уже в лимите, без них до 5 октября не хватит 13,11${NBSP}BYN` });
  });

  it('a round-up goes only with its expense', () => {
    const data = exampleG();
    data.savingsMoves = [move({ amountKopecks: 70, date: TODAY, source: 'roundup', transactionId: 't1' })];
    expect(moveDeletion(data, data.savingsMoves[0]!.id, TODAY)).toMatchObject({ ok: false });
  });
});

describe('rounding up', () => {
  it('says where the rest goes, and when the goal is full that nothing goes', () => {
    const data = exampleG();
    expect(roundUpNote(data, TODAY)).toBe('Трата 4,30 → 0,70 в подушку');
    const intoTrip = setRoundUp(data, { goalId: 'trip' });
    expect(roundUpNote(intoTrip, TODAY)).toBe('Трата 4,30 → 0,70 в «Поездка»');
    expect(roundUpNote(putIntoJar(intoTrip, { goalId: 'trip' }, 8000, TODAY, NOW), TODAY)).toBe('«Поездка» уже полна: пока округление не откладывается');
    expect(roundUpNote(setRoundUp(data, null), TODAY)).toBeNull();
  });

  it('a goal bought or cancelled hands the round-up to the cushion', () => {
    const intoTrip = setRoundUp(exampleG(), { goalId: 'trip' });
    expect(cancelGoal(intoTrip, 'trip').settings.roundUp).toEqual({ goalId: null });
    expect(buyGoal(intoTrip, 'trip', 10000, TODAY, NOW).settings.roundUp).toEqual({ goalId: null });
    const intoBike = setRoundUp(exampleG(), { goalId: 'bike' });
    expect(cancelGoal(intoBike, 'trip').settings.roundUp).toEqual({ goalId: 'bike' });
    expect(jarOf(cancelGoal(intoBike, 'trip'), { goalId: 'trip' }, TODAY)?.name).toBe('Поездка');
  });
});

describe('percents typed in «Как копим»', () => {
  it('count from today: what the goal and the cushion saved stays, the new percent takes the next incomes', () => {
    // Example В on 21 October: the scholarship of 5 October went in at 10 % and 15 %.
    const data = exampleV();
    const day = '2026-10-21';
    const [cushion, goal] = percentRules(data);
    const savedGoal = goalSavedBy(data, data.goals[0]!, day);
    const savedCushion = cushionSavedBy(data, day);
    const next = withPercent(withPercent(data, goal!, 20, day), cushion!, 5, day);
    expect(next.goals[0]).toMatchObject({ percent: 20, startDate: day });
    expect(next.settings.cushion).toMatchObject({ mode: 'percent', percent: 5, sinceDate: day });
    expect(goalSavedBy(next, next.goals[0]!, day)).toBe(savedGoal);
    expect(cushionSavedBy(next, day)).toBe(savedCushion);
    expect(percentRules(next).map((r) => r.percent)).toEqual([5, 20]);
  });
});
