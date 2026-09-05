// Whether a Weave theme can actually build a board.
//
// The case that matters is the one that surprises people: a theme with plenty
// of letters and no exact combination. Weave tiles the whole grid, so the words
// have to sum *exactly* to the cells the spangram leaves — forty-eight letters
// in sixes and sevens cannot make thirty-five, however many of them there are.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BOARD_CELLS, canMakeExactly, fitsBoard, fitsBoards } from '@/weaveFit';

// Ray's own example, which tiles the easy board exactly: a 13-letter spangram
// and 35 letters of words for 48 cells.
const PROFIT = {
  spangram: 'profitsharing',
  words: ['metrics', 'payout', 'reward', 'target', 'bonus', 'split'],
};

describe('the board sizes', () => {
  // The client cannot import the generator, so the numbers are copied — and a
  // copied number is one to be wrong. This reads the generator's own.
  it('are the generator s own', () => {
    const gen = readFileSync(join(process.cwd(), 'scripts/fetch-puzzles.mjs'), 'utf8');
    const shape = gen.match(/const WEAVE_SHAPE = \{([^}]+)\}/);
    expect(shape, 'WEAVE_SHAPE moved or changed shape').not.toBeNull();
    const cells: Record<string, number> = {};
    for (const [, tier, w, h] of shape![1].matchAll(/(\w+):\s*\[(\d+),\s*(\d+)\]/g)) {
      cells[tier] = Number(w) * Number(h);
    }
    expect(cells).toEqual(BOARD_CELLS);
  });
});

describe('canMakeExactly', () => {
  it('finds a combination when there is one', () => {
    expect(canMakeExactly([7, 6, 6, 6, 5, 5], 35)).toBe(true);
  });

  // Plenty of letters, no exact fit — the failure a letter count cannot see.
  it('and says so when the letters are there but the sum is not', () => {
    expect(canMakeExactly([6, 6, 6, 6, 6, 6], 35)).toBe(false);
    expect(canMakeExactly([6, 6, 6, 6, 6, 6], 36)).toBe(true);
  });

  it('uses each word at most once', () => {
    expect(canMakeExactly([5], 10)).toBe(false);
  });

  it('and nothing sums to nothing', () => {
    expect(canMakeExactly([], 0)).toBe(true);
    expect(canMakeExactly([], 7)).toBe(false);
  });
});

describe('fitsBoard', () => {
  it('accepts a theme that tiles exactly', () => {
    const fit = fitsBoard(PROFIT.spangram, PROFIT.words, BOARD_CELLS.easy);
    expect(fit.fits).toBe(true);
    expect(fit.needed).toBe(35);
  });

  // The same theme against a bigger board: 63 cells, 50 to cover, 35 available.
  it('and says how far short it is for a bigger one', () => {
    const fit = fitsBoard(PROFIT.spangram, PROFIT.words, BOARD_CELLS.hard);
    expect(fit.fits).toBe(false);
    expect(fit.why).toMatch(/15 letters short/);
  });

  it('names the exact-fit problem rather than calling it short', () => {
    // Six six-letter words: 36 letters for 35 squares. Enough, and the sums
    // available are 6, 12, 18, 24, 30, 36 — never 35. This is the failure a
    // letter count cannot see, and the first version of this test did not
    // reproduce it: five seven-letter words total 35 and fit perfectly.
    const sixes = ['payout', 'reward', 'target', 'shares', 'profit', 'equity'];
    const fit = fitsBoard('profitsharing', sixes, 48);
    expect(fit.fits).toBe(false);
    expect(fit.why).toMatch(/exactly 35/);
  });

  it('refuses a spangram of the wrong length', () => {
    expect(fitsBoard('short', PROFIT.words, BOARD_CELLS.easy).why).toMatch(/6–16/);
  });

  // It threads corner to corner, so it cannot be shorter than the board is wide.
  it('and one that cannot reach across the board', () => {
    expect(fitsBoard('profit', PROFIT.words, BOARD_CELLS.extreme).why).toMatch(/8 columns/);
  });

  it('ignores words the board cannot hold', () => {
    const fit = fitsBoard(PROFIT.spangram, [...PROFIT.words, 'ox', 'extraordinarily'], 48);
    expect(fit.fits).toBe(true);
  });

  it('and the spangram, which is placed separately', () => {
    const fit = fitsBoard(PROFIT.spangram, [...PROFIT.words, PROFIT.spangram], 48);
    expect(fit.fits).toBe(true);
  });
});

describe('fitsBoards', () => {
  it('answers for every difficulty at once', () => {
    const all = fitsBoards(PROFIT.spangram, PROFIT.words);
    expect(all.easy.fits).toBe(true);
    expect(all.hard.fits).toBe(false);
    expect(all.extreme.fits).toBe(false);
  });
});
