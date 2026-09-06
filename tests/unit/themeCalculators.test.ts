// Whether a word list is rich enough to make puzzles out of.
//
// The case worth pinning is the one that produced a wrong answer twice: two
// theme words make a box when their letters are twelve distinct, and they do
// **not** have to chain. Requiring the chain is what made the first search
// report zero from a list that has twenty-one.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error plain-JS module without a declaration file
import { themedLadderPairs, TIER_PAR } from '../../scripts/ladder.mjs';
import {
  assignSides,
  boxesFrom,
  bridgesFrom,
  laddersFrom,
  LADDER_TIERS,
} from '@/themeCalculators';

// Measured against the real dictionary in scripts/feasibility.mjs: these two
// have exactly twelve distinct letters between them.
const VOTING_SHARED = ['voting', 'shared'];

describe('boxesFrom', () => {
  it('makes a box from two theme words with twelve distinct letters', () => {
    const boxes = boxesFrom(VOTING_SHARED);
    expect(boxes).toHaveLength(1);
    expect(boxes[0].sides.join('')).toHaveLength(12);
    expect(boxes[0].sides).toHaveLength(4);
    expect(boxes[0].sides.every((s) => s.length === 3)).toBe(true);
  });

  // The mistake, twice over. Theme words essentially never chain, so requiring
  // it reported zero from a list that makes plenty.
  it('without requiring the two words to chain', () => {
    const [a, b] = VOTING_SHARED;
    expect(b[0]).not.toBe(a[a.length - 1]);
    expect(boxesFrom(VOTING_SHARED)).toHaveLength(1);
  });

  it('and both of them are findable in it', () => {
    const [box] = boxesFrom(VOTING_SHARED);
    expect(box.holds).toContain('voting');
    expect(box.holds).toContain('shared');
  });

  // What a player finds is the point, so the richest box comes first.
  it('counting every theme word the box can spell, best first', () => {
    const boxes = boxesFrom([...VOTING_SHARED, 'vote', 'gain', 'earn', 'dividend']);
    expect(boxes[0].holds.length).toBeGreaterThan(2);
    for (let i = 1; i < boxes.length; i += 1) {
      expect(boxes[i - 1].holds.length).toBeGreaterThanOrEqual(boxes[i].holds.length);
    }
  });

  it('has nothing to offer a list that cannot reach twelve letters', () => {
    expect(boxesFrom(['stake', 'stack', 'steak'])).toEqual([]);
    expect(boxesFrom([])).toEqual([]);
  });

  // A box cannot spell a doubled letter — the second would step on the same
  // side as the first — so such a word cannot be one of the two making it.
  it('and will not seed a box with a doubled letter', () => {
    expect(boxesFrom(['betterment', 'quixotic']).length).toBe(0);
  });

  it('reports the guarantee as unknown when given no dictionary', () => {
    expect(boxesFrom(VOTING_SHARED)[0].guaranteed).toBe(false);
  });

  // The pair is invented rather than English, and deliberately: what is being
  // tested is the rule, and every real pair that finishes this particular box
  // would be a fact about the dictionary as well. `vote` then `eindsharg`
  // chains, covers all twelve, and steps sides in turn.
  it('and finds it when two ordinary words finish the box', () => {
    const [box] = boxesFrom(VOTING_SHARED, ['vote', 'eindsharg']);
    expect(box.guaranteed).toBe(true);
    expect(new Set('vote' + 'eindsharg').size).toBe(12);
  });

  // The two ways a candidate is thrown out before the side check, both of them
  // worth pinning because they were folded into an index for speed and an
  // index is a place to be quietly wrong.
  it('but not out of a word carrying a letter the box does not have', () => {
    // z for g: still twelve letters between them, and one of them is not on
    // the board.
    expect(boxesFrom(VOTING_SHARED, ['vote', 'eindsharz'])[0].guaranteed).toBe(false);
  });

  it('nor out of one with a doubled letter, which no box can spell', () => {
    expect(boxesFrom(VOTING_SHARED, ['vote', 'eeindsharg'])[0].guaranteed).toBe(false);
  });

  it('nor when the two do not chain', () => {
    expect(boxesFrom(VOTING_SHARED, ['vote', 'indsharge'])[0].guaranteed).toBe(false);
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
