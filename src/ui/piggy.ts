import { formatMoney } from '../domain/money';

// Update 2 «Свинка»: the piggy bank of the «Копилка» tab. The level of coins inside, when a coin drops
// and the confetti of a full piggy. Pure, so the geometry and the choices are tested without a browser.

/** The drawing is 240×200 (viewBox); the body is an ellipse the coins are clipped to. */
export const PIGGY_WIDTH = 240;
export const PIGGY_HEIGHT = 200;
export const PIGGY_STROKE = 12;
export const PIGGY_BODY = { cx: 122, cy: 112, rx: 82, ry: 62 } as const;

/** Inside the outline: the stroke is centred on the body's edge. */
const INNER_TOP = PIGGY_BODY.cy - PIGGY_BODY.ry + PIGGY_STROKE / 2;
const INNER_BOTTOM = PIGGY_BODY.cy + PIGGY_BODY.ry - PIGGY_STROKE / 2;

/** How far the coins on top of the pile stick up above the level. */
export const COIN_PILE = 8;

/** Level of a piggy without targets: a few coins for the look. */
export const DECOR_LEVEL = 0.2;
/** A little money still shows; not full yet leaves a gap under the back. */
export const MIN_LEVEL = 0.1;
export const MAX_LEVEL = 0.88;

/** 0..1 of the body the coins fill for `fill` (saved of all targets); `full` fills it to the top. */
export function piggyLevel(fill: number | null, full = false): number {
  if (full) return 1;
  if (fill === null) return DECOR_LEVEL;
  if (!(fill > 0)) return 0;
  if (fill >= 1) return 1;
  return Math.min(MAX_LEVEL, Math.max(MIN_LEVEL, fill));
}

/**
 * The y of the top of the coins in the drawing. Empty: the pile is below the outline, unseen;
 * full: above the back, so no gap is left; in between the share of the inner height.
 */
export function levelTop(level: number): number {
  if (level <= 0) return INNER_BOTTOM + COIN_PILE + 2;
  if (level >= 1) return INNER_TOP - COIN_PILE - 4;
  return INNER_BOTTOM - level * (INNER_BOTTOM - INNER_TOP);
}

export interface PiggyState {
  fill: number | null;
  totalKopecks: number;
}

/** A coin drops into the slot when money went in or the piggy got fuller. */
export function dropsCoin(before: PiggyState, after: PiggyState): boolean {
  if (after.totalKopecks > before.totalKopecks) return true;
  return before.fill !== null && after.fill !== null && after.fill > before.fill;
}

/** Confetti once, when the piggy turns full; not when it opens already full. */
export function becameFull(before: boolean, after: boolean): boolean {
  return !before && after;
}

/** Whole percent for the label: never 0 with money in, never 100 before the targets are reached. */
export function fillPercent(fill: number, full = false): number {
  if (full || fill >= 1) return 100;
  if (!(fill > 0)) return 0;
  return Math.min(99, Math.max(1, Math.floor(fill * 100)));
}

/** VoiceOver: «В копилке 245 BYN, заполнено на 56%»; without targets only the sum. */
export function piggyLabel(totalKopecks: number, fill: number | null, full = false): string {
  const money = formatMoney(totalKopecks).replace(',00 ', ' ');
  if (fill === null && !full) return `В копилке ${money}`;
  return `В копилке ${money}, заполнено на ${fillPercent(fill ?? 1, full)}%`;
}

// Confetti of a full piggy

export interface ConfettiPiece {
  /** Where it flies from the slot, px: sideways, up (negative) and then down. */
  dx: number;
  up: number;
  fall: number;
  rotate: number; // degrees
  delayMs: number;
  tone: 0 | 1 | 2; // accent, its ink, the coin edge
  shape: 'strip' | 'dot';
}

export const CONFETTI_COUNT = 18;

/** A fan of pieces over the back, the same every time (no randomness, so the screen is testable). */
export function confettiPieces(count = CONFETTI_COUNT): ConfettiPiece[] {
  return Array.from({ length: count }, (_, index) => {
    // From 165° (left) to 15° (right) above the slot, every other piece further.
    const angle = ((165 - (150 * index) / Math.max(1, count - 1)) * Math.PI) / 180;
    const distance = index % 2 === 0 ? 84 : 60;
    return {
      dx: Math.round(Math.cos(angle) * distance * 1.3),
      up: -Math.round(Math.sin(angle) * distance),
      fall: 70 + (index % 3) * 18,
      rotate: (index % 2 === 0 ? 1 : -1) * (200 + (index % 4) * 70),
      delayMs: (index % 4) * 40,
      tone: (index % 3) as 0 | 1 | 2,
      shape: index % 3 === 1 ? 'dot' : 'strip',
    };
  });
}
