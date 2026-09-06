// A themed month, in the daily puzzles.
//
// Weave used to be themed from a word list, which weave_themes replaced — a
// list themes the daily word, a theme themes the board — so what is left here
// is the word half.
//
// The check that matters most is that a themed word does not have to be in the
// dictionary. It used to: the pool was intersected with the day's ordinary one,
// so ESOP could be an answer inside a session and not a daily. That was
// backwards — the words an event most wants are exactly the ones a dictionary
// does not carry, which is what makes them the company's. A themed day now
// ships its own words and the board accepts them, so the only thing still
// applied here is the blocklist.
import { describe, expect, it } from 'vitest';
// @ts-expect-error plain-JS module without a declaration file
import { normaliseTheme, themedHiveBases, themedPool, themedRackBases } from '../../scripts/themedDaily.mjs';

describe('themedPool', () => {
  const BLOCKED = new Set(['damned']);

  it('offers the theme s own words of that length', () => {
    expect(themedPool(['stake', 'value', 'shares'], 5)).toEqual(['stake', 'value']);
  });

  // Reversal, and the point of the whole change. This used to intersect with
  // the day's dictionary pool, so ESOP could be an answer inside a session and
  // not a daily — which is backwards, because the words an event most wants are
  // exactly the ones a dictionary does not carry. The board ships the day's
  // words and accepts them now, so being in the dictionary is not the test.
  it('including one no dictionary has ever heard of', () => {
    expect(themedPool(['esop'], 4)).toEqual(['esop']);
  });

  // Not a rule to relax because the words came from inside the building: a
  // curated list is somebody's paste.
  it('but never a blocked one', () => {
    expect(themedPool(['damned', 'shared'], 6, BLOCKED)).toEqual(['shared']);
  });

  // Per length rather than per day, so a list with no seven-letter words still
  // themes the boards it can.
  it('has nothing to offer a length it cannot fill, rather than failing', () => {
    expect(themedPool(['owner', 'stake'], 9)).toEqual([]);
  });

  it('and nothing to offer with no theme at all', () => {
    expect(themedPool(undefined, 5)).toEqual([]);
    expect(themedPool([], 5)).toEqual([]);
  });

  // Set iteration order is insertion order; the daily draws by index, so an
  // unsorted pool would make the same seed pick different words on different
  // days for no reason anybody could see.
  it('comes back sorted, because the draw is by index', () => {
    expect(themedPool(['value', 'stake', 'plane'], 5)).toEqual(['plane', 'stake', 'value']);
  });
});

describe('normaliseTheme', () => {
  it('lower-cases and drops anything that is not a word', () => {
    const out = normaliseTheme({ name: 'n', words: ['Owner', 'two words', 'esop2', 'stake'] });
    expect(out.words).toEqual(['owner', 'stake']);
  });

  // The name is for the nightly log line — which lists themed a day — and
  // nothing else. The clue went with Weave.
  it('keeps the name it was given', () => {
    expect(normaliseTheme({ name: 'Employee ownership', words: ['owner'] }).name).toBe(
      'Employee ownership'
    );
  });

  it('is nothing at all when there are no words to use', () => {
    expect(normaliseTheme({ name: 'n', words: [] })).toBeNull();
    expect(normaliseTheme(null)).toBeNull();
  });
});

// The two boards a theme can be built *from* rather than merely scored in.
describe('themedRackBases', () => {
  // A rack is one word shuffled, so this is the whole of the rule.
  it('is the theme s own words of the rack s length', () => {
    expect(themedRackBases(['payouts', 'trustee', 'buyout', 'esop'], 7)).toEqual([
      'payouts',
      'trustee',
    ]);
  });

  // Not the dictionary's, which is the point: a rack that spells out a word
  // only this company uses is the whole idea, and the board ships the day's
  // words and accepts them.
  it('and does not ask whether the dictionary has heard of them', () => {
    expect(themedRackBases(['esopplan'], 8)).toEqual(['esopplan']);
  });

  it('drops a blocked word rather than dealing it as a rack', () => {
    expect(themedRackBases(['payouts', 'trustee'], 7, new Set(['payouts']))).toEqual(['trustee']);
  });

  it('has nothing to offer a list with nothing that long', () => {
    expect(themedRackBases(['esop', 'shares'], 7)).toEqual([]);
    expect(themedRackBases(null, 7)).toEqual([]);
  });
});

describe('themedHiveBases', () => {
  it('takes a theme word of seven distinct letters', () => {
    expect(themedHiveBases(['employer', 'buyout'])).toEqual(['employer']);
  });

  // Two different refusals, and both matter. Eight distinct letters is not a
  // hive at all; an `s` is a hive whose answer list is drowned in plurals,
  // which is the same rule the ordinary pool applies.
  it('refuses one that is not seven distinct, or that carries an s', () => {
    expect(themedHiveBases(['ownership'])).toEqual([]);
    expect(themedHiveBases(['payouts'])).toEqual([]);
  });

  it('and a short word cannot seed one', () => {
    expect(themedHiveBases(['owner'])).toEqual([]);
    expect(themedHiveBases([])).toEqual([]);
  });
});
