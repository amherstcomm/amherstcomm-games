// Every list and theme at once, over a range of days.
//
// The check worth the most is the per-length one. A day is not themed or
// unthemed: the generator draws a board for each of ten word lengths and takes
// the theme's own words *of that length*, so a list of six-letter words themes
// one board in ten and leaves nine ordinary. That has no other symptom — the
// month simply reads as though the theme barely showed up.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error plain-JS module without a declaration file
import { themedPool } from '../../scripts/themedDaily.mjs';
import { GUESS_LENGTHS, runsOf, summarise, tilesFor, yieldOf, type CoverageDay } from '@/coverage';

const list = (date: string, words: string[], name = 'October'): CoverageDay => ({
  date,
  theme: words.length > 0 ? { name, words } : null,
  weave: [],
});

const october = (n: number) => `2026-10-${String(n).padStart(2, '0')}`;

describe('the lengths a day is themed for', () => {
  // A copied number is a number to be wrong, so this reads the generator's own
  // loop rather than trusting the constant beside it.
  it('are the generator s own', () => {
    const gen = readFileSync(join(process.cwd(), 'scripts/fetch-puzzles.mjs'), 'utf8');
    const loop = gen.match(/for \(let len = (\d+); len <= (\d+); len\+\+\)/);
    expect(loop, 'the guess length loop moved or changed shape').not.toBeNull();
    const [, first, last] = loop!;
    expect(GUESS_LENGTHS[0]).toBe(Number(first));
    expect(GUESS_LENGTHS.at(-1)).toBe(Number(last));
    expect(GUESS_LENGTHS).toHaveLength(Number(last) - Number(first) + 1);
  });

  // And the other half of the same rule: what counts as themed for a length is
  // whatever themedPool would hand the generator. Asserted against the
  // generator's own function, because two implementations of one rule agree
  // right up until somebody changes one of them.
  it('and a length is themed exactly when the generator has words for it', () => {
    const words = ['esop', 'shares', 'equity', 'dividend'];
    const { pools } = yieldOf(words);
    for (const len of GUESS_LENGTHS) {
      expect(pools[len] > 0, `${len} letters`).toBe(themedPool(words, len, null).length > 0);
    }
  });
});

describe('summarise', () => {
  it('counts the days a list covers and names the ones it does not', () => {
    const sum = summarise([
      list(october(1), ['shares', 'esop']),
      list(october(2), []),
      list(october(3), []),
      list(october(4), ['shares', 'esop']),
    ]);
    expect(sum.days).toBe(4);
    expect(sum.themed).toBe(2);
    expect(sum.gaps).toEqual([october(2), october(3)]);
  });

  // The finding the whole panel exists for: plenty of words, one length.
  it('shows a list of sixes theming one board in ten', () => {
    const sum = summarise(
      [1, 2, 3].map((n) => list(october(n), ['shares', 'equity', 'buyout', 'payout']))
    );
    const themed = sum.lengths.filter((l) => l.days > 0);
    expect(themed).toHaveLength(1);
    expect(themed[0].length).toBe(6);
    expect(themed[0].days).toBe(3);
    expect(themed[0].smallest).toBe(4);
  });

  // Fewer words than days means the same answer comes round again — and the
  // draw is per day rather than a rotation, so it can come round tomorrow.
  it('and reports the smallest pool a length draws from', () => {
    const sum = summarise([
      list(october(1), ['esop', 'gain', 'vote']),
      // A second list covering the day widens it; the day that has only the
      // first is the one that decides what "will repeat" means.
      list(october(2), ['esop']),
    ]);
    const four = sum.lengths.find((l) => l.length === 4)!;
    expect(four.days).toBe(2);
    expect(four.smallest).toBe(1);
  });

  it('sees a day whose lists are all empty as no day at all', () => {
    const sum = summarise([list(october(1), [])]);
    expect(sum.themed).toBe(0);
    expect(sum.boxes.days).toBe(0);
    expect(sum.bridges.days).toBe(0);
  });

  it('counts the days that can make a box', () => {
    const sum = summarise([
      list(october(1), ['voting', 'shared']),
      list(october(2), ['stake', 'stack']),
    ]);
    expect(sum.boxes.days).toBe(1);
    // Unknown rather than nought until the dictionary is in hand.
    expect(sum.boxes.playable).toBeNull();
  });
});

describe('the Weave half', () => {
  const profit = {
    clue: 'Profit sharing',
    spangram: 'profitsharing',
    words: ['metrics', 'payout', 'reward', 'target', 'bonus', 'split'],
  };

  it('says which boards a day s themes tile', () => {
    // 13 + 35 = 48, the easy board exactly; the bigger two need more letters
    // than these words have.
    expect(tilesFor([profit])).toEqual(['easy']);
  });

  it('and a day with themes that tile nothing is a curated day, not a lost one', () => {
    const short = { clue: 'Thin', spangram: 'profitsharing', words: ['bonus'] };
    const sum = summarise([
      { date: october(1), theme: null, weave: [profit] },
      { date: october(2), theme: null, weave: [short] },
      { date: october(3), theme: null, weave: [] },
    ]);
    expect(sum.weave.withTheme).toBe(2);
    expect(sum.weave.tiling).toBe(1);
    expect(sum.weave.gaps).toEqual([october(2), october(3)]);
    expect(sum.weave.perTier.easy).toBe(1);
    expect(sum.weave.perTier.extreme).toBe(0);
  });
});

describe('runsOf', () => {
  it('joins consecutive days and leaves the rest alone', () => {
    expect(runsOf([october(1), october(2), october(3), october(9), october(11), october(12)])).toEqual(
      [`${october(1)}–${october(3)}`, october(9), `${october(11)}–${october(12)}`]
    );
  });

  it('crosses a month boundary, where a day-number comparison would not', () => {
    expect(runsOf(['2026-10-31', '2026-11-01'])).toEqual(['2026-10-31–2026-11-01']);
  });

  it('has nothing to say about nothing', () => {
    expect(runsOf([])).toEqual([]);
  });
});
