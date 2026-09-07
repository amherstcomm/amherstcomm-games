// Keeping the one calculator that costs seconds.
//
// The square search is ~70ms per five-letter word that cannot head a board, so
// a themed list is a second or more, and Choosing a Day paid it on every lookup
// of a date. The answer cannot change between those lookups, so it is kept --
// keyed by the words and the word-list version, which is what makes it a cache
// rather than a stored derivation: edit the list and the key moves.
import { beforeEach, describe, expect, it } from 'vitest';
import { keyFor, readSquares, writeSquares } from '@/squareCache';

const square = { first: 'vote', rows: ['vote', 'idea', 'soar', 'arks'] };

beforeEach(() => localStorage.clear());

describe('the squares a list can head, kept', () => {
  it('comes back the way it went in', () => {
    writeSquares(['vote', 'shares'], { four: [square], five: [] });
    expect(readSquares(['vote', 'shares'])).toEqual({ four: [square], five: [] });
  });

  it('and a list nobody has searched is a miss rather than an empty answer', () => {
    // The difference matters: nought squares is a fact about the list, and a
    // miss means search it. Returning the first for the second is a page that
    // says a themed day cannot make a square when nobody has looked.
    expect(readSquares(['vote', 'shares'])).toBeNull();
  });

  it('and the same list typed differently is the same list', () => {
    // Order and case are not part of what the search answers, and a duplicate
    // is not either -- a paste that reorders the file would otherwise throw the
    // answer away.
    expect(keyFor(['Vote', 'shares'])).toBe(keyFor(['shares', 'vote', 'vote']));
  });

  it('but a list with a word added is a different list', () => {
    writeSquares(['vote', 'shares'], { four: [square], five: [] });
    expect(readSquares(['vote', 'shares', 'stock'])).toBeNull();
  });

  it('and a browser that will not keep it still answers for this session', () => {
    // Everything here goes through the site store, which holds what the disk
    // will not in memory -- storage set to essentials only, a private window, a
    // full disk. So the cost of refusing is that the answer is forgotten when
    // the tab closes, not that the page searches twice in one sitting, and
    // certainly not that it throws.
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new Error('nope');
    };
    try {
      expect(() => writeSquares(['vote'], { four: [square], five: [] })).not.toThrow();
      expect(readSquares(['vote'])?.four).toEqual([square]);
    } finally {
      Storage.prototype.setItem = setItem;
    }
  });

  it('and something this version cannot read is a miss too', () => {
    localStorage.setItem(keyFor(['vote']), '{"boards":[]}');
    expect(readSquares(['vote'])).toBeNull();
  });
});
