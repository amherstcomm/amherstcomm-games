// One day's puzzles, generated and published. The unit both publishers share.
//
// The nightly window runs this fourteen times; ops/publish-day.sh runs it once,
// for the day somebody wants regenerated now rather than tonight. It lives in
// one place because two copies of "how a day is published" are two copies that
// would drift -- the window's loop body was the only copy until the second
// publisher needed it.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { themeFor } from './themedDaily.mjs';

/** Today's date where the puzzles roll, which is Eastern. Not the machine's
 *  zone: a VM in UTC would call 8 p.m. Eastern "tomorrow" and treat the board
 *  people are playing as one nobody has seen yet. */
export function easternToday(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(now);
}

/** Calendar arithmetic on the date itself; noon UTC keeps clear of DST. */
export function plusDays(date, days) {
  return new Date(new Date(`${date}T12:00:00Z`).getTime() + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

/** Generate `date` into `dir` and publish it. Returns the generator's theming
 *  lines, which are the one part of its output worth keeping: which days a
 *  themed list took over is the thing to see in a log, and "trust me, October
 *  is themed" is not a thing to find out is wrong on the first. */
export function publishDate(date, dir, baseEnv = process.env) {
  const env = {
    ...baseEnv,
    PUZZLES_DATE: date,
    PUZZLES_DATA_DIR: dir,
    SKIP_SOLVER_DATA: '1',
  };
  const said = execFileSync('node', ['scripts/fetch-puzzles.mjs'], {
    env,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  const theming = said.split(/\r?\n/).filter((line) => line.startsWith('Theming '));
  execFileSync('node', ['scripts/publish-puzzles.mjs'], { env, stdio: 'inherit' });
  return theming;
}

/** Read a published day back and say whether the word list was used.
 *
 *  The whole reason to regenerate a day by hand is to get a theme onto it, and
 *  the one check that proves it happened is the published word board carrying
 *  the list's own words -- the check ops/preflight.sh makes across a range. Both
 *  one-day publishers ask it here so they cannot report differently. */
export async function checkPublished(date, env = process.env, fetchImpl = fetch) {
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  const theme = await themeFor(date, env);
  const res = await fetchImpl(
    `${env.SUPABASE_URL}/rest/v1/daily_puzzles?select=payload&env=eq.prod&game=eq.words&puzzle_date=eq.${date}`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } }
  );
  const [row] = res.ok ? await res.json() : [];
  if (!row) return { ok: false, message: 'could not be read back after publishing' };
  if (theme && !row.payload?.themed) {
    return { ok: false, message: `is covered by "${theme.name}" but was published unthemed` };
  }
  return {
    ok: true,
    message: theme
      ? `published, themed from "${theme.name}"`
      : 'published — no word list covers it, so it is an ordinary day',
  };
}

/** Ask the database something with the service key. */
async function serviceRpc(fn, body, env, fetchImpl) {
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  const res = await fetchImpl(`${env.SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${fn}: ${res.status} ${await res.text()}`);
  return res.json();
}

/** Generate a tournament round's boards and publish them.
 *
 *  A round is one board per listed game for its whole span, generated from
 *  its first day as a third version of that day, so it is neither that day's
 *  daily nor any other day's. Published under env 'round' and dated at the
 *  round's first day -- the key result_is_plausible looks a board up by -- and
 *  only for the games the round lists. */
export async function publishRound(round, dir, baseEnv = process.env, fetchImpl = fetch) {
  const env = {
    ...baseEnv,
    PUZZLES_DATE: round.starts_on,
    PUZZLES_DATA_DIR: dir,
    SKIP_SOLVER_DATA: '1',
    PUZZLES_ROUND: '1',
  };
  execFileSync('node', ['scripts/fetch-puzzles.mjs'], {
    env,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  const rows = round.games.map((game) => ({
    puzzle_date: round.starts_on,
    env: 'round',
    game,
    payload: JSON.parse(readFileSync(join(dir, `round-daily-${game}.json`), 'utf8')),
  }));
  const key = baseEnv.SUPABASE_SERVICE_ROLE_KEY;
  const res = await fetchImpl(`${baseEnv.SUPABASE_URL}/rest/v1/daily_puzzles`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates',
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) throw new Error(`Round publish failed: ${res.status} ${await res.text()}`);
  return rows.length;
}

/** Publish every round whose first day falls between `from` and `until`.
 *
 *  Run by the nightly window over its fortnight, so a round is published the
 *  night before it starts and regenerated each night until then -- the same
 *  board every time unless the settings moved, which is the point.
 *
 *  A round under way is never regenerated: its board has been played, and a
 *  new one would put a different puzzle under everybody partway through it.
 *  A round starting today is published only if it is not there yet, which is
 *  the case of a round set up on the morning it begins. */
export async function publishRounds(from, until, dir, baseEnv = process.env, fetchImpl = fetch) {
  const rounds = (await serviceRpc('rounds_to_publish', { p_from: from, p_until: until }, baseEnv, fetchImpl)) ?? [];
  const today = easternToday();
  const said = [];
  for (const round of rounds) {
    if (round.starts_on < today) continue;
    if (round.starts_on === today) {
      const key = baseEnv.SUPABASE_SERVICE_ROLE_KEY;
      const res = await fetchImpl(
        `${baseEnv.SUPABASE_URL}/rest/v1/daily_puzzles?select=game&env=eq.round&puzzle_date=eq.${round.starts_on}&limit=1`,
        { headers: { apikey: key, Authorization: `Bearer ${key}` } }
      );
      const existing = res.ok ? await res.json() : [];
      if (existing.length > 0) continue;
    }
    const n = await publishRound(round, dir, baseEnv, fetchImpl);
    said.push(`Round ${round.starts_on} to ${round.ends_on}: ${n} board${n === 1 ? '' : 's'} (${round.games.join(', ')})`);
  }
  return said;
}
