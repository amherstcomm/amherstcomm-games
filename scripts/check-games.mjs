// Do the client's game table and the database's agree?
//
// They are two copies of the same ten games on opposite sides of a network, and
// nothing structural can keep them in step — src/games.ts is TypeScript in a
// bundle, public.games is rows in Postgres. So this asks, rather than assuming.
//
// It runs daily rather than on every push. A push-time check would make CI
// depend on Supabase being reachable, and the rule here is that a red run is
// ours and never an outage's — the browser suite stubs every network for
// exactly that reason. Two tables that only change when somebody adds a game do
// not need catching within the minute.
//
// Exits non-zero on a mismatch so the workflow goes red, and prints the rows
// that disagree rather than just saying they do.

import {
  FEED_NAME,
  MODES,
  NAME_FULL,
  NAME_SHORT,
  PROGRESS_NAME,
  SLUG_MODE,
} from './games.mjs';

// No default. This file was forked from a project whose own URL was the
// fallback, so an unset SUPABASE_URL sent this deployment's key to somebody
// else's database — which answers, politely, that nothing is there. A missing
// URL has to look like a missing URL.
const SUPABASE_URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');

// mode -> slug, inverted from the one table that pairs them. Not by position:
// the two tuples are ordered differently and pairing by index would work right
// up until somebody reordered one.
const MODE_SLUG = Object.fromEntries(Object.entries(SLUG_MODE).map(([slug, mode]) => [mode, slug]));

// exactly the shape games_match_client expects, built from the client's own table
const games = MODES.map((mode) => {
  const row = {
    mode,
    slug: MODE_SLUG[mode],
    feed: FEED_NAME[mode],
    progress: PROGRESS_NAME[mode],
    name_full: NAME_FULL[mode],
    name_short: NAME_SHORT[mode],
  };
  for (const [k, v] of Object.entries(row)) {
    if (!v) throw new Error(`src/games.ts has no ${k} for ${mode}`);
  }
  return row;
});

const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/games_match_client`, {
  method: 'POST',
  headers: {
    apikey: KEY,
    Authorization: `Bearer ${KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ p_games: games }),
});

if (!res.ok) throw new Error(`games_match_client failed: ${res.status} ${await res.text()}`);

const rows = await res.json();
if (!rows.length) {
  console.log(`The ${games.length} games match between src/games.ts and public.games.`);
  process.exit(0);
}

console.error('The client and the database disagree about these games:\n');
for (const r of rows) {
  console.error(`  ${r.mode} · ${r.field}: database says ${r.here ?? '(missing)'}, client says ${r.client ?? '(missing)'}`);
}
console.error('\nOne of them is wrong. Adding a game means adding it to both.');
process.exit(1);
