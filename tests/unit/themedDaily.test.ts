// A themed month, in the daily puzzles.
//
// The check that matters most is the intersection. A daily answer has to be a
// word the player can type, and the board validates against the dictionary
// bundled with the client — so a themed word the dictionary has never heard of
// is an unanswerable day. ESOP is a fine answer inside a session, where the
// server marks and the round's own list is allowed on top of the language; it
// is not a fine answer for a daily, and the difference is this function.
import { describe, expect, it } from 'vitest';
// @ts-expect-error plain-JS module without a declaration file
import { normaliseTheme, themedPool, weaveTheme } from '../../scripts/themedDaily.mjs';

const POOL = ['owner', 'stake', 'value', 'plane', 'shares', 'buyout', 'planet'];

describe('themedPool', () => {
  it('keeps the themed words the pool already allowed', () => {
    expect(themedPool(POOL, ['stake', 'value', 'plane'], 5)).toEqual(['plane', 'stake', 'value']);
  });

  // The whole safety of it: a word nobody can type is not an answer.
  it('drops a themed word the dictionary does not have', () => {
    expect(themedPool(POOL, ['esop', 'stake'], 5)).toEqual(['stake']);
    expect(themedPool(POOL, ['esop'], 4)).toEqual([]);
  });

  it('and only the right length for the board being filled', () => {
    expect(themedPool(POOL, ['owner', 'shares'], 6)).toEqual(['shares']);
  });

  // Per length rather than per day, so a list with no seven-letter words still
  // themes the boards it can.
  it('has nothing to offer a length it cannot fill, rather than failing', () => {
    expect(themedPool(POOL, ['owner', 'stake'], 9)).toEqual([]);
  });

  it('and nothing to offer with no theme at all', () => {
    expect(themedPool(POOL, undefined, 5)).toEqual([]);
    expect(themedPool(POOL, [], 5)).toEqual([]);
  });

  // Set iteration order is insertion order; the daily draws by index, so an
  // unsorted pool would make the same seed pick different words on different
  // days for no reason anybody could see.
  it('comes back sorted, because the draw is by index', () => {
    expect(themedPool(POOL, ['value', 'stake', 'plane'], 5)).toEqual([
      'plane',
      'stake',
      'value',
    ]);
  });
});

describe('weaveTheme', () => {
  const many = ['owner', 'shares', 'buyout', 'equity', 'vesting', 'profit', 'capital', 'worker'];

  it('makes a board out of a list with a spangram and enough letters', () => {
    const out = weaveTheme(
      { clue: 'What we all are', spangram: 'employeeowned', words: many },
      48
    );
    expect(out?.clue).toBe('What we all are');
    expect(out?.spangram).toBe('employeeowned');
  });

  // Weave threads the spangram corner to corner; without one there is no board.
  it('but not without a spangram', () => {
    expect(weaveTheme({ clue: 'x', spangram: '', words: many }, 48)).toBeNull();
  });

  it('nor when there are not enough letters to tile one', () => {
    expect(weaveTheme({ clue: 'x', spangram: 'employeeowned', words: ['owner'] }, 48)).toBeNull();
  });

  it('and drops words the board cannot hold', () => {
    const out = weaveTheme(
      { clue: 'x', spangram: 'employeeowned', words: [...many, 'ox', 'extraordinarily'] },
      48
    );
    expect(out?.words).not.toContain('ox');
    expect(out?.words).not.toContain('extraordinarily');
  });

  it('including the spangram itself, which is placed separately', () => {
    const out = weaveTheme(
      { clue: 'x', spangram: 'ownership', words: [...many, 'ownership'] },
      48
    );
    expect(out?.words).not.toContain('ownership');
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

  // A spangram that will not thread is treated as absent rather than passed on
  // to fail deeper in the generator.
  it('and treats an unusable spangram as none', () => {
    expect(normaliseTheme({ name: 'n', spangram: 'short', words: ['owner'] }).spangram).toBe('');
    expect(
      normaliseTheme({ name: 'n', spangram: 'employee owned', words: ['owner'] }).spangram
    ).toBe('');
  });

  it('is nothing at all when there are no words to use', () => {
    expect(normaliseTheme({ name: 'n', words: [] })).toBeNull();
    expect(normaliseTheme(null)).toBeNull();
  });
});
