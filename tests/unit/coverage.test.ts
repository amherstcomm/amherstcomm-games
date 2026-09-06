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
import { themedHiveBases, themedPool, themedRackBases } from '../../scripts/themedDaily.mjs';
import {
  canSeedHive,
  ciphersFor,
  GUESS_LENGTHS,
  RACK_SIZE,
  runsOf,
  SLICE,
  squaresFor,
  SQUARE_SEEDS,
  summarise,
  summariseSlowly,
  tilesFor,
  yieldOf,
  type CoverageDay,
} from '@/coverage';

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
      // payouts → sharing chains and covers twelve distinct letters; the pair
      // below neither chains nor reaches twelve.
      list(october(1), ['payouts', 'sharing']),
      list(october(2), ['stake', 'stack']),
    ]);
    expect(sum.boxes.days).toBe(1);
    // The chain is the answer, so how few words it takes is known without a
    // dictionary — there is nothing left to look up.
    expect(sum.boxes.shortest).toBe(2);
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

// The two boards a theme can be built *from*. Both rules live in the generator;
// what is asserted here is that the page's copy answers the same, word for
// word, rather than agreeing today and drifting the first time one is changed.
describe('the boards a theme can seed', () => {
  const words = ['employer', 'payouts', 'buyout', 'shares', 'dividend', 'trustee', 'ownership'];

  it('takes the rack size from the generator', () => {
    const gen = readFileSync(join(process.cwd(), 'scripts/fetch-puzzles.mjs'), 'utf8');
    const size = gen.match(/const RACK_SIZE = (\d+);/);
    expect(size, 'RACK_SIZE moved or changed shape').not.toBeNull();
    expect(RACK_SIZE).toBe(Number(size![1]));
  });

  it('counts exactly the racks the generator would shuffle', () => {
    expect(yieldOf(words).racks).toBe(themedRackBases(words, RACK_SIZE, null).length);
    // And it is a real count rather than nought agreeing with nought.
    expect(yieldOf(words).racks).toBeGreaterThan(0);
  });

  it('and exactly the pangram bases it would seed a hive from', () => {
    expect(words.filter(canSeedHive)).toEqual(themedHiveBases(words, null));
    // Refused for two different reasons, both of them the generator's:
    // `payouts` has seven distinct letters and an s, which would flood the
    // answer list with plurals; `ownership` has nine distinct and cannot be a
    // hive at all. Dropping either rule would count a day that cannot be built.
    expect(words.filter(canSeedHive)).toEqual(['employer']);
  });

  it('and a month of six-letter words can seed neither', () => {
    const sum = summarise([1, 2, 3].map((n) => list(october(n), ['shares', 'payout', 'equity'])));
    expect(sum.scramble.days).toBe(0);
    expect(sum.hive.days).toBe(0);
  });

  it('while one that can says which days', () => {
    const sum = summarise([
      list(october(1), ['employer', 'payouts']),
      list(october(2), ['shares']),
    ]);
    expect(sum.scramble.days).toBe(1);
    expect(sum.hive.days).toBe(1);
  });
});

// Why there are two ways to ask the same question.
//
// Measured, not guessed at: a month of two overlapping lists is a month of
// different unions, and working them all out in one go held the page still for
// six seconds. That is what "coverage locks up the browser" was.
describe('measuring without holding the page still', () => {
  const month = Array.from({ length: 9 }, (_, i) =>
    // A different union every day, which is what overlapping lists produce and
    // the case where nothing can be reused.
    list(october(i + 1), ['voting', 'shared', 'esop', `filler${i}`])
  );

  it('gets the answer the all-at-once version gets', async () => {
    const slowly = await summariseSlowly(month, undefined, undefined, async () => {});
    expect(slowly).toEqual(summarise(month));
  });

  // The rule changed when the square search moved in here: a day whose words
  // have not been measured can cost a second and a half on its own, so a slice
  // of four of them is six seconds of held page -- exactly the thing the
  // slicing was written to stop. So a day that actually worked hands the
  // browser back on its own, and the slice of four is what carries a run of
  // days that were free.
  it('and hands the browser back after every day it actually measures', async () => {
    let breaths = 0;
    await summariseSlowly(month, undefined, undefined, async () => {
      breaths += 1;
    });
    // Nine different lists is nine measurements, and no pause after the last:
    // a frame spent with nothing left to do.
    expect(breaths).toBe(month.length - 1);
  });

  it('and not for the days it already knows the answer for', async () => {
    // One list all month, which is what a themed October actually looks like:
    // the measurement happens once and the rest are memo hits, so the pausing
    // falls back to the slice.
    const repeated = Array.from({ length: 9 }, (_, i) =>
      list(october(i + 1), ['voting', 'shared', 'esop'])
    );
    let breaths = 0;
    await summariseSlowly(repeated, undefined, undefined, async () => {
      breaths += 1;
    });
    // The first day is fresh; after that only the slice boundaries.
    expect(breaths).toBe(1 + Math.floor((repeated.length - 1) / SLICE));
  });

  it('and says how far it has got', async () => {
    const seen: number[] = [];
    await summariseSlowly(month, undefined, (n, total) => {
      expect(total).toBe(month.length);
      seen.push(n);
    }, async () => {});
    expect(seen).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('and pauses once for a short range of one list, not once a day', async () => {
    // Days that are all the same list: one measurement to hand the browser
    // back after, and four days is inside the slice, so nothing else.
    let breaths = 0;
    const same = Array.from({ length: SLICE }, (_, i) => list(october(i + 1), ['voting', 'shared']));
    await summariseSlowly(same, undefined, undefined, async () => {
      breaths += 1;
    });
    expect(breaths).toBe(1);
  });
});

// The cryptogram half, which is per difficulty for the same reason the daily
// word is per length: the bands differ, so a month of long passages themes two
// tiers of three and leaves the last on the curated pool.
describe('passages of the deployment s own', () => {
  const long = {
    text: 'We own this place together, and every share of it was earned here.',
    author: 'The charter',
    letters: 52,
  };
  const short = { text: 'One share each, and the year we all earned it here.', author: null, letters: 39 };
  const unusable = { text: 'Far too short.', author: null, letters: 12 };

  const day = (n: number, passages: typeof long[]): CoverageDay => ({
    date: october(n),
    theme: null,
    weave: [],
    passages,
  });

  it('says which difficulties a day s passages can play', () => {
    expect(ciphersFor([long])).toEqual(['easy', 'hard']);
    expect(ciphersFor([short])).toEqual(['extreme']);
    expect(ciphersFor([long, short])).toEqual(['easy', 'hard', 'extreme']);
    expect(ciphersFor([])).toEqual([]);
  });

  it('counts the days that play one, per tier', () => {
    const sum = summarise([day(1, [long]), day(2, [long, short]), day(3, [])]);
    expect(sum.cryptogram.days).toBe(2);
    expect(sum.cryptogram.perTier.easy).toBe(2);
    expect(sum.cryptogram.perTier.extreme).toBe(1);
  });

  // The failure that looks like success, and the reason the two counts are
  // separate: a passage was written for the day, and no board can take it.
  it('and separates a day with a passage from a day with a usable one', () => {
    const sum = summarise([day(1, [unusable]), day(2, [long])]);
    expect(sum.cryptogram.withPassage).toBe(2);
    expect(sum.cryptogram.days).toBe(1);
  });

  // Most of the year, and the shape the server sends before anybody writes one.
  it('copes with a day that has no passages field at all', () => {
    const sum = summarise([list(october(1), ['shares'])]);
    expect(sum.cryptogram.withPassage).toBe(0);
    expect(sum.cryptogram.days).toBe(0);
  });
});

// The ladder half. Both ends have to be the theme's own *and* words the board
// accepts as rungs, so this is the one measurement that needs the everyday
// dictionary rather than the generation pool — and the one that reports
// "unknown" rather than nought until it arrives.
describe('themed ladders, over a range', () => {
  const rungs = new Set(['stake', 'stoke', 'stock', 'store', 'stole', 'stale', 'shale', 'share']);

  it('says which tiers a day s words can set a pair for', () => {
    // stake → stoke → stock is two steps, which is under the shortest par any
    // tier plays; stake → stale → shale → share is three, which easy plays.
    const sum = summarise(
      [list(october(1), ['stake', 'share']), list(october(2), ['stake'])],
      undefined,
      rungs
    );
    expect(sum.ladder.days).toBe(1);
    expect(sum.ladder.perTier.easy).toBe(1);
    expect(sum.ladder.perTier.extreme).toBe(0);
  });

  // Nought would read as "no day can set a ladder", which is a different
  // answer from "nobody has asked yet".
  it('and reports it as unknown until the rungs arrive', () => {
    const sum = summarise([list(october(1), ['stake', 'share'])]);
    expect(sum.ladder.days).toBeNull();
  });

  it('and the sliced version gets there too', async () => {
    const days = [list(october(1), ['stake', 'share']), list(october(2), ['stake', 'share'])];
    const slowly = await summariseSlowly(days, undefined, undefined, async () => {}, rungs);
    expect(slowly).toEqual(summarise(days, undefined, rungs));
    expect(slowly.ladder.days).toBe(2);
  });
});

// Themed squares, over a range.
//
// The question is whether a theme word can *head* a square, not whether one
// turns up in a square by accident -- the second was measured at 0 of 200 and
// is the answer to the wrong question. So a day counts when one of its own
// words tops a board the dictionary can finish.
describe('themed squares, over a range', () => {
  // A real 4x4 double word square, taken out of the everyday pool: vote / idea
  // / soar / arks across, visa / odor / teak / ears down. The dictionary here
  // is those eight words and nothing else, so the search either finds this
  // board or finds none.
  const square = ['vote', 'idea', 'soar', 'arks'];
  const dictionary = [...square, 'visa', 'odor', 'teak', 'ears'];

  it('says which sizes a day s own words can head', () => {
    const sum = summarise([list(october(1), ['vote']), list(october(2), ['payouts'])], dictionary);
    expect(sum.squares.days).toBe(1);
    expect(sum.squares.perSize[4]).toBe(1);
    expect(sum.squares.perSize[5]).toBe(0);
  });

  it('and reports it as unknown until the dictionary arrives', () => {
    // Nought would read as "no day can head a square", which is a different
    // answer from "nobody has looked yet" -- the same distinction the ladder
    // count makes.
    const sum = summarise([list(october(1), ['vote'])]);
    expect(sum.squares.days).toBeNull();
    expect(squaresFor(['vote'])).toBeNull();
  });

  it('and only tries as many words as it says it will', () => {
    // The cap is what keeps a long list from holding the page: ruling a word
    // out at 5x5 costs about 70ms, so an uncapped list of them is seconds. It
    // bounds the misses only -- a hit stops the search -- and the limit of the
    // claim is that "no" means no from the first SQUARE_SEEDS words of that
    // length.
    const filler = Array.from({ length: SQUARE_SEEDS }, (_, i) =>
      `qqa${String.fromCharCode(97 + i)}`
    );
    expect(squaresFor([...filler, 'vote'], dictionary)).toEqual([]);
    // The same word, inside the allowance, is found.
    expect(squaresFor([...filler.slice(0, SQUARE_SEEDS - 1), 'vote'], dictionary)).toEqual([4]);
  });

  it('and the sliced version gets there too', async () => {
    const days = [list(october(1), ['vote']), list(october(2), ['vote'])];
    const slowly = await summariseSlowly(days, dictionary, undefined, async () => {});
    expect(slowly).toEqual(summarise(days, dictionary));
    expect(slowly.squares.days).toBe(2);
  });
});

// What a themed day accepts as a word, over a range. Counted only where a rule
// was written: a day with none accepts both, which is every ordinary themed day.
describe('word rules, over a range', () => {
  const withRule = (n: number, policy: Record<string, string>): CoverageDay => ({
    date: october(n),
    theme: { name: 'October', words: ['shares'] },
    weave: [],
    policy,
  });

  it('counts the days a rule narrows and says what they say', () => {
    const sum = summarise([
      withRule(1, { default: 'both', boxed: 'themed' }),
      withRule(2, { boxed: 'themed' }),
      list(october(3), ['shares']),
    ]);
    expect(sum.rules.days).toBe(2);
    expect(sum.rules.said).toEqual(['boxed themed', 'default both']);
  });

  it('and says nothing at all about a month nobody has ruled on', () => {
    const sum = summarise([list(october(1), ['shares'])]);
    expect(sum.rules.days).toBe(0);
    expect(sum.rules.said).toEqual([]);
  });
});
