import { describe, expect, it } from 'vitest';
import { calculateBudget } from './budget';
import { exampleA, exampleV, headphonesPercent, percentCushion } from './fixtures';
import { limitLevers } from './levers';

// «Как дотянуть» (update 1): examples А and В of PROJECT_MAP.md section 2.

const summary = (levers: ReturnType<typeof limitLevers>) =>
  levers.map(({ apply: _apply, ...rest }) => rest);

describe('ways to raise the daily limit', () => {
  it('example А (28,54): groceries −10 %, headphones a month later, cushion −25 %, transport −10 %', () => {
    expect(summary(limitLevers(exampleA(), '2026-09-26'))).toEqual([
      // 9 of 30 days: 135,00 instead of 150,00 set aside, (256,89 + 15,00) ÷ 9
      { kind: 'reserve', targetId: 'groceries', oldValue: 50000, newValue: 45000, newLimitKopecks: 3021, deltaKopecks: 167 },
      // By 4 October 15,70 instead of 24,11 saved: 9 of 86 days
      { kind: 'goalDeadline', targetId: 'headphones', oldValue: '2026-11-20', newValue: '2026-12-20', newLimitKopecks: 2947, deltaKopecks: 93 },
      // 22,50 rounded up to 23,00
      { kind: 'cushion', targetId: null, mode: 'fixed', oldValue: 3000, newValue: 2300, newLimitKopecks: 2932, deltaKopecks: 78 },
      { kind: 'reserve', targetId: 'transport', oldValue: 10000, newValue: 9000, newLimitKopecks: 2887, deltaKopecks: 33 },
    ]);
  });

  it('example В (2,13): percent goal and percent cushion 5 points lower', () => {
    expect(summary(limitLevers(exampleV(), '2026-10-05'))).toEqual([
      { kind: 'reserve', targetId: 'groceries', oldValue: 40000, newValue: 36000, newLimitKopecks: 342, deltaKopecks: 129 },
      // 10 % of 220,00 by today: 22,00 instead of 33,00 at 20 October
      { kind: 'goalPercent', targetId: 'headphones', oldValue: 15, newValue: 10, newLimitKopecks: 287, deltaKopecks: 74 },
      { kind: 'cushion', targetId: null, mode: 'percent', oldValue: 10, newValue: 5, newLimitKopecks: 287, deltaKopecks: 74 },
      { kind: 'reserve', targetId: 'transport', oldValue: 4000, newValue: 3600, newLimitKopecks: 226, deltaKopecks: 13 },
    ]);
  });

  it('each lever gives exactly the limit it shows once applied', () => {
    for (const [data, today] of [
      [exampleA(), '2026-09-26'],
      [exampleA(), '2026-10-12'],
      [exampleV(), '2026-10-05'],
    ] as const) {
      const levers = limitLevers(data, today);
      expect(levers.length).toBeGreaterThan(0);
      for (const lever of levers) {
        expect(calculateBudget(lever.apply(data), today).dailyLimitKopecks).toBe(lever.newLimitKopecks);
      }
    }
  });

  it('a lowered percent keeps what the goal saved before today', () => {
    // 20 October, salary expected today: only the end of the period binds, (85,00) ÷ 16 = 5,31.
    const data = exampleV();
    const lever = limitLevers(data, '2026-10-20').find((l) => l.kind === 'goalPercent')!;
    expect(lever).toMatchObject({ newLimitKopecks: 687, deltaKopecks: 156 }); // 25,00 less set aside from the salary
    expect(lever.apply(data).goals[0]).toMatchObject({ percent: 10, startDate: '2026-10-20', initialSavedKopecks: 3300 });
    // On 6 October the 20 October checkpoint binds, with no income before it: lowering the percent does not help.
    expect(limitLevers(data, '2026-10-06').some((l) => l.kind === 'goalPercent')).toBe(false);
  });

  it('no lever below 1 % and none that does not raise the limit', () => {
    const data = exampleV();
    data.goals = [{ ...headphonesPercent, percent: 1 }];
    data.settings.cushion = percentCushion(1, 5000, '2026-10-05');
    expect(limitLevers(data, '2026-10-05').map((l) => l.kind)).toEqual(['reserve', 'reserve']);
    // Short of 79,11: no single step closes it, the limit stays 0.
    expect(limitLevers(exampleA({ balanceKopecks: 25000 }), '2026-09-26')).toEqual([]);
  });
});
