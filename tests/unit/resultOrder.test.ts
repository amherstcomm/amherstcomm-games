// The order a solver's answers come back in.
//
// Testable at all only because it stopped being a useMemo inside a four
// thousand line component — checking it there meant rendering the app, typing
// letters and reading chips back out of the DOM, which is why it had no tests.
import { describe, expect, it } from 'vitest';
import { byLength, sortResults } from '@/solvers/resultOrder';

const WORDS = ['cat', 'apple', 'be', 'dog', 'ax', 'banana'];

describe('sortResults', () => {
  it('sorts alphabetically both ways', () => {
    expect(sortResults(WORDS, { key: 'alpha', dir: 'asc' })).toEqual([
      'apple', 'ax', 'banana', 'be', 'cat', 'dog',
    ]);
    expect(sortResults(WORDS, { key: 'alpha', dir: 'desc' })).toEqual([
      'dog', 'cat', 'be', 'banana', 'ax', 'apple',
    ]);
  });

  it('sorts by length, shortest first', () => {
    expect(sortResults(WORDS, { key: 'length', dir: 'asc' }).map((w) => w.length)).toEqual([
      2, 2, 3, 3, 5, 6,
    ]);
  });

  // The rule that is easy to get wrong and impossible to see: direction applies
  // to the length, not to the tiebreak. Reversing to longest-first must not
  // also reverse the alphabet inside each length, which reads as the list
  // scrambling itself rather than flipping.
  it('keeps ties alphabetical in both directions', () => {
    expect(sortResults(WORDS, { key: 'length', dir: 'asc' })).toEqual([
      'ax', 'be', 'cat', 'dog', 'apple', 'banana',
    ]);
    expect(sortResults(WORDS, { key: 'length', dir: 'desc' })).toEqual([
      'banana', 'apple', 'cat', 'dog', 'ax', 'be',
    ]);
  });

  it('does not mutate its input', () => {
    const given = ['cat', 'ax'];
    sortResults(given, { key: 'alpha', dir: 'asc' });
    expect(given).toEqual(['cat', 'ax']);
  });

  it('has nothing to say about an empty list', () => {
    expect(sortResults([], { key: 'length', dir: 'asc' })).toEqual([]);
  });
});

describe('byLength', () => {
  it('buckets in arrival order, not numeric order', () => {
    // The caller has already sorted. Imposing a numeric order here would
    // silently undo a descending sort — the headings would count up while the
    // words counted down.
    const desc = sortResults(WORDS, { key: 'length', dir: 'desc' });
    expect(byLength(desc).map(([len]) => len)).toEqual([6, 5, 3, 2]);
  });

  it('keeps every word, once', () => {
    const groups = byLength(sortResults(WORDS, { key: 'length', dir: 'asc' }));
    expect(groups.flatMap(([, ws]) => ws).sort()).toEqual([...WORDS].sort());
  });

  it('groups each word under its own length', () => {
    for (const [len, ws] of byLength(WORDS)) {
      expect(ws.every((w) => w.length === len)).toBe(true);
    }
  });
});
