// The ten games, named once.
//
// **This file imports nothing, on purpose.** It is read by `vite.config.ts`,
// which esbuild bundles without the `@/` alias, so anything with an import
// here becomes a build error over there — and the sitemap is exactly the kind
// of list that goes stale when it cannot share a source. It is read by the e2e
// suite for the same reason.
//
// It exists because every per-game list that was not exhaustively typed has
// drifted. `MODES` was an array and the bridge solver shipped dead. `ORDER` in
// the leaderboard was an array and two games had boards with ranked players on
// them and no way to see either. The solver panel was gated by a denylist
// naming two of the four rule-based games. The sitemap and the accessibility
// sweep each kept their own list of eight, so ladder and bridge were in neither
// — unlisted for search engines and never once scanned by axe.
//
// Against that, one `Record<Mode, …>` caught eleven wiring sites in a single
// change, because the compiler asked. So: one list, and everything else derived
// from it.

/** How storage keys a game. Historical, and deliberately not the slug — the
 *  address bar says `guess` because that is what the game is called, while
 *  `pattern` stays put in every store that already used it. */
const MODES = [
  'pattern',
  'descramble',
  'bee',
  'boxed',
  'grid',
  'weave',
  'squares',
  'cryptogram',
  'ladder',
  'bridge',
] as const;
export type Mode = (typeof MODES)[number];
/** Spread rather than re-listed: the tuple above is the declaration, this is a
 *  mutable copy for callers that filter it. One list, two shapes. */
export const ALL_MODES: Mode[] = [...MODES];

/** What a person reads in a link before they click it. */
const SLUGS = [
  'guess',
  'scramble',
  'hive',
  'grid',
  'boxed',
  'weave',
  'squares',
  'cryptogram',
  'ladder',
  'bridge',
] as const;
export type Slug = (typeof SLUGS)[number];
export const ALL_SLUGS: Slug[] = [...SLUGS];

/** The three tabs a game can be shown in. */
const VIEWS = ['solve', 'play', 'learn'] as const;
export type View = (typeof VIEWS)[number];
export const ALL_VIEWS: View[] = [...VIEWS];

export const SLUG_MODE: Record<Slug, Mode> = {
  guess: 'pattern',
  scramble: 'descramble',
  hive: 'bee',
  grid: 'grid',
  boxed: 'boxed',
  weave: 'weave',
  squares: 'squares',
  cryptogram: 'cryptogram',
  ladder: 'ladder',
  bridge: 'bridge',
};

/** The inverse, built rather than written — two hand-kept tables are two
 *  chances to disagree.
 *
 *  This used to be `Object.fromEntries(...) as Record<Mode, Slug>`, and the
 *  cast was doing real damage: it *looked* exhaustive while promising nothing,
 *  so a Mode with no slug compiled cleanly and produced `undefined` at runtime.
 *  TypeScript cannot prove the inversion is total — that `SLUG_MODE` hits every
 *  Mode — so a test does, in `tests/unit/games.test.ts`. The type says the
 *  shape; the test says the coverage. */
export const MODE_SLUG = Object.fromEntries(
  SLUGS.map((slug) => [SLUG_MODE[slug], slug])
) as Record<Mode, Slug>;

/** What a game is called, in the two lengths the interface needs.
 *
 *  `short` is for a nav pill or a checkbox, where the row has to fit; `full` is
 *  for a sentence, a settings label or an invitation. Most games have one name
 *  and say it twice — only Guess, Squares and Ladder differ.
 *
 *  This was written out in six places and they disagreed. SettingsModal used
 *  both forms in the same file, and a comment in App claimed the short label
 *  "matches Learn, the boards and the home page" while three of those said the
 *  long one. */
export const GAME_NAME: Record<Mode, { short: string; full: string }> = {
  pattern: { short: 'Guess', full: 'Guess the Word' },
  descramble: { short: 'Scramble', full: 'Scramble' },
  bee: { short: 'Hive', full: 'Hive' },
  grid: { short: 'Grid', full: 'Grid' },
  boxed: { short: 'Boxed', full: 'Boxed' },
  weave: { short: 'Weave', full: 'Weave' },
  squares: { short: 'Squares', full: 'Word Squares' },
  cryptogram: { short: 'Cryptogram', full: 'Cryptogram' },
  ladder: { short: 'Ladder', full: 'Word Ladder' },
  bridge: { short: 'Bridge', full: 'Bridge' },
};

/** How each game is named in an invitation, keyed by the slug a link carries.
 *  Derived, so it cannot disagree with the table above. */
export const SLUG_NAME: Record<Slug, string> = Object.fromEntries(
  SLUGS.map((slug) => [slug, GAME_NAME[SLUG_MODE[slug]].full])
) as Record<Slug, string>;

/** What the puzzle feed and the database call each game.
 *
 *  A third name, after the storage key and the address slug, and not a spare:
 *  `daily_puzzles` is keyed on it, `report_puzzle` looks a board up by it, and
 *  the published files are named after it. Guess is `words` there for the same
 *  historical reason it is `pattern` in storage and `guess` in the bar.
 *
 *  It was written out four times before this — a string union in dailyData, a
 *  Record in App, and fourteen call-site literals — with nothing checking they
 *  agreed. */
//
// `as const satisfies` rather than a plain annotation: the annotation would
// widen every value to `string`, and things derive their own types from these
// literals — dailySync's DailyGame is this table's values, and a switch cannot
// be exhaustive over `string`. `satisfies` keeps the Record check that every
// mode appears, while `as const` keeps the literals.
export const FEED_NAME = {
  pattern: 'words',
  descramble: 'scramble',
  bee: 'hive',
  grid: 'grid',
  boxed: 'box',
  weave: 'weave',
  squares: 'squares',
  cryptogram: 'cryptogram',
  ladder: 'ladder',
  bridge: 'bridge',
} as const satisfies Record<Mode, string>;

/** What the *progress* tables call each game — `daily_progress.game` and
 *  `game_results.game`.
 *
 *  Yes, this is a fourth name, and yes it differs from FEED_NAME by exactly one
 *  entry: the published board is `words` and the row recording that you played
 *  it is `guess`. Both are internally consistent and neither was written down
 *  anywhere, which is the part worth fixing — a reader with one of these in
 *  hand had no way to know the other existed.
 *
 *  Unifying them is a database migration across two tables and their CHECK
 *  constraints, so it is a decision rather than a tidy. Naming them both is
 *  free and stops the next person guessing. */
export const PROGRESS_NAME = {
  pattern: 'guess',
  descramble: 'scramble',
  bee: 'hive',
  grid: 'grid',
  boxed: 'box',
  weave: 'weave',
  squares: 'squares',
  cryptogram: 'cryptogram',
  ladder: 'ladder',
  bridge: 'bridge',
} as const satisfies Record<Mode, string>;

/** The games that deal practice boards from a pre-generated pool. Not all of
 *  them do: Guess, Scramble, Hive, Grid and Boxed generate their own. */
export const POOL_MODES: Mode[] = ['weave', 'squares', 'cryptogram', 'ladder', 'bridge'];

/** Mode, from the name the progress tables use. The leaderboard and the
 *  history cards are keyed on that naming rather than on Mode, so this is how
 *  they reach a display name without keeping their own copy of one. */
export const MODE_BY_PROGRESS: Record<string, Mode> = Object.fromEntries(
  ALL_MODES.map((m) => [PROGRESS_NAME[m], m])
);

/** What to call a game, given whichever of its names you happen to hold. */
export function nameOfProgress(progress: string, which: 'short' | 'full' = 'full'): string {
  const mode = MODE_BY_PROGRESS[progress];
  return mode ? GAME_NAME[mode][which] : progress;
}

export function modeOf(slug: Slug): Mode {
  return SLUG_MODE[slug];
}
