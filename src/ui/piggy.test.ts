import { describe, expect, it } from 'vitest';
import {
  becameFull,
  COIN_PILE,
  confettiPieces,
  CONFETTI_COUNT,
  DECOR_LEVEL,
  dropsCoin,
  fillPercent,
  levelTop,
  MAX_LEVEL,
  MIN_LEVEL,
  PIGGY_BODY,
  PIGGY_STROKE,
  piggyLabel,
  piggyLevel,
} from './piggy';

// Update 2 «Свинка»: the level of coins, when a coin drops, the confetti and the VoiceOver label.

const innerTop = PIGGY_BODY.cy - PIGGY_BODY.ry + PIGGY_STROKE / 2;
const innerBottom = PIGGY_BODY.cy + PIGGY_BODY.ry - PIGGY_STROKE / 2;

describe('level of coins', () => {
  it('follows the share saved of all targets', () => {
    expect(piggyLevel(0.3)).toBe(0.3);
    expect(piggyLevel(0.56)).toBe(0.56);
  });

  it('is empty with nothing saved and to the top when full', () => {
    expect(piggyLevel(0)).toBe(0);
    expect(piggyLevel(-0.2)).toBe(0);
    expect(piggyLevel(1)).toBe(1);
    expect(piggyLevel(1.4)).toBe(1);
    expect(piggyLevel(0.4, true)).toBe(1);
  });

  it('shows a little money and keeps a gap until the targets are reached', () => {
    expect(piggyLevel(0.004)).toBe(MIN_LEVEL);
    expect(piggyLevel(0.97)).toBe(MAX_LEVEL);
    expect(MAX_LEVEL).toBeLessThan(1);
  });

  it('without targets a few coins are drawn for the look', () => {
    expect(piggyLevel(null)).toBe(DECOR_LEVEL);
    expect(piggyLevel(null, true)).toBe(1);
  });
});

describe('top of the coins in the drawing', () => {
  it('empty: the pile stays below the outline', () => {
    expect(levelTop(0) - COIN_PILE).toBeGreaterThan(innerBottom);
  });

  it('full: the pile is above the back, so no gap is left', () => {
    expect(levelTop(1) + COIN_PILE).toBeLessThan(innerTop);
  });

  it('half: the middle of the body; it rises steadily with the level', () => {
    expect(levelTop(0.5)).toBe(PIGGY_BODY.cy);
    const tops = [0, MIN_LEVEL, 0.3, 0.56, MAX_LEVEL, 1].map(levelTop);
    expect([...tops].sort((a, b) => b - a)).toEqual(tops);
    expect(new Set(tops).size).toBe(tops.length);
  });

  it('a little money is seen above the outline, not full leaves room under the back', () => {
    expect(levelTop(MIN_LEVEL)).toBeLessThan(innerBottom - COIN_PILE);
    expect(levelTop(MAX_LEVEL) - COIN_PILE).toBeGreaterThan(innerTop);
  });
});

describe('a coin drops into the slot', () => {
  it('when money went in or the piggy got fuller', () => {
    expect(dropsCoin({ fill: 0.3, totalKopecks: 4500 }, { fill: 0.4, totalKopecks: 6000 })).toBe(true);
    expect(dropsCoin({ fill: null, totalKopecks: 0 }, { fill: null, totalKopecks: 2000 })).toBe(true);
    expect(dropsCoin({ fill: 1, totalKopecks: 15000 }, { fill: 1, totalKopecks: 17000 })).toBe(true);
    expect(dropsCoin({ fill: 0.5, totalKopecks: 5000 }, { fill: 0.6, totalKopecks: 5000 })).toBe(true);
  });

  it('not when money was taken out, a target was raised or nothing changed', () => {
    expect(dropsCoin({ fill: 0.4, totalKopecks: 6000 }, { fill: 0.3, totalKopecks: 4000 })).toBe(false);
    expect(dropsCoin({ fill: 1, totalKopecks: 15000 }, { fill: 0.75, totalKopecks: 15000 })).toBe(false);
    expect(dropsCoin({ fill: 0.56, totalKopecks: 24500 }, { fill: 0.56, totalKopecks: 24500 })).toBe(false);
    expect(dropsCoin({ fill: null, totalKopecks: 3000 }, { fill: 0.2, totalKopecks: 3000 })).toBe(false);
  });
});

describe('full piggy', () => {
  it('cheers once, on the turn to full', () => {
    expect(becameFull(false, true)).toBe(true);
    expect(becameFull(true, true)).toBe(false);
    expect(becameFull(true, false)).toBe(false);
    expect(becameFull(false, false)).toBe(false);
  });

  it('confetti fly up from the slot to both sides, the same every time', () => {
    const pieces = confettiPieces();
    expect(pieces).toHaveLength(CONFETTI_COUNT);
    expect(confettiPieces()).toEqual(pieces);
    expect(pieces.every((piece) => piece.up < 0 && piece.fall > 0)).toBe(true);
    expect(pieces.filter((piece) => piece.dx < 0).length).toBe(CONFETTI_COUNT / 2);
    expect(new Set(pieces.map((piece) => piece.tone))).toEqual(new Set([0, 1, 2]));
  });
});

describe('VoiceOver label', () => {
  it('the sum and how full it is', () => {
    expect(piggyLabel(24500, 0.56)).toBe('В копилке 245 BYN, заполнено на 56%');
    expect(piggyLabel(4550, 0.303)).toBe('В копилке 45,50 BYN, заполнено на 30%');
    expect(piggyLabel(102000, 0.5)).toBe('В копилке 1 020 BYN, заполнено на 50%');
  });

  it('without targets only the sum', () => {
    expect(piggyLabel(24500, null)).toBe('В копилке 245 BYN');
    expect(piggyLabel(0, null)).toBe('В копилке 0 BYN');
  });

  it('never 0% with money in, never 100% before the targets are reached', () => {
    expect(fillPercent(0.004)).toBe(1);
    expect(fillPercent(0.996)).toBe(99);
    expect(fillPercent(0)).toBe(0);
    expect(fillPercent(1)).toBe(100);
    expect(piggyLabel(30000, 1, true)).toBe('В копилке 300 BYN, заполнено на 100%');
  });
});
