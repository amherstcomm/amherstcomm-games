// The game tables, for the scripts.
//
// `src/games.ts` is the one place the ten games are named, and the scripts
// cannot import it: they are plain `.mjs` run by node with no build step, and
// it is TypeScript. So it is read as text.
//
// That is uglier than an import and better than the alternative, which is what
// was here before — each script keeping its own copy. Three of them did, all
// said eight, and the two games missing were absent from the sitemap and from
// the accessibility sweep for as long as they had existed.
//
// Everything here throws rather than falling back. An undercount is precisely
// the failure being fixed, and a parser that quietly returns a short list is
// worse than no parser at all: it looks like it worked.

import { readFileSync } from 'node:fs';

const SRC = 'src/games.ts';

function source() {
  try {
    return readFileSync(SRC, 'utf8');
  } catch {
    throw new Error(`cannot read ${SRC} — scripts must run from the repository root`);
  }
}

/** The string literals inside a `const NAME = [...] as const;` tuple. */
function tuple(name) {
  const m = source().match(new RegExp(`const ${name} = \\[([^\\]]*)\\] as const;`));
  if (!m) throw new Error(`could not find the ${name} tuple in ${SRC}`);
  const out = [...m[1].matchAll(/'([a-z]+)'/g)].map((x) => x[1]);
  if (out.length < 10) throw new Error(`only ${out.length} entries parsed from ${name}`);
  return out;
}

/** The values of a `const NAME = { key: 'value', … }` table, in order. */
function table(name) {
  const m = source().match(new RegExp(`export const ${name} = \\{([^}]*)\\}`));
  if (!m) throw new Error(`could not find the ${name} table in ${SRC}`);
  const out = Object.fromEntries(
    [...m[1].matchAll(/(\w+):\s*'([a-z]+)'/g)].map((x) => [x[1], x[2]])
  );
  const n = Object.keys(out).length;
  if (n < 10) throw new Error(`only ${n} entries parsed from ${name}`);
  return out;
}

/** How storage keys each game. */
export const MODES = tuple('MODES');

/** What a person reads in a link. */
export const SLUGS = tuple('SLUGS');

/** What the puzzle feed and `daily_puzzles` call each game — Guess is `words`
 *  there. Keyed by mode. */
export const FEED_NAME = table('FEED_NAME');

/** What `daily_progress` and `game_results` call it — Guess is `guess` there.
 *  The two differ on that one game and nothing else. */
export const PROGRESS_NAME = table('PROGRESS_NAME');

/** Feed names of the games whose practice boards come from a published pool. */
export const POOL_FEEDS = (() => {
  const m = source().match(/export const POOL_MODES: Mode\[\] = \[([^\]]*)\]/);
  if (!m) throw new Error(`could not find POOL_MODES in ${SRC}`);
  const modes = [...m[1].matchAll(/'([a-z]+)'/g)].map((x) => x[1]);
  if (!modes.length) throw new Error('POOL_MODES parsed empty');
  return modes.map((mode) => {
    const feed = FEED_NAME[mode];
    if (!feed) throw new Error(`no feed name for pool mode ${mode}`);
    return feed;
  });
})();

/** Every game's feed name, in the order the modes are declared. */
export const FEED_NAMES = MODES.map((m) => {
  const feed = FEED_NAME[m];
  if (!feed) throw new Error(`no feed name for mode ${m}`);
  return feed;
});
