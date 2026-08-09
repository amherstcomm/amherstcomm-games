import english10 from 'wordlist-english/english-words-10.json';
import english20 from 'wordlist-english/english-words-20.json';
import english35 from 'wordlist-english/english-words-35.json';
import american10 from 'wordlist-english/american-words-10.json';
import american20 from 'wordlist-english/american-words-20.json';
import american35 from 'wordlist-english/american-words-35.json';

export type DictionaryId = 'common' | 'standard' | 'full';

export const DICTIONARIES: { id: DictionaryId; label: string; blurb: string }[] = [
  { id: 'common', label: 'Common', blurb: 'Everyday words — best for Wordle-style puzzles' },
  { id: 'standard', label: 'Standard', blurb: 'Common plus less frequent words' },
  { id: 'full', label: 'Full', blurb: 'Every word in the dictionary, obscurities included' },
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
const bandCache = new Map<string, Promise<string[]>>();

export function getDifficultyPool(difficulty: 'easy' | 'hard' | 'extreme'): Promise<string[]> {
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
