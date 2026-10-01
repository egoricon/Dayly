import { deleteSavingsMove } from '../appData';
import { calculateDay } from '../domain/budget';
import {
  deadlineDailyKopecks,
  depositEffect,
  fillForecast,
  jarOf,
  jarRoom,
  jarsOf,
  putInMax,
  takeOutMax,
  targetGoalId,
  targetOf,
  withdrawEffect,
  type Jar,
  type SavingsTarget,
} from '../domain/jars';
import type { SavingsHistoryRow } from '../domain/jarHistory';
import { formatKopecks } from '../domain/money';
import { periodSavings } from '../domain/savings';
import type { AppData, LocalDate } from '../domain/types';
import { formatDayMonth } from './labels';
import { moneyInText, shortMoney, wholeMoney } from './savings';

// The «Копилка» tab of update 2 on screen: what a jar card says, the lines of the «Положить» and
// «Забрать» sheets, the history rows and when a move may be deleted. Pure, so the texts are tested
// without a browser.

const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

/** '2026-12-12' -> '12 дек'; another year than today's gets it: '12 дек 2027'. */
export function shortDate(date: LocalDate, today: LocalDate): string {
  const text = `${Number(date.slice(8, 10))} ${MONTHS_SHORT[Number(date.slice(5, 7)) - 1]}`;
  return date.slice(0, 4) === today.slice(0, 4) ? text : `${text} ${date.slice(0, 4)}`;
}

/** The goal behind a jar; undefined for the cushion. */
function goalOfJar(data: AppData, jar: Jar) {
  const goalId = targetGoalId(jar.target);
  return goalId === null ? undefined : data.goals.find((g) => g.id === goalId);
}

/** A jar with a target that holds all of it. */
export function isJarFull(jar: Jar): boolean {
  return jar.targetKopecks !== null && jar.targetKopecks > 0 && jar.savedKopecks >= jar.targetKopecks;
}

/** «80 из 150» with a target, «30,70 BYN» for the cushion without one. */
export function jarAmountText(jar: Jar): string {
  return jar.targetKopecks === null ? moneyInText(jar.savedKopecks) : `${wholeMoney(jar.savedKopecks)} из ${wholeMoney(jar.targetKopecks)}`;
}

/** For VoiceOver: «80 из 150 BYN». */
export function jarAmountLabel(jar: Jar): string {
  return jar.targetKopecks === null ? moneyInText(jar.savedKopecks) : `${wholeMoney(jar.savedKopecks)} из ${wholeMoney(jar.targetKopecks)} BYN`;
}

/** How a jar saves: «15% с поступления», «к 1 марта · 2,80 в день», «50 BYN каждую неделю», «вручную». */
export function jarWayText(data: AppData, jar: Jar, today: LocalDate): string {
  if (jar.kind === 'cushion') {
    const cushion = data.settings.cushion;
    return cushion.mode === 'percent' ? `${cushion.percent}% с поступления` : 'запас на непредвиденное';
  }
  const goal = goalOfJar(data, jar)!;
  if (goal.deadline !== null) {
    const daily = deadlineDailyKopecks(data, goal, today);
    const by = `к ${formatDayMonth(goal.deadline)}`;
    return daily > 0 && !isJarFull(jar) ? `${by} · ${formatKopecks(daily)} в день` : by;
  }
  if (goal.percent !== null) return `${goal.percent}% с поступления`;
  if (goal.schedule !== null) {
    const every = goal.schedule.weekday !== null ? 'каждую неделю' : 'каждый месяц';
    return `${shortMoney(goal.schedule.amountKopecks)} BYN ${every}`;
  }
  return 'вручную';
}

/**
 * «наполнится ~12 дек» for a jar that fills by percent or on a schedule; null for one by a date (its
 * date is in the way text), by hand, without a forecast, or already full.
 */
export function fillText(data: AppData, jar: Jar, today: LocalDate): string | null {
  if (jar.kind === 'deadline' || isJarFull(jar)) return null;
  const date = fillForecast(data, jar.target, today);
  return date === null ? null : `наполнится ~${shortDate(date, today)}`;
}

/** The keys of the jars with a target that are full today, for the piggy's cheer. */
export function fullJarKeys(data: AppData, today: LocalDate): string[] {
  return jarsOf(data, today)
    .filter(isJarFull)
    .map((j) => j.key);
}

/** «Положить»: jars that can still take money (the cushion always), in the order of the tab. */
export function putJars(data: AppData, today: LocalDate): Jar[] {
  return jarsOf(data, today).filter((j) => jarRoom(data, j.target, today) > 0);
}

/** «Забрать»: jars that hold money that may be taken. */
export function takeJars(data: AppData, today: LocalDate): Jar[] {
  return jarsOf(data, today).filter((j) => takeOutMax(data, j.target, today) > 0);
}

/** «в подушку», «в «Наушники»» */
export function intoJar(jar: Jar): string {
  return jar.kind === 'cushion' ? 'в подушку' : `в «${jar.name}»`;
}

/** «из подушки», «из «Наушники»» */
export function fromJar(jar: Jar): string {
  return jar.kind === 'cushion' ? 'из подушки' : `из «${jar.name}»`;
}

export interface MovePreview {
  /** What the sheet says under the amount, one or two lines. */
  lines: string[];
  /** The first line is a warning (red): too much, or the jar fills later or needs more a day. */
  danger: boolean;
  /** Why the button does not work yet; null when it does. */
  missing: string | null;
}

/** The lowest free money of today's checkpoints and the checkpoint it belongs to. */
function tightest(data: AppData, today: LocalDate): { freeKopecks: number; date: LocalDate } {
  const checkpoints = calculateDay(data, today).checkpoints;
  return checkpoints.reduce((min, c) => (c.freeKopecks < min.freeKopecks ? { freeKopecks: c.freeKopecks, date: c.date } : min), {
    freeKopecks: Number.POSITIVE_INFINITY,
    date: today,
  });
}

/** «Положить»: what the amount does to the limit, or why it cannot go in. */
export function putPreview(data: AppData, target: SavingsTarget, amountKopecks: number, today: LocalDate): MovePreview {
  const jar = jarOf(data, target, today);
  if (!jar) return { lines: [], danger: false, missing: 'Выбери банку' };
  const max = putInMax(data, target, today);
  const room = jarRoom(data, target, today);
  const free = tightest(data, today);
  const why =
    room <= max
      ? `В «${jar.name}» не хватает только ${moneyInText(room)}`
      : max > 0
        ? `Свободно ${moneyInText(max)}: остальное нужно до ${formatDayMonth(free.date)}`
        : `Свободных денег нет: всё нужно до ${formatDayMonth(free.date)}`;
  if (amountKopecks === 0) {
    const lines = [max > 0 ? `Можно положить до ${moneyInText(max)}` : room === 0 ? 'Банка уже полна' : why];
    return { lines, danger: false, missing: 'Набери сумму' };
  }
  if (amountKopecks > max) return { lines: [why], danger: true, missing: why };
  const effect = depositEffect(data, target, amountKopecks, today);
  return { lines: [`Лимит станет ${moneyInText(effect.limitKopecks)} в день`], danger: false, missing: null };
}

/**
 * «Забрать»: the warning first («Чтобы успеть к 1 марта, в день будет уходить 3,10 вместо 2,80»,
 * «Наполнится позже: ~20 дек вместо 12 дек»), then the new limit; or why it cannot be taken.
 */
export function takePreview(data: AppData, target: SavingsTarget, amountKopecks: number, today: LocalDate): MovePreview {
  const jar = jarOf(data, target, today);
  if (!jar) return { lines: [], danger: false, missing: 'Выбери банку' };
  const max = takeOutMax(data, target, today);
  const holds = jar.kind === 'cushion' ? `В подушке ${moneyInText(max)}` : `В «${jar.name}» ${moneyInText(max)}`;
  if (amountKopecks === 0) {
    const closed = jar.kind === 'deadline' && max === 0 && jar.savedKopecks > 0;
    return { lines: [closed ? 'Срок цели наступил: эти деньги на покупку' : holds], danger: false, missing: 'Набери сумму' };
  }
  if (amountKopecks > max) {
    const why = `Можно забрать не больше ${moneyInText(max)}`;
    return { lines: [why], danger: true, missing: why };
  }
  const effect = withdrawEffect(data, target, amountKopecks, today);
  const lines: string[] = [];
  const goal = goalOfJar(data, jar);
  if (effect.dailyKopecks && goal?.deadline && effect.dailyKopecks.after !== effect.dailyKopecks.before) {
    lines.push(
      `Чтобы успеть к ${formatDayMonth(goal.deadline)}, в день будет уходить ${formatKopecks(effect.dailyKopecks.after)} вместо ${formatKopecks(effect.dailyKopecks.before)}`,
    );
  }
  const fill = effect.fillDate;
  if (fill && fill.before !== null && fill.after !== fill.before) {
    lines.push(
      fill.after === null
        ? `Наполнится позже: не раньше чем через 3 года, а не ~${shortDate(fill.before, today)}`
        : `Наполнится позже: ~${shortDate(fill.after, today)} вместо ${shortDate(fill.before, today)}`,
    );
  }
  lines.push(`Лимит станет ${moneyInText(effect.limitKopecks)} в день`);
  return { lines, danger: lines.length > 1, missing: null };
}

// The piggy's lines

/** «В копилке 245 BYN» and «в этом периоде +45 из 110» (null when the period plans nothing). */
export function savingsSummary(data: AppData, today: LocalDate, totalKopecks: number): { total: string; period: string | null } {
  const { savedKopecks, plannedKopecks } = periodSavings(data, today);
  const sign = savedKopecks < 0 ? '−' : '+';
  const period =
    plannedKopecks > 0 || savedKopecks !== 0
      ? `в этом периоде ${sign}${wholeMoney(Math.abs(savedKopecks))} из ${wholeMoney(Math.max(0, plannedKopecks))}`
      : null;
  return { total: `В копилке ${shortMoney(totalKopecks)} BYN`, period };
}

// History

/** «Стипендия → Наушники», «Остаток дня → Подушка», «Забрал из подушки», «Забрал · Велосипед». */
export function historyRowText(row: SavingsHistoryRow): string {
  if (row.source === 'withdraw') return 'cushion' in row.target ? 'Забрал из подушки' : `Забрал · ${row.jarName}`;
  return `${row.label} → ${row.jarName}`;
}

/** «+20,00», «−15,00» */
export function signedKopecks(kopecks: number): string {
  return kopecks > 0 ? `+${formatKopecks(kopecks)}` : formatKopecks(kopecks);
}

/** Only what the student did by hand opens «Удалить»: shares, schedules, round-ups and leftovers do not. */
export function isDeletableRow(row: SavingsHistoryRow): boolean {
  return row.moveId !== null && (row.source === 'manual' || row.source === 'withdraw');
}

export type MoveDeletion = { ok: true; limitKopecks: number } | { ok: false; text: string };

/**
 * Whether a move may be deleted: not when that leaves less money than the checkpoints need (taking back
 * a «Забрал» puts the money into the jar again, and it may already be spent). Otherwise the new limit.
 */
export function moveDeletion(data: AppData, moveId: string, today: LocalDate): MoveDeletion {
  const after = deleteSavingsMove(data, moveId);
  if (after === data) return { ok: false, text: 'Это движение удаляется только вместе с тратой' };
  const before = tightest(data, today);
  const worst = tightest(after, today);
  if (worst.freeKopecks < 0 && worst.freeKopecks < before.freeKopecks) {
    return {
      ok: false,
      text: `Удалить нельзя: эти деньги уже в лимите, без них до ${formatDayMonth(worst.date)} не хватит ${moneyInText(-worst.freeKopecks)}`,
    };
  }
  return { ok: true, limitKopecks: calculateDay(after, today).dailyLimitKopecks };
}

// Rounding up

/**
 * What «Как копим» says under «Округлять траты до 1 BYN»: where the rest goes, or that it goes nowhere
 * while the chosen goal is full. Null when rounding up is off.
 */
export function roundUpNote(data: AppData, today: LocalDate): string | null {
  const roundUp = data.settings.roundUp;
  if (roundUp === null) return null;
  const jar = jarOf(data, targetOf(roundUp.goalId), today);
  if (!jar) return null;
  if (jar.kind !== 'cushion' && jarRoom(data, jar.target, today) === 0) return `«${jar.name}» уже полна: пока округление не откладывается`;
  return `Трата 4,30 → 0,70 ${intoJar(jar)}`;
}
