// Every list and theme at once, over a range of days.
//
// The panel beside a list answers "what can this one make". This answers the
// question that only exists once they are all written: is October covered?
// Lists overlap on purpose — a standing one for the month, a narrower one for
// the week of the meeting — and what nobody can hold in their head is which
// days that leaves themed, with how much, and where the holes are.
//
// The days themselves come from the server, which asks daily_theme and
// daily_weave_themes: the same two questions the nightly generator asks, with
// the same dates. What is worked out here is what the generator will then *do*
// with the answer, which is the part a browser can compute and a person cannot.
import { supabase } from '@/supabase';
import { boxesFrom, bridgesFrom, laddersFrom, LADDER_TIERS } from '@/themeCalculators';
import { TIERS, tiersFor } from '@/cryptogramFit';
import { BOARD_CELLS, fitsBoard } from '@/weaveFit';

/** The lengths the daily word is generated for — scripts/fetch-puzzles.mjs
 *  draws a board for each of these every day, so "themed" is per length rather
 *  than per day: a list with no seven-letter words still themes the other
 *  nine. Pinned to the generator's own loop by the unit tests. */
export const GUESS_LENGTHS = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

/** A scramble rack is one word shuffled, so a themed rack needs a theme word of
 *  exactly this length. Read out of the generator by the unit tests. */
export const RACK_SIZE = 7;

/** Whether a theme word could seed a hive: seven distinct letters, so the board
 *  is completable by the word it was built from, and no `s` or plurals flood
 *  the answer list. The same rule as scripts/themedDaily.mjs, asserted against
 *  that function rather than against a copy of the sentence. */
export const canSeedHive = (word: string) =>
  word.length >= 7 && new Set(word).size === 7 && !word.includes('s');

export type WeaveTheme = { clue: string; spangram: string; words: string[] };
export type DayPassage = { text: string; author: string | null; letters: number };
export type CoverageDay = {
  date: string;
  theme: { name: string; words: string[] } | null;
  weave: WeaveTheme[];
  /** the cryptogram passages written for the day, if any */
  passages?: DayPassage[];
};

export async function readCoverage(
  from: string,
  until: string
): Promise<{ ok: boolean; reason?: string; days: CoverageDay[] }> {
  if (!supabase) return { ok: false, reason: 'not connected', days: [] };
  const { data, error } = await supabase.rpc('theme_coverage', { p_from: from, p_until: until });
  if (error) return { ok: false, reason: error.message, days: [] };
  const res = (data ?? {}) as { ok?: boolean; reason?: string; days?: CoverageDay[] };
  return { ok: res.ok === true, reason: res.reason, days: res.days ?? [] };
}

export type DayYield = {
  date: string;
  /** the lists covering it, merged, as the generator sees them */
  name: string;
  words: string[];
  /** how many words of each generated length, so a day with only sixes is
   *  visibly a day with only sixes */
  pools: Record<number, number>;
  boxes: number;
  /** boxes a player could finish in two ordinary words, or null while the
   *  dictionary is still on its way */
  playable: number | null;
  bridges: number;
  /** theme words that could be the day's scramble rack */
  racks: number;
  /** the ladder tiers the day's own words could set a pair for, or null while
   *  the rung list is still on its way */
  ladders: string[] | null;
  /** theme words that could seed the day's hive */
  hives: number;
  /** the board sizes at least one of the day's Weave themes tiles */
  tiles: string[];
  /** the cryptogram difficulties at least one of the day's passages can play */
  ciphers: string[];
};

/** The board sizes at least one of a day's Weave themes tiles. Separate from
 *  the words below because the two halves theme different games and a day can
 *  easily have one and not the other. */
export function tilesFor(themes: WeaveTheme[]): string[] {
  return Object.entries(BOARD_CELLS)
    .filter(([, cells]) => themes.some((t) => fitsBoard(t.spangram, t.words, cells).fits))
    .map(([tier]) => tier);
}

/** What one day's words yield. Taken as words rather than as a day so the
 *  answer can be reused: a list covering a month hands back thirty-one
 *  identical sets, and the box search is the only costly thing here. */
export function yieldOf(words: string[], dictionary?: string[], rungs?: Set<string>) {
  const pools: Record<number, number> = {};
  for (const len of GUESS_LENGTHS) pools[len] = words.filter((w) => w.length === len).length;
  const boxes = boxesFrom(words, dictionary);
  // Both ends of a ladder have to be the theme's own and both have to be words
  // the board accepts as rungs, so this is the one measurement here that needs
  // the everyday dictionary rather than the generation pool.
  const pairs = rungs ? laddersFrom(words, rungs) : null;
  return {
    ladders: pairs
      ? Object.keys(LADDER_TIERS).filter((tier) => pairs.some((p) => p.tier === tier))
      : null,
    pools,
    // The two boards a theme can be *built* from rather than merely scored in.
    racks: words.filter((w) => w.length === RACK_SIZE).length,
    hives: words.filter(canSeedHive).length,
    boxes: boxes.length,
    playable: dictionary ? boxes.filter((b) => b.guaranteed).length : null,
    bridges: bridgesFrom(words).length,
  };
}

/** The cryptogram difficulties a day's own passages could play.
 *
 *  Per tier rather than per day, for the same reason the daily word is per
 *  length: the bands differ, so a month of 60-letter passages themes easy and
 *  hard and leaves extreme on the curated pool. A day that themes two of three
 *  looks themed and is two-thirds themed. */
export function ciphersFor(passages: DayPassage[] = []): string[] {
  return TIERS.filter((tier) => passages.some((p) => tiersFor(p.text).includes(tier)));
}

export function yieldFor(day: CoverageDay, dictionary?: string[], rungs?: Set<string>): DayYield {
  const words = day.theme?.words ?? [];
  return {
    date: day.date,
    name: day.theme?.name ?? '',
    words,
    ...yieldOf(words, dictionary, rungs),
    tiles: tilesFor(day.weave),
    ciphers: ciphersFor(day.passages),
  };
}

export type Summary = {
  days: number;
  themed: number;
  /** days no list covers — the generator makes its ordinary day, which is fine
   *  in June and is the thing to know about in October */
  gaps: string[];
  /** per generated length: how many of the themed days have a word of it, and
   *  the smallest pool any of them draws from */
  lengths: { length: number; days: number; smallest: number }[];
  weave: { withTheme: number; tiling: number; gaps: string[]; perTier: Record<string, number> };
  boxes: { days: number; playable: number | null };
  bridges: { days: number };
  /** days whose theme could supply the board itself, not just bonus words */
  scramble: { days: number };
  hive: { days: number };
  /** days whose own words can set a ladder, and which tiers they reach —
   *  null until the rung list arrives, rather than nought */
  ladder: { days: number | null; perTier: Record<string, number> };
  /** days with a passage of the deployment's own, and which tiers it reaches */
  cryptogram: { withPassage: number; days: number; perTier: Record<string, number> };
};

/** What each day yields, memoised by the words it has.
 *
 *  Separated from the fold below so the same work can be done a slice at a
 *  time: this is where all the cost is, and a month of overlapping lists is a
 *  month of different unions, so the memo helps least exactly when the range is
 *  most interesting.
 */
export function yieldsFor(
  days: CoverageDay[],
  dictionary?: string[],
  rungs?: Set<string>
): DayYield[] {
  const seen = new Map<string, ReturnType<typeof yieldOf>>();
  return days.map((day) => oneYield(day, dictionary, rungs, seen));
}

function oneYield(
  day: CoverageDay,
  dictionary: string[] | undefined,
  rungs: Set<string> | undefined,
  seen: Map<string, ReturnType<typeof yieldOf>>
): DayYield {
  const words = day.theme?.words ?? [];
  const key = words.join(' ');
  let made = seen.get(key);
  if (!made) {
    made = yieldOf(words, dictionary, rungs);
    seen.set(key, made);
  }
  return {
    date: day.date,
    name: day.theme?.name ?? '',
    words,
    ...made,
    tiles: tilesFor(day.weave),
    ciphers: ciphersFor(day.passages),
  };
}

/** The counting, once the days have been measured. Cheap, and deliberately
 *  separate: it is the half that must not be written twice. */
export function fold(days: CoverageDay[], yields: DayYield[]): Summary {
  const lengths = GUESS_LENGTHS.map((length) => {
    const themed = yields.filter((y) => y.pools[length] > 0);
    return {
      length,
      days: themed.length,
      smallest: themed.length === 0 ? 0 : Math.min(...themed.map((y) => y.pools[length])),
    };
  });

  const perTier: Record<string, number> = {};
  for (const tier of Object.keys(BOARD_CELLS)) {
    perTier[tier] = yields.filter((y) => y.tiles.includes(tier)).length;
  }

  // Unknown rather than nought when the dictionary never arrived: every day
  // reports its guarantee as unknown, and a count of nought would read as "none
  // of them can be finished".
  const knownGuarantee = yields.every((y) => y.playable !== null);

  return {
    days: days.length,
    themed: yields.filter((y) => y.words.length > 0).length,
    gaps: yields.filter((y) => y.words.length === 0).map((y) => y.date),
    lengths,
    weave: {
      withTheme: days.filter((d) => d.weave.length > 0).length,
      tiling: yields.filter((y) => y.tiles.length > 0).length,
      gaps: yields.filter((y) => y.tiles.length === 0).map((y) => y.date),
      perTier,
    },
    boxes: {
      days: yields.filter((y) => y.boxes > 0).length,
      playable: knownGuarantee ? yields.filter((y) => (y.playable ?? 0) > 0).length : null,
    },
    bridges: { days: yields.filter((y) => y.bridges > 0).length },
    scramble: { days: yields.filter((y) => y.racks > 0).length },
    hive: { days: yields.filter((y) => y.hives > 0).length },
    ladder: {
      days: yields.every((y) => y.ladders !== null)
        ? yields.filter((y) => (y.ladders ?? []).length > 0).length
        : null,
      perTier: Object.fromEntries(
        Object.keys(LADDER_TIERS).map((tier) => [
          tier,
          yields.filter((y) => (y.ladders ?? []).includes(tier)).length,
        ])
      ),
    },
    cryptogram: {
      // Written for the day, against actually usable by some tier: a passage
      // no band takes is the one failure worth separating out, because it
      // looks like a day that is covered and is a day that is not.
      withPassage: days.filter((d) => (d.passages?.length ?? 0) > 0).length,
      days: yields.filter((y) => y.ciphers.length > 0).length,
      perTier: Object.fromEntries(
        TIERS.map((tier) => [tier, yields.filter((y) => y.ciphers.includes(tier)).length])
      ),
    },
  };
}

export function summarise(
  days: CoverageDay[],
  dictionary?: string[],
  rungs?: Set<string>
): Summary {
  return fold(days, yieldsFor(days, dictionary, rungs));
}

/** How many days are measured before the browser is handed back. Small enough
 *  that a slice is a frame or two even on the expensive days, big enough that a
 *  month is a handful of slices rather than thirty-one round trips. */
export const SLICE = 4;

/** The same answer, computed without holding the page still.
 *
 *  Measured rather than assumed: a month of two overlapping lists took six
 *  seconds of blocked main thread, which is what "coverage locks up the
 *  browser" was. Indexing the dictionary once took that to under half a
 *  second — and a year of it would still be seconds, so the work is also
 *  handed back between slices. Both, because the second alone leaves a page
 *  that is responsive and slow, and the first alone leaves a page that freezes
 *  whenever somebody asks for more than a month.
 *
 *  `pause` is injectable so a test can prove it actually yields rather than
 *  merely being async.
 */
export async function summariseSlowly(
  days: CoverageDay[],
  dictionary?: string[],
  onProgress?: (done: number, total: number) => void,
  pause: () => Promise<void> = () => new Promise((resolve) => setTimeout(resolve, 0)),
  rungs?: Set<string>
): Promise<Summary> {
  const seen = new Map<string, ReturnType<typeof yieldOf>>();
  const yields: DayYield[] = [];
  for (const day of days) {
    yields.push(oneYield(day, dictionary, rungs, seen));
    if (yields.length % SLICE === 0 && yields.length < days.length) {
      onProgress?.(yields.length, days.length);
      await pause();
    }
  }
  return fold(days, yields);
}

/** Consecutive dates as ranges: eleven separate dates is a list nobody reads,
 *  and "5–15 October" is the same information as a sentence. */
export function runsOf(dates: string[]): string[] {
  const out: string[] = [];
  let run: string[] = [];
  const flush = () => {
    if (run.length === 0) return;
    out.push(run.length === 1 ? run[0] : `${run[0]}–${run[run.length - 1]}`);
    run = [];
  };
  for (const date of dates) {
    const previous = run[run.length - 1];
    // Dates are ISO and come back in order; a day apart is a day apart.
    if (previous && Date.parse(date) - Date.parse(previous) === 86_400_000) run.push(date);
    else {
      flush();
      run = [date];
    }
  }
  flush();
  return out;
}
