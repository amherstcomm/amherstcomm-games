// Whether a word list is rich enough to make puzzles out of.
//
// The case worth pinning is the one that produced a wrong answer three times.
// A box is made of theme words that **chain** — each starting with the last
// letter of the one before — and cover twelve distinct letters between them,
// because the words the board is made of are the words that solve it. Two
// versions dropped the chain rather than the pair: two words rarely chain into
// twelve letters, a search over pairs reported nothing, and "the seeds need not
// chain" looked like the fix. Chains of three and four are where the boards
// are — three on a 66-word list, then a hundred and sixty, then three hundred
// and twenty-nine.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error plain-JS module without a declaration file
import { themedBoxes } from '../../scripts/box.mjs';
// @ts-expect-error plain-JS module without a declaration file
import { themedLadderPairs, TIER_PAR } from '../../scripts/ladder.mjs';
import {
  assignSides,
  boxesFrom,
  seedChains,
  bridgesFrom,
  laddersFrom,
  LADDER_TIERS,
} from '@/themeCalculators';

/** Two words that chain and cover a board's twelve letters, built from the
 *  board itself: a walk taking one letter per side in turn is spellable by
 *  construction, and splitting it with an overlap gives words that chain.
 *  Invented rather than English, because what is being tested is the rule. */
const ordinaryPair = (sides: string[]) => {
  const bySide = sides.map((side) => [...side]);
  const walk: string[] = [];
  for (let i = 0; i < 12; i += 1) walk.push(bySide[i % 4][Math.floor(i / 4)]);
  const whole = walk.join('');
  return [whole.slice(0, 7), whole.slice(6)];
};

describe('boxesFrom', () => {
  // A chain: payouts ends in s, sharing begins with one, and between them they
  // cover exactly twelve distinct letters.
  const CHAIN = ['payouts', 'sharing'];

  it('makes a box out of theme words that chain into twelve letters', () => {
    const [box] = boxesFrom(CHAIN);
    expect(box.sides.join('')).toHaveLength(12);
    expect(box.sides).toHaveLength(4);
    expect(box.sides.every((s) => s.length === 3)).toBe(true);
  });

  // The rule two versions of this dropped, and the whole of the game: the words
  // the board is made of are the words that solve it, so they have to chain.
  it('and the chain it was built from is the chain that solves it', () => {
    const [box] = boxesFrom(CHAIN);
    expect(box.solution).toEqual(CHAIN);
    expect(box.par).toBe(2);
    for (let i = 1; i < box.solution.length; i += 1) {
      expect(box.solution[i][0]).toBe(box.solution[i - 1].at(-1));
    }
  });

  // The seed is *a* solution, not the only one. A board is a board: other pairs
  // and longer chains solve it too, and on a day that accepts the dictionary a
  // player can reach them — so what the board promises is the shortest of them.
  it('takes the shorter of the theme s chain and an ordinary one', () => {
    // A three-word themed chain with an ordinary pair over the same letters.
    const themed = ['dividends', 'stocks', 'service', 'esop'];
    const chained = boxesFrom(themed)[0];
    expect(chained.par).toBe(chained.solution.length);
    expect(chained.ordinary).toBeNull();

    // `vote` then a walk of the remaining letters: two words, spellable by
    // construction, so the board is solvable in two whatever the seed took.
    const box = boxesFrom(themed, { dictionary: ordinaryPair(chained.sides) })[0];
    expect(box.par).toBe(2);
    expect(box.ordinary).toHaveLength(2);
    // And the themed chain is still there, because it is still the route made
    // of the day's own words.
    expect(box.solution).toEqual(chained.solution);
  });

  it('and says nothing about an ordinary route that is no shorter', () => {
    const box = boxesFrom(CHAIN, { dictionary: ordinaryPair(boxesFrom(CHAIN)[0].sides) })[0];
    expect(box.par).toBe(2);
    // Two either way, so there is nothing to report: the theme's own chain
    // already does it in two.
    expect(box.ordinary).toBeNull();
  });

  it('and every word of it can be spelled on the board it made', () => {
    const [box] = boxesFrom(CHAIN);
    for (const word of box.solution) expect(box.holds).toContain(word);
  });

  // Twelve distinct letters and no chain is not a board. This is the pair the
  // page was offering when Ray said "e != n": acquire ends in e, negotiations
  // begins with n, and the seed has to solve what it makes.
  it('and refuses words that do not chain, however many letters they have', () => {
    expect(new Set('acquire' + 'negotiations').size).toBe(12);
    expect(boxesFrom(['acquire', 'negotiations'])).toEqual([]);
  });

  // Two words rarely chain into twelve letters; three often do. Measuring pairs
  // alone is what made an earlier version report nothing and drop the chain
  // instead of the pair.
  it('takes three or four where two will not do', () => {
    const boxes = boxesFrom(['dividends', 'stocks', 'service', 'esop']);
    expect(boxes.length).toBeGreaterThan(0);
    expect(boxes[0].solution.length).toBeGreaterThan(2);
  });

  it('but never more than four, and never one', () => {
    for (const box of boxesFrom(['dividends', 'stocks', 'service', 'esop', 'payouts', 'sharing'])) {
      expect(box.solution.length).toBeGreaterThanOrEqual(2);
      expect(box.solution.length).toBeLessThanOrEqual(4);
    }
  });

  it('has nothing to offer a list that cannot reach twelve letters', () => {
    expect(boxesFrom(['stake', 'stack', 'steak'])).toEqual([]);
    expect(boxesFrom([])).toEqual([]);
  });

  // A box cannot spell a doubled letter — the second would step on the same
  // side as the first — so such a word cannot be part of the chain.
  it('and will not seed a box with a doubled letter', () => {
    expect(boxesFrom(['betterment', 'tin'])).toEqual([]);
  });

  // What a player finds is the point, so the richest board comes first.
  it('counting every theme word the box can spell, best first', () => {
    const boxes = boxesFrom(['payouts', 'sharing', 'shares', 'stock', 'growth', 'service', 'esop']);
    for (let i = 1; i < boxes.length; i += 1) {
      expect(boxes[i - 1].holds.length).toBeGreaterThanOrEqual(boxes[i].holds.length);
    }
  });


  // The cap that turned out to be a bug: it stopped the search *before* the
  // sort, so a filter typed at the shortlist searched the first sixty in
  // enumeration order — which all began with the same word — and a board that
  // existed could not be found. There is no cap now: enumerating a sixty-word
  // list is fifteen milliseconds, so there was nothing to save.
  it('offers every board it can make, in a stable order', () => {
    const words = ['payouts', 'sharing', 'shares', 'stock', 'growth', 'service', 'esop', 'dividends'];
    const once = boxesFrom(words);
    expect(once.length).toBe(seedChains(words).length);
    expect(boxesFrom(words)).toEqual(once);
  });
});

describe('assignSides', () => {
  it('never puts two consecutive letters of a word on one side', () => {
    const laid = assignSides(['voting', 'shared']);
    expect(laid).not.toBeNull();
    for (const word of ['voting', 'shared']) {
      for (let i = 1; i < word.length; i += 1) {
        expect(laid!.sideOf[word[i - 1]]).not.toBe(laid!.sideOf[word[i]]);
      }
    }
  });

  it('and says so when no arrangement works', () => {
    // Thirteen distinct letters into four sides of three. The first version of
    // this test used 'abcabcabcabc', which has three distinct letters and fits
    // one per side — it asserted failure and got success.
    expect(assignSides(['abcdefghijklm'])).toBeNull();
  });
});

describe('bridgesFrom', () => {
  // The themed thing is the compounds, not the answer between them.
  it('finds the stem two themed compounds share', () => {
    const out = bridgesFrom(['nonprofit', 'profitable']);
    expect(out).toHaveLength(1);
    expect(`${out[0].x} · ${out[0].middle} · ${out[0].y}`).toBe('non · profit · able');
  });

  it('and reports none for a list of plain nouns', () => {
    // which is the answer, and worth seeing before an evening is spent on it
    expect(bridgesFrom(['shares', 'dividend', 'equity', 'buyout'])).toEqual([]);
  });

  it('does not offer the same prompt twice', () => {
    const out = bridgesFrom(['nonprofit', 'profitable', 'nonprofit']);
    expect(out).toHaveLength(1);
  });
});

// The ladder half, and the one place in this file where the browser and the
// generator do the same search. They are two implementations of one rule, so
// what is asserted is that they agree — on the real bands, with a real list.
describe('laddersFrom', () => {
  // The rungs the board itself checks against: src/dictionaries.ts calls this
  // set `common`, the harvest reads the same three files, and par measured
  // over anything else is a par the game will not agree with.
  const rungs = new Set<string>();
  for (const band of ['band-10', 'band-20', 'band-35']) {
    for (const w of JSON.parse(
      readFileSync(join(process.cwd(), `src/wordbands/${band}.json`), 'utf8')
    ).words as string[]) {
      rungs.add(w);
    }
  }

  const THEME = [
    'shares', 'shared', 'worker', 'earned', 'stake', 'stock', 'board', 'bonus',
    'vesting', 'meeting', 'router', 'budget',
    // In the list and not in the common tier: it cannot be an end, because the
    // board would refuse it as a rung.
    'esop',
  ];

  it('pairs two theme words with a route between them', () => {
    const pairs = laddersFrom(THEME, rungs);
    expect(pairs.length).toBeGreaterThan(0);
    for (const p of pairs) {
      expect(THEME).toContain(p.a);
      expect(THEME).toContain(p.b);
      expect(p.a.length).toBe(p.b.length);
      expect(p.par).toBeGreaterThanOrEqual(3);
      expect(p.par).toBeLessThanOrEqual(8);
    }
  });

  // Two implementations of one rule, which is the thing this repo keeps
  // getting wrong. The generator deals the pair; the page promises it exists.
  it('and agrees with the generator, pair for pair', () => {
    const mine = laddersFrom(THEME, rungs).map((p) => `${p.a} ${p.b} ${p.par}`);
    const theirs = (themedLadderPairs(THEME, rungs) as { a: string; b: string; par: number }[]).map(
      (p) => `${p.a} ${p.b} ${p.par}`
    );
    expect(mine).toEqual(theirs);
    expect(mine.length).toBeGreaterThan(0);
  });

  it('and the tier bands are the generator s own', () => {
    expect(LADDER_TIERS).toEqual(TIER_PAR);
  });

  // The limit worth stating: a word the common tier has never heard of cannot
  // be an end, because every rung is checked against that tier — and unlike the
  // guess board this cannot be fixed by shipping the day's words, since
  // widening what counts as a rung changes par.
  it('leaves out a theme word the rungs do not have', () => {
    const pairs = laddersFrom(THEME, rungs);
    expect(pairs.some((p) => p.a === 'esop' || p.b === 'esop')).toBe(false);
  });

  it('and has nothing to offer a list of one length nobody shares', () => {
    expect(laddersFrom(['shares'], rungs)).toEqual([]);
    expect(laddersFrom([], rungs)).toEqual([]);
  });

  // Sorted, because the generator deals by index: an unsorted pool would make
  // the same seed set a different ladder for no reason anybody could see.
  it('comes back in a stable order', () => {
    const once = laddersFrom(THEME, rungs);
    const again = laddersFrom([...THEME].reverse(), rungs);
    expect(again).toEqual(once);
  });
});

// The box search exists twice as well — the page promises a themed box can be
// built and the generator has to build it — so the two are run over the same
// words and the same dictionary and required to answer the same.
describe('the box search, in both places', () => {
  const THEME = [
    'payouts', 'sharing', 'shares', 'stock', 'growth', 'service', 'esop', 'dividends',
    'stocks', 'owned', 'earned', 'charter', 'reward',
  ];

  // The page promises a board and the generator has to build it, so what is
  // asserted is that both searches find the same chains in the same order.
  it('agrees chain for chain, and on what the board promises', () => {
    // With a dictionary, so the ordinary route and the par are compared too:
    // two searches agreeing on the chain while disagreeing about how few words
    // a player needs would be two searches nobody could trust.
    const dictionary = ['sharing', 'growth', 'payouts', 'stocks', 'esop', 'service'];
    const say = (b: { sides: string[]; solution: string[]; ordinary: string[] | null; par: number }) =>
      `${b.sides.join('|')} ${b.solution.join('>')} ${b.par} ${(b.ordinary ?? []).join('>')}`;
    const mine = boxesFrom(THEME, { dictionary }).map(say);
    const theirs = (
      themedBoxes(THEME, { dictionary }) as {
        sides: string[];
        solution: string[];
        ordinary: string[] | null;
        par: number;
      }[]
    ).map(say);
    expect(mine).toEqual(theirs);
    expect(mine.length).toBeGreaterThan(0);
  });

  it('and on what each finished board spells', () => {
    const mine = boxesFrom(THEME).map((b) => b.holds.join(','));
    const theirs = (themedBoxes(THEME) as { holds: string[] }[]).map((b) => b.holds.join(','));
    expect(mine).toEqual(theirs);
  });
});
