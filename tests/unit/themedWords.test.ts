// The words a themed day adds to what the board will accept.
//
// This is the client half of letting ESOP be an answer. The generator can pick
// a word no dictionary carries; without this the board refuses to let anybody
// type it, which is an unanswerable day and worse than not theming at all.
import { describe, expect, it } from 'vitest';
import { acceptedAt, acceptRule, THEME_BONUS, themedWords, withThemed } from '@/themedWords';

const encode = (words: string[]) => btoa(words.join(' '));

describe('themedWords', () => {
  it('reads the day s own words out of its payload', () => {
    expect(themedWords({ themed: encode(['esop', 'shares']) })).toEqual(['esop', 'shares']);
  });

  // Most of the year there is no theme, and that must not look like an error.
  it('and has none for an ordinary day', () => {
    expect(themedWords({ date: '2026-06-01' })).toEqual([]);
    expect(themedWords(null)).toEqual([]);
    expect(themedWords({ themed: '' })).toEqual([]);
  });

  it('survives a payload it cannot decode', () => {
    // the feed is generated separately and may be older or newer than this
    expect(() => themedWords({ themed: '!!!not base64!!!' })).not.toThrow();
  });

  it('and drops anything that is not a word', () => {
    // Space-separated on the wire, so the entries are single words by
    // construction — the server splits on anything that is not a letter before
    // it stores one. What this guards is junk arriving anyway.
    expect(themedWords({ themed: encode(['esop', '', 'ok2', 'shares']) })).toEqual([
      'esop',
      'shares',
    ]);
  });
});

describe('acceptedAt', () => {
  const dictionary = ['plane', 'planet', 'stake'];

  it('is the dictionary at that length', () => {
    const out = acceptedAt(dictionary, [], 5);
    expect(out?.has('plane')).toBe(true);
    expect(out?.has('planet')).toBe(false);
  });

  it('plus the day s own words, which is the whole point', () => {
    const out = acceptedAt(dictionary, ['esop'], 4);
    expect(out?.has('esop')).toBe(true);
  });

  it('at the right length only', () => {
    expect(acceptedAt(dictionary, ['esop'], 5)?.has('esop')).toBe(false);
  });

  // A guess refused because a fetch was slow reads as the board calling you
  // wrong, so the caller shows "still loading" instead — which it can only do
  // if this says "not yet" rather than "nothing".
  it('and is nothing at all until the dictionary arrives', () => {
    expect(acceptedAt(null, ['esop'], 4)).toBeNull();
  });
});

// The other half of the same idea, for the boards that score. A themed day
// builds the rack and the hive out of the event's own words, so the rest of
// the list is what a player is meant to go looking for — and a word the board
// will not accept cannot be worth anything.
describe('withThemed', () => {
  it('hands the solver the day s words as well as the dictionary', () => {
    expect(withThemed(['share', 'plane'], ['esop'])).toEqual(['share', 'plane', 'esop']);
  });

  // Handed to the solver rather than checked at the door: the rack still has
  // to spell it, the hive still has to reach it, the grid still has to trace
  // it. Adding a word twice would score it twice in the day's maximum.
  it('and does not add one the dictionary already had', () => {
    expect(withThemed(['share', 'esop'], ['esop'])).toEqual(['share', 'esop']);
  });

  it('leaves an ordinary day exactly as it was', () => {
    const dictionary = ['share', 'plane'];
    expect(withThemed(dictionary, [])).toBe(dictionary);
  });

  // Null is "still loading", which the games show as such. A board that
  // refused a guess because a fetch was slow reads as the board calling you
  // wrong.
  it('and is nothing at all until the dictionary arrives', () => {
    expect(withThemed(null, ['esop'])).toBeNull();
  });

  // Below the hive's pangram (+7) on purpose: finding the seven-letter word is
  // still the bigger thing.
  it('is worth less than a pangram', () => {
    expect(THEME_BONUS).toBeGreaterThan(0);
    expect(THEME_BONUS).toBeLessThan(7);
  });
});

// The day may say the board takes its own words and nothing else.
describe('acceptRule', () => {
  it('reads the day s rule off the payload', () => {
    expect(acceptRule({ accept: 'themed' })).toBe('themed');
  });

  // Absent is what every ordinary day carries, and what a themed day carried
  // before this existed — so it has to mean both rather than an error.
  it('and takes both for a payload that says nothing', () => {
    expect(acceptRule({})).toBe('both');
    expect(acceptRule(null)).toBe('both');
    // `dictionary` never reaches a browser: a game told to use the dictionary
    // is simply not themed by the generator, so there are no words to refuse.
    expect(acceptRule({ accept: 'dictionary' })).toBe('both');
  });

  it('and the board then takes the day s words alone', () => {
    expect(withThemed(['share', 'plane'], ['esop'], 'themed')).toEqual(['esop']);
    expect(withThemed(['share', 'plane'], ['esop'], 'both')).toEqual(['share', 'plane', 'esop']);
  });

  // Still nothing at all until the dictionary lands, because the games show
  // that as "still loading" rather than as a refusal.
  it('but not before the dictionary arrives', () => {
    expect(withThemed(null, ['esop'], 'themed')).toBeNull();
  });
});

// The guess board under a themed-only day.
describe('acceptedAt under a rule', () => {
  const dictionary = ['share', 'plane', 'stone'];

  it('takes the day s own words of that length and nothing else', () => {
    expect([...acceptedAt(dictionary, ['esops', 'share'], 5, 'themed')!].sort()).toEqual([
      'esops',
      'share',
    ]);
  });

  // Thin is allowed and impossible is not: a length the theme has no words for
  // would otherwise be a board that will not accept its own answer.
  it('and always the answer, even when the theme has nothing that long', () => {
    expect([...acceptedAt(dictionary, ['esop'], 5, 'themed', 'stone')!]).toEqual(['stone']);
  });

  it('while both is the dictionary, the theme and the answer', () => {
    const set = acceptedAt(dictionary, ['esops'], 5, 'both', 'stone')!;
    expect(set.has('plane')).toBe(true);
    expect(set.has('esops')).toBe(true);
    expect(set.has('stone')).toBe(true);
  });

  // An answer of a different length belongs to a different board.
  it('and an answer of another length is not smuggled in', () => {
    expect(acceptedAt(dictionary, [], 5, 'themed', 'esop')!.size).toBe(0);
  });
});
