// How a solver's answers are ordered.
//
// Pure, and its own file, because it is the one part of the results panel that
// can be checked without a browser. It lived inside App.tsx as a useMemo, where
// the only way to test it was to render ten thousand words and read them back.
//
// Two rules, and the second is the one worth writing down: sorting by length
// keeps ties alphabetical, so the list is stable rather than arbitrary within
// each group. Direction applies to the length, not to the tiebreak — flipping
// to longest-first should not also reverse the alphabet inside each row, which
// reads as though the list is scrambling itself.
export type SortPref = { key: 'length' | 'alpha'; dir: 'asc' | 'desc' };

const alpha = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export function sortResults(results: readonly string[], sort: SortPref): string[] {
  const arr = [...results];
  const dir = sort.dir === 'asc' ? 1 : -1;
  if (sort.key === 'alpha') arr.sort((a, b) => alpha(a, b) * dir);
  else arr.sort((a, b) => (a.length - b.length) * dir || alpha(a, b));
  return arr;
}

/** Words bucketed by length, in the order they arrive. Callers pass an already
 *  sorted list, so a Map preserves that order rather than imposing its own —
 *  which is why this does not sort the keys. */
export function byLength(words: readonly string[]): [number, string[]][] {
  const m = new Map<number, string[]>();
  for (const w of words) {
    const g = m.get(w.length) ?? [];
    g.push(w);
    m.set(w.length, g);
  }
  return [...m];
}
