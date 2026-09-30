import { goalScheduleDates, movesBy, percentShare } from './budget';
import { CUSHION_NAME, targetOf, type SavingsTarget } from './jars';
import type { AppData, Goal, LocalDate, SavingsMove, Transaction } from './types';

// History of «Копилка» (update 2): stored moves plus what is computed and never stored — the shares
// of every income a percent jar took and the amounts a scheduled goal put in.

export type SavingsHistorySource = SavingsMove['source'] | 'income' | 'schedule';

export interface SavingsHistoryRow {
  key: string; // unique among the rows
  date: LocalDate;
  target: SavingsTarget;
  jarName: string;
  amountKopecks: number; // signed: + put in, − taken out
  source: SavingsHistorySource;
  label: string; // the income's name for a share, otherwise SOURCE_LABELS
  moveId: string | null; // a stored move; a round-up goes only with its expense
  transactionId: string | null; // the income of a share or the expense a round-up rounds
}

/** «+8,00 Остаток дня → Подушка», «−20,00 Забрал», «+0,70 Округление». */
export const SOURCE_LABELS: Record<Exclude<SavingsHistorySource, 'income'>, string> = {
  manual: 'Вручную',
  withdraw: 'Забрал',
  leftover: 'Остаток дня',
  period: 'Остаток периода',
  roundup: 'Округление',
  schedule: 'По расписанию',
};

type Row = SavingsHistoryRow & { createdAt: string };

function incomeName(data: AppData, t: Transaction): string {
  return data.incomeSources.find((s) => s.id === t.incomeSourceId)?.name ?? t.note ?? 'Доход';
}

/** What a step from `before` to `before + amount` adds to a jar that holds between 0 and `cap`. */
function effective(before: number, amount: number, cap: number): number {
  const held = (value: number) => Math.min(cap, Math.max(0, value));
  return held(before + amount) - held(before);
}

/**
 * Rows of the percent shares a jar took from the incomes dated from `since` on. The shares count up
 * from the jar's `base` with its moves, and the jar never goes above `cap`.
 */
function shareRows(
  data: AppData,
  incomes: Transaction[],
  jar: { target: SavingsTarget; name: string; goalId: string | null; percent: number; base: number; since: LocalDate; cap: number },
): Row[] {
  const rows: Row[] = [];
  let shares = 0;
  for (const t of incomes) {
    if (t.date < jar.since) continue;
    const share = percentShare(t.amountKopecks, jar.percent);
    const amountKopecks = effective(jar.base + shares + movesBy(data, jar.goalId, t.date), share, jar.cap);
    shares += share;
    if (amountKopecks <= 0) continue;
    rows.push({
      key: `income:${t.id}:${jar.goalId ?? 'cushion'}`,
      date: t.date,
      createdAt: t.createdAt,
      target: jar.target,
      jarName: jar.name,
      amountKopecks,
      source: 'income',
      label: incomeName(data, t),
      moveId: null,
      transactionId: t.id,
    });
  }
  return rows;
}

function scheduleRows(data: AppData, goal: Goal, today: LocalDate): Row[] {
  const schedule = goal.schedule!;
  const rows: Row[] = [];
  goalScheduleDates(schedule, goal.startDate, today).forEach((date, index) => {
    const before = goal.initialSavedKopecks + schedule.amountKopecks * index + movesBy(data, goal.id, date);
    const amountKopecks = effective(before, schedule.amountKopecks, goal.targetKopecks);
    if (amountKopecks <= 0) return;
    rows.push({
      key: `schedule:${goal.id}:${date}`,
      date,
      createdAt: '', // before everything else of the day
      target: { goalId: goal.id },
      jarName: goal.name,
      amountKopecks,
      source: 'schedule',
      label: SOURCE_LABELS.schedule,
      moveId: null,
      transactionId: null,
    });
  });
  return rows;
}

/**
 * «История» of «Копилка», newest first, up to today: the stored moves of the cushion and the active
 * goals, every income's share of each percent jar («+45,00 Стипендия → Наушники») and every amount a
 * scheduled goal put in («+50,00 По расписанию → Поездка»). Computed rows start on the day the jar started
 * (a goal's startDate, the percent cushion's sinceDate) and show what the jar actually took: a full goal
 * takes nothing.
 */
export function savingsHistory(data: AppData, today: LocalDate): SavingsHistoryRow[] {
  const goals = data.goals.filter((g) => g.status === 'active');
  const names = new Map<string | null, string>([[null, CUSHION_NAME], ...goals.map((g): [string, string] => [g.id, g.name])]);
  const rows: Row[] = [];
  for (const m of data.savingsMoves) {
    const jarName = names.get(m.goalId);
    if (m.date > today || jarName === undefined) continue;
    rows.push({
      key: `move:${m.id}`,
      date: m.date,
      createdAt: m.createdAt,
      target: targetOf(m.goalId),
      jarName,
      amountKopecks: m.amountKopecks,
      source: m.source,
      label: SOURCE_LABELS[m.source],
      moveId: m.id,
      transactionId: m.transactionId,
    });
  }
  const incomes = data.transactions
    .filter((t) => t.type === 'income' && t.date <= today)
    .sort((a, b) => (a.date !== b.date ? (a.date < b.date ? -1 : 1) : a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));
  const cushion = data.settings.cushion;
  if (cushion.mode === 'percent') {
    rows.push(
      ...shareRows(data, incomes, {
        target: { cushion: true },
        name: CUSHION_NAME,
        goalId: null,
        percent: cushion.percent,
        base: cushion.baseKopecks,
        since: cushion.sinceDate,
        cap: Number.POSITIVE_INFINITY,
      }),
    );
  }
  for (const goal of goals) {
    if (goal.percent !== null) {
      const jar = { target: { goalId: goal.id }, name: goal.name, goalId: goal.id, percent: goal.percent, base: goal.initialSavedKopecks };
      rows.push(...shareRows(data, incomes, { ...jar, since: goal.startDate, cap: goal.targetKopecks }));
    } else if (goal.schedule !== null) {
      rows.push(...scheduleRows(data, goal, today));
    }
  }
  // Newest first; within a day by time, the order above on a tie (stable sort).
  return rows
    .sort((a, b) => (a.date !== b.date ? (a.date < b.date ? 1 : -1) : a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0))
    .map(({ createdAt: _createdAt, ...row }) => row);
}
