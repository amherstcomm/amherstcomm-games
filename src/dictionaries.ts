// The word lists, consumed as published artifacts rather than derived here.
//
// scripts/build-words.mjs cuts SCOWL and the large open list into four bands
// and seeds the Postgres words table from the same rows, so the client and
// the database cannot disagree by construction. Every pool below is a union
// of bands: generation is one band, acceptance is the bands up to a cut.
//
// In production the bands come from a CDN at a pinned tag — a shared,
// versioned artifact other projects read too — with the copies bundled into
// this app as the fallback, code-split so they cost nothing while the CDN
// answers. Dev and tests always use the bundle: deterministic, offline, and
// the CDN path stays a production concern.
import type { Difficulty } from '@/difficulty';

/** Bump together with the git tag when the lists are rebuilt. The tagged CDN
 *  URL is immutable, so caching is safe forever; the bundled fallback ships
 *  in the same commit, so the two can never disagree about a version. */
export const WORDS_VERSION = 'words-v4';

/** slur never scores and is never shown, anywhere, under any setting.
 *  strong and mild score; they exist so a player can choose not to be
 *  shown them. */
export type WordFlag = 'slur' | 'strong' | 'mild';

type Band = { version: string; words: string[]; flags: Record<string, WordFlag> };

const BAND_NAMES = ['band-35', 'band-55', 'band-70', 'band-80'] as const;
type BandName = (typeof BAND_NAMES)[number];

// lazy imports so a band is only ever loaded once, and only when needed
const bundled = import.meta.glob('./wordbands/band-*.json');

async function loadBand(name: BandName): Promise<Band> {
  if (import.meta.env.PROD) {
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 4000);
      const r = await fetch(
        `https://cdn.jsdelivr.net/gh/rptetzloff/anagrimoire@${WORDS_VERSION}/src/wordbands/${name}.json`,
        { signal: ctl.signal }
      );
      clearTimeout(timer);
      if (r.ok) {
        const band = (await r.json()) as Band;
        // a wrong version means a stale cache or a bad deploy — the bundle is
        // the same data and always the right version
        if (band?.version === WORDS_VERSION && Array.isArray(band.words)) return band;
      }
    } catch {
      // CDN down or slow — the bundle serves
    }
  }
  return ((await bundled[`./wordbands/${name}.json`]()) as { default: Band }).default;
}

const bandCache = new Map<BandName, Promise<Band>>();

function band(name: BandName): Promise<Band> {
  let p = bandCache.get(name);
  if (!p) {
    p = loadBand(name);
    bandCache.set(name, p);
  }
  return p;
}

/** Union of bands, sorted, optionally dropping flagged words. Bands are
 *  disjoint by construction, so concat-and-sort is a true union. */
async function union(names: BandName[], drop?: (flag: WordFlag | undefined) => boolean): Promise<string[]> {
  const bands = await Promise.all(names.map(band));
  const out: string[] = [];
  for (const b of bands) {
    for (const w of b.words) {
      if (drop && drop(b.flags[w])) continue;
      out.push(w);
    }
  }
  return out.sort();
}

const poolCache = new Map<string, Promise<string[]>>();

function pooled(key: string, make: () => Promise<string[]>): Promise<string[]> {
  let p = poolCache.get(key);
  if (!p) {
    p = make();
    poolCache.set(key, p);
  }
  return p;
}

/** The raw SCOWL cuts, kept under their historical names for the code paths
 *  that predate difficulty (Learn mode, pattern play's letter statistics). */
export type DictionaryId = 'common' | 'standard' | 'full';

const DICT_BANDS: Record<DictionaryId, BandName[]> = {
  common: ['band-35'],
  standard: ['band-35', 'band-55'],
  full: ['band-35', 'band-55', 'band-70', 'band-80'],
};

export function getDictionary(id: DictionaryId): Promise<string[]> {
  return pooled(`dict:${id}`, () => union(DICT_BANDS[id]));
}

/** The solver's lists are the difficulties' accept tiers, under the same
 *  names, so "Hard" in the solver means exactly what Hard accepts in play. */
export const DICTIONARIES: { id: Difficulty; label: string; blurb: string }[] = [
  { id: 'easy', label: 'Easy', blurb: 'Everyday words — best for Wordle-style puzzles' },
  { id: 'hard', label: 'Hard', blurb: 'Adds the less common words the harder puzzles accept' },
  { id: 'extreme', label: 'Extreme', blurb: 'Every word in the dictionary, obscurities included' },
];

// Acceptance is SCOWL and nothing else: 55, 70, 80 — every tier a size
// SCOWL itself defined.
const ACCEPT_BANDS: Record<Difficulty, BandName[]> = {
  easy: ['band-35', 'band-55'],
  hard: ['band-35', 'band-55', 'band-70'],
  extreme: ['band-35', 'band-55', 'band-70', 'band-80'],
};

/** What a difficulty accepts — one band wider than it generates from, minus
 *  the slurs, which never score anywhere under any setting. Answers should
 *  be recognisable at your level while what's accepted stays generous. */
export function getAcceptPool(difficulty: Difficulty): Promise<string[]> {
  return pooled(`accept:${difficulty}`, () =>
    union(ACCEPT_BANDS[difficulty], (flag) => flag === 'slur')
  );
}

/** How ordinary a word is, as the band it first appears in: 0 for the
 *  commonest, 3 for the obscure.
 *
 *  The bands already know this and `union` throws it away — it sorts, because
 *  every other caller wants a sorted list. The cryptogram solver is the one
 *  consumer that needs the opposite: when it offers ten readings of a shape,
 *  they have to be the ten a person would actually consider, and alphabetical
 *  puts "dye" and "ego" ahead of "the". Membership of a tier can't recover it
 *  — the common tier holds forty thousand words and "dye" is one of them —
 *  so the rank has to come from the bands themselves. */
export function getWordRank(): Promise<Map<string, number>> {
  return rankCache ??= (async () => {
    const bands = await Promise.all(BAND_NAMES.map(band));
    const rank = new Map<string, number>();
    bands.forEach((b, i) => {
      for (const w of b.words) if (!rank.has(w)) rank.set(w, i);
    });
    return rank;
  })();
}

let rankCache: Promise<Map<string, number>> | null = null;

const GENERATION_BAND: Record<Difficulty, BandName> = {
  easy: 'band-35',
  hard: 'band-55',
  extreme: 'band-70',
};

/** The words a difficulty draws its practice puzzles from: the band it alone
 *  adds, so practising at a difficulty practises for it. Flagged words are
 *  left out entirely — the daily generator filters its answers through the
 *  blocklist, and practice handing anyone a rack it wouldn't would be the
 *  same mistake with a different clock. */
export function getDifficultyPool(difficulty: Difficulty): Promise<string[]> {
  return pooled(`band:${difficulty}`, () =>
    union([GENERATION_BAND[difficulty]], (flag) => flag !== undefined)
  );
}

/** A predicate for the display filter: true means show the word. 'none'
 *  short-circuits without loading the flags at all. Display only — this
 *  never touches an accept pool, so what scores is identical for every
 *  player on a board; slurs are absent from those pools before any of this
 *  runs. */
export async function getDisplayFilter(
  level: 'none' | 'strong' | 'all'
): Promise<(word: string) => boolean> {
  if (level === 'none') return () => true;
  const flags = await getWordFlags();
  return (word) => {
    const f = flags.get(word);
    if (!f) return true;
    return f === 'mild' && level === 'strong';
  };
}

/** Every flagged word across the lists, for the display filter: slur is
 *  always hidden; strong and mild are the player's choice. */
export function getWordFlags(): Promise<Map<string, WordFlag>> {
  let p = flagsCache;
  if (!p) {
    p = (async () => {
      const bands = await Promise.all(BAND_NAMES.map(band));
      const map = new Map<string, WordFlag>();
      for (const b of bands) for (const [w, f] of Object.entries(b.flags)) map.set(w, f);
      return map;
    })();
    flagsCache = p;
  }
  return p;
}
let flagsCache: Promise<Map<string, WordFlag>> | null = null;
