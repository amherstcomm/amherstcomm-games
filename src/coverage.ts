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
import { boxesFrom, bridgesFrom } from '@/themeCalculators';
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
export type CoverageDay = {
  date: string;
  theme: { name: string; words: string[] } | null;
  weave: WeaveTheme[];
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
  /** theme words that could seed the day's hive */
  hives: number;
  /** the board sizes at least one of the day's Weave themes tiles */
  tiles: string[];
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
export function yieldOf(words: string[], dictionary?: string[]) {
  const pools: Record<number, number> = {};
  for (const len of GUESS_LENGTHS) pools[len] = words.filter((w) => w.length === len).length;
  const boxes = boxesFrom(words, dictionary);
  return {
    pools,
    // The two boards a theme can be *built* from rather than merely scored in.
    racks: words.filter((w) => w.length === RACK_SIZE).length,
    hives: words.filter(canSeedHive).length,
    boxes: boxes.length,
    playable: dictionary ? boxes.filter((b) => b.guaranteed).length : null,
    bridges: bridgesFrom(words).length,
  };
}

export function yieldFor(day: CoverageDay, dictionary?: string[]): DayYield {
  const words = day.theme?.words ?? [];
  return {
    date: day.date,
    name: day.theme?.name ?? '',
    words,
    ...yieldOf(words, dictionary),
    tiles: tilesFor(day.weave),
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
};

export function summarise(days: CoverageDay[], dictionary?: string[]): Summary {
  // One search per distinct set of words rather than per day: a list covering a
  // month hands back the same thirty-one sets, and the box search is the only
  // costly thing in here.
  const seen = new Map<string, ReturnType<typeof yieldOf>>();
  const yields: DayYield[] = days.map((day) => {
    const words = day.theme?.words ?? [];
    const key = words.join(' ');
    let made = seen.get(key);
    if (!made) {
      made = yieldOf(words, dictionary);
      seen.set(key, made);
    }
    return { date: day.date, name: day.theme?.name ?? '', words, ...made, tiles: tilesFor(day.weave) };
  });

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

  const withDictionary = dictionary ? yields.filter((y) => (y.playable ?? 0) > 0).length : null;

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
    boxes: { days: yields.filter((y) => y.boxes > 0).length, playable: withDictionary },
    bridges: { days: yields.filter((y) => y.bridges > 0).length },
    scramble: { days: yields.filter((y) => y.racks > 0).length },
    hive: { days: yields.filter((y) => y.hives > 0).length },
  };
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
