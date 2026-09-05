// A themed month, in the daily puzzles.
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
import { normaliseTheme, themedPool, weaveThemes } from '../../scripts/themedDaily.mjs';

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

describe('weaveThemes', () => {
  const many = ['owner', 'shares', 'buyout', 'equity', 'vesting', 'profit', 'capital', 'worker'];

  // The answer to a real problem: a list that runs for a month builds a board
  // every day of it, and one spangram threads the same long answer through all
  // thirty-one. The board rearranges; the word does not.
  it('offers one candidate per spangram, so the days can differ', () => {
    const out = weaveThemes(
      { clue: 'What we all are', spangrams: ['employeeowned', 'sharedreward'], words: many },
      48
    );
    expect(out.map((t: { spangram: string }) => t.spangram)).toEqual([
      'employeeowned',
      'sharedreward',
    ]);
    expect(out[0].clue).toBe('What we all are');
  });

  // Passed over rather than costing the board: the day's seed picks among
  // whatever can actually tile.
  it('and leaves out one there are not enough letters for', () => {
    const out = weaveThemes(
      { clue: 'x', spangrams: ['employeeowned'], words: ['owner'] },
      48
    );
    expect(out).toEqual([]);
  });

  it('nothing at all without any spangrams', () => {
    expect(weaveThemes({ clue: 'x', spangrams: [], words: many }, 48)).toEqual([]);
    expect(weaveThemes(null, 48)).toEqual([]);
  });

  it('and drops words the board cannot hold', () => {
    const out = weaveThemes(
      { clue: 'x', spangrams: ['employeeowned'], words: [...many, 'ox', 'extraordinarily'] },
      48
    );
    expect(out[0].words).not.toContain('ox');
    expect(out[0].words).not.toContain('extraordinarily');
  });

  // Each candidate excludes its own, because the spangram is placed separately.
  it('including whichever spangram this candidate is threading', () => {
    const out = weaveThemes(
      { clue: 'x', spangrams: ['ownership'], words: [...many, 'ownership'] },
      48
    );
    expect(out[0].words).not.toContain('ownership');
  });
});

describe('normaliseTheme', () => {
  it('lower-cases and drops anything that is not a word', () => {
    const out = normaliseTheme({ name: 'n', words: ['Owner', 'two words', 'esop2', 'stake'] });
    expect(out.words).toEqual(['owner', 'stake']);
  });

  it('takes the name as the clue when there is no clue', () => {
    expect(normaliseTheme({ name: 'Employee ownership', words: ['owner'] }).clue).toBe(
      'Employee ownership'
    );
  });

  // One that will not thread is dropped rather than passed on to fail deeper in
  // the generator.
  it('and drops an unusable spangram, keeping the rest', () => {
    expect(
      normaliseTheme({
        name: 'n',
        spangrams: ['short', 'employee owned', 'ownership'],
        words: ['owner'],
      }).spangrams
    ).toEqual(['ownership']);
  });

  // The database may be older than the generator, which is the ordinary state
  // in the minutes after a deploy.
  it('and still understands a single one, as the first version sent it', () => {
    expect(normaliseTheme({ name: 'n', spangram: 'ownership', words: ['owner'] }).spangrams).toEqual([
      'ownership',
    ]);
  });

  it('is nothing at all when there are no words to use', () => {
    expect(normaliseTheme({ name: 'n', words: [] })).toBeNull();
    expect(normaliseTheme(null)).toBeNull();
  });
});
