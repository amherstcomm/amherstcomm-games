// The squares a word list can head, kept rather than searched again.
//
// This is the one calculator that costs seconds. Ruling a word out at 5x5 takes
// about 70ms against the everyday pool -- measured, 120 misses in 8.2s -- so a
// list with twenty five-letter words is a second and a half of searching, and
// Choosing a Day was paying it on every single lookup of a date. The answer
// cannot change between those lookups: the same words and the same dictionary
// give the same squares.
//
// So the search runs where the list is written -- the calculators on the word
// lists page -- and what it found is kept here for the pages that only want to
// read it. A miss is not an error; it searches, and fills this in for next time.
//
// Keyed by the words themselves and the word-list version, so it cannot go
// stale: edit the list and the key changes, ship a new band and every key
// changes. Nothing here is ever hand-edited or migrated -- a cache that has to
// be maintained is a stored derivation, which is the thing the house rules are
// against. Losing it costs one search.
import { store } from '@/siteStorage';
import { WORDS_VERSION } from '@/dictionaries';
import type { ThemedSquare } from '@/themeCalculators';

const PREFIX = 'anagrimoire:squares:';

/** What is kept per list: the boards, not merely how many, because Choosing a
 *  Day offers them and needs the rows. */
export type CachedSquares = { four: ThemedSquare[]; five: ThemedSquare[] };

/** The list, in a form that is the same list however it was typed: order and
 *  case are not part of what the search answers. Long lists hash rather than
 *  key on every word -- a 448-word list is a 4KB key otherwise. */
export function keyFor(words: string[]): string {
  const normal = [...new Set(words.map((w) => w.trim().toLowerCase()))].sort().join(' ');
  // djb2, not a cryptographic hash: this decides which cache line to read, and
  // a collision costs a wrong answer for one list, so the length goes in the
  // key as well to make one implausible rather than merely unlikely.
  let hash = 5381;
  for (let i = 0; i < normal.length; i += 1) hash = ((hash << 5) + hash + normal.charCodeAt(i)) | 0;
  return `${PREFIX}${WORDS_VERSION}:${normal.length}:${(hash >>> 0).toString(36)}`;
}

export function readSquares(words: string[]): CachedSquares | null {
  try {
    const raw = store.getItem(keyFor(words));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedSquares;
    // Shape-checked rather than trusted: this survives a release, and a version
    // that changed what a square looks like would otherwise render nonsense.
    if (!Array.isArray(parsed?.four) || !Array.isArray(parsed?.five)) return null;
    return parsed;
  } catch {
    // Storage refused, or held something this version cannot read. Either way
    // the answer is "search it", which is what a miss means.
    return null;
  }
}

export function writeSquares(words: string[], squares: CachedSquares): void {
  try {
    store.setItem(keyFor(words), JSON.stringify(squares));
  } catch {
    // Full, or storage is set to essentials only -- in which case nothing here
    // may be kept and the pages simply search each time, which is what they
    // did before this file existed.
  }
}
