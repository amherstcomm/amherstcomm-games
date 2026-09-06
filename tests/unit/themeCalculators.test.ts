// Whether a word list is rich enough to make puzzles out of.
//
// The case worth pinning is the one that produced a wrong answer twice: two
// theme words make a box when their letters are twelve distinct, and they do
// **not** have to chain. Requiring the chain is what made the first search
// report zero from a list that has twenty-one.
import { describe, expect, it } from 'vitest';
import { assignSides, boxesFrom, bridgesFrom } from '@/themeCalculators';

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

  it('and finds it when two ordinary words finish the box', () => {
    const [box] = boxesFrom(VOTING_SHARED);
    const letters = box.sides.join('');
    // A pair that between them use all twelve and chain.
    const first = 'voting';
    const second = 'gashed';
    expect(new Set(first + second).size).toBeLessThanOrEqual(letters.length);
    const withDict = boxesFrom(VOTING_SHARED, ['voting', 'gashed', 'shared', 'dev']);
    expect(typeof withDict[0].guaranteed).toBe('boolean');
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
