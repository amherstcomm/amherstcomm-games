import english10 from 'wordlist-english/english-words-10.json';
import english20 from 'wordlist-english/english-words-20.json';
import english35 from 'wordlist-english/english-words-35.json';
import american10 from 'wordlist-english/american-words-10.json';
import american20 from 'wordlist-english/american-words-20.json';
import american35 from 'wordlist-english/american-words-35.json';

import type { Difficulty } from '@/difficulty';

/** The raw SCOWL tiers the lists are built from — an implementation detail of
 *  the bands below, not something anyone picks. */
export type DictionaryId = 'common' | 'standard' | 'full';

/** The solver's lists are the difficulties' accept tiers, under the same
 *  names, so "Hard" in the solver finds exactly what Hard accepts in a game.
 *
 *  Widening a search isn't really difficulty — a bigger list makes solving
 *  easier, if anything. But one vocabulary that fits loosely beats two that
 *  each fit their half and leave you converting between them. `DictionaryId`
 *  below stays the raw SCOWL tiers; these are what you pick from. */
export const DICTIONARIES: { id: Difficulty; label: string; blurb: string }[] = [
  { id: 'easy', label: 'Easy', blurb: 'Everyday words — best for Wordle-style puzzles' },
  { id: 'hard', label: 'Hard', blurb: 'Adds the less common words the harder puzzles accept' },
  { id: 'extreme', label: 'Extreme', blurb: 'Every word in the dictionary, obscurities included' },
];

// SCOWL lists include capitalized entries ("OK") and apostrophes ("aren't");
// the solver only understands lowercase a-z.
function normalize(lists: string[][]): string[] {
  const seen = new Set<string>();
  for (const list of lists) {
    for (const raw of list) {
      const w = raw.toLowerCase();
      if (/^[a-z]+$/.test(w)) seen.add(w);
    }
  }
  return [...seen].sort();
}

const COMMON_TIERS = [english10, english20, english35, american10, american20, american35];

// Common ships in the main bundle; the larger tiers are fetched only when selected.
const loaders: Record<DictionaryId, () => Promise<string[]>> = {
  common: async () => normalize(COMMON_TIERS),
  standard: async () => {
    const extras = await Promise.all([
      import('wordlist-english/english-words-40.json'),
      import('wordlist-english/english-words-50.json'),
      import('wordlist-english/english-words-55.json'),
      import('wordlist-english/american-words-40.json'),
      import('wordlist-english/american-words-50.json'),
      import('wordlist-english/american-words-55.json'),
    ]);
    return normalize([...COMMON_TIERS, ...extras.map((m) => m.default)]);
  },
  full: async () => (await import('an-array-of-english-words')).default,
};

/** What a difficulty accepts — one band wider than it generates from.
 *
 *  Answers should be recognisable at your level while what's accepted stays
 *  generous: easy sets from common and takes standard, hard sets from standard
 *  and takes SCOWL's large list, extreme sets from that and takes everything.
 *  It also gives Grid its third rung, which board size alone couldn't — the
 *  score you're chasing is measured against this, so at extreme the obscure
 *  finds are what get you there.
 */
const acceptCache = new Map<string, Promise<string[]>>();

export function getAcceptPool(difficulty: Difficulty): Promise<string[]> {
  const hit = acceptCache.get(difficulty);
  if (hit) return hit;
  const load = (async () => {
    if (difficulty === 'easy') return getDictionary('standard');
    const wide = await getDifficultyPool('extreme'); // the 60-70 band
    const standard = await getDictionary('standard');
    if (difficulty === 'hard') return [...standard, ...wide].sort();
    const full = await getDictionary('full');
    // union rather than `full` alone: 521 words are in standard and missing
    // from the large list, and moving up a difficulty must never start
    // rejecting a word that was legal below it
    const seen = new Set(full);
    return [...full, ...standard.filter((w) => !seen.has(w)), ...wide.filter((w) => !seen.has(w))].sort();
  })();
  acceptCache.set(difficulty, load);
  return load;
}

const bandCache = new Map<string, Promise<string[]>>();

/** The words a difficulty draws its practice puzzles from.
 *
 *  The same bands the daily generator uses, so practising at a difficulty
 *  practises for it: each level draws from what it *adds*, not from everything
 *  up to it. Drawing from the whole nested pool would make extreme practice a
 *  third easy words, which is exactly the mistake the generator made first.
 *
 *  Loaded on demand and cached — extreme pulls two more SCOWL sizes that
 *  nothing else needs.
 */
export function getDifficultyPool(difficulty: Difficulty): Promise<string[]> {
  const hit = bandCache.get(difficulty);
  if (hit) return hit;
  const load = (async () => {
    if (difficulty === 'easy') return getDictionary('common');
    if (difficulty === 'hard') {
      const [common, standard] = await Promise.all([
        getDictionary('common'),
        getDictionary('standard'),
      ]);
      const seen = new Set(common);
      return standard.filter((w) => !seen.has(w));
    }
    const [standard, wider] = await Promise.all([
      getDictionary('standard'),
      (async () => {
        const extras = await Promise.all([
          import('wordlist-english/english-words-60.json'),
          import('wordlist-english/english-words-70.json'),
          import('wordlist-english/american-words-60.json'),
          import('wordlist-english/american-words-70.json'),
        ]);
        return normalize(extras.map((m) => m.default));
      })(),
    ]);
    const seen = new Set(standard);
    return wider.filter((w) => !seen.has(w));
  })();
  bandCache.set(difficulty, load);
  return load;
}

const cache = new Map<DictionaryId, Promise<string[]>>();

export function getDictionary(id: DictionaryId): Promise<string[]> {
  let promise = cache.get(id);
  if (!promise) {
    promise = loaders[id]();
    cache.set(id, promise);
  }
  return promise;
}
