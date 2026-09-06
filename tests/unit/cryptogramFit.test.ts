// Which boards a passage of your own can go on.
//
// Two rules, and neither is this file's to invent: the band lengths belong to
// the harvest and the tier mapping to the generator. Both are read out of those
// files here, because a copied number is a number to be wrong and the symptom
// would be a passage saved happily and then never used.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BANDS, fitNote, lettersIn, TIER_BAND, tiersFor } from '@/cryptogramFit';

const read = (file: string) => readFileSync(join(process.cwd(), file), 'utf8');

/** 52 letters — the standard band. */
const CHARTER = 'We own this place together, and every share of it was earned here.';
/** 39 letters — the short band. */
const SHORT = 'One share each, and the year we all earned it here.';

describe('the bands', () => {
  it('are the harvest s own', () => {
    const harvest = read('scripts/cryptogram-harvest.mjs');
    const block = harvest.match(/const BANDS = \{([\s\S]*?)\};/);
    expect(block, 'BANDS moved or changed shape').not.toBeNull();
    const found: Record<string, { min: number; max: number }> = {};
    for (const [, name, min, max] of block![1].matchAll(
      /(\w+):\s*\{\s*min:\s*(\d+),\s*max:\s*(\d+)/g
    )) {
      found[name] = { min: Number(min), max: Number(max) };
    }
    expect(found).toEqual(BANDS);
  });

  it('and the tiers are the generator s', () => {
    const gen = read('scripts/cryptogram.mjs');
    const line = gen.match(/export const TIER_BAND = \{([^}]+)\}/);
    expect(line, 'TIER_BAND moved or changed shape').not.toBeNull();
    const found = Object.fromEntries(
      [...line![1].matchAll(/(\w+):\s*'(\w+)'/g)].map(([, tier, band]) => [tier, band])
    );
    expect(found).toEqual(TIER_BAND);
  });
});

describe('lettersIn', () => {
  // The thing that surprises people: a long-looking sentence of short words is
  // shorter than it looks, because nothing but letters is enciphered.
  it('counts letters rather than characters', () => {
    expect(lettersIn(CHARTER)).toBe(52);
    expect(lettersIn('a, b. c!')).toBe(3);
    expect(lettersIn('   ')).toBe(0);
  });

  it('and is not fooled by case or by numbers', () => {
    expect(lettersIn('ESOP 2026')).toBe(4);
  });
});

describe('tiersFor', () => {
  it('sends a standard passage to easy and hard', () => {
    expect(tiersFor(CHARTER)).toEqual(['easy', 'hard']);
  });

  it('and a short one to extreme alone', () => {
    expect(tiersFor(SHORT)).toEqual(['extreme']);
  });

  // The two ends, exactly. Off by one here is a passage refused that should
  // play, or accepted that no board takes.
  it('takes the boundaries themselves', () => {
    expect(tiersFor('a'.repeat(35))).toEqual(['extreme']);
    expect(tiersFor('a'.repeat(49))).toEqual(['extreme']);
    expect(tiersFor('a'.repeat(50))).toEqual(['easy', 'hard']);
    expect(tiersFor('a'.repeat(100))).toEqual(['easy', 'hard']);
  });

  it('and nothing at all outside them', () => {
    expect(tiersFor('a'.repeat(34))).toEqual([]);
    expect(tiersFor('a'.repeat(101))).toEqual([]);
  });

  // The bands meet, so there is no length between 35 and 100 with no board.
  // Worth asserting rather than reasoning about: it is why fitNote has two
  // failure cases and not three.
  it('leaves no gap between the two bands', () => {
    for (let n = 35; n <= 100; n += 1) {
      expect(tiersFor('a'.repeat(n)), `${n} letters`).not.toEqual([]);
    }
  });
});

describe('fitNote', () => {
  it('says what a usable passage plays at', () => {
    expect(fitNote(CHARTER)).toMatchObject({ ok: true, note: '52 letters — plays at easy, hard' });
  });

  // Not a refusal, a warning: the uniqueness guard needs the whole dictionary
  // and a search, so a short passage of somebody's own is not checked the way
  // the curated short ones were.
  it('and flags a short one, which only extreme plays', () => {
    expect(fitNote(SHORT)).toMatchObject({ ok: true, short: true });
    expect(fitNote(CHARTER).short).toBe(false);
  });

  // How far off, in the direction that fixes it — "too short" alone leaves
  // somebody counting letters by hand.
  it('says how many more it needs', () => {
    expect(fitNote('a'.repeat(30)).note).toBe('30 letters — 5 short of the smallest board');
  });

  it('and how many it is over', () => {
    expect(fitNote('a'.repeat(120)).note).toBe('120 letters — 20 past the largest board');
  });

  it('and has nothing to say about an empty box', () => {
    expect(fitNote('  ')).toEqual({ ok: false, short: false, note: '' });
  });
});
