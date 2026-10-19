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

/** The site's day: Eastern time, rolling at 3:15 a.m. -- puzzle_day() in the
 *  schema, and what every page and every board is keyed by.
 *
 *  It was the Eastern *calendar* date, which is the same thing for all but
 *  three and a quarter hours of every night -- and those hours are when
 *  somebody fixing tomorrow's board works. Between midnight and 3:15 the
 *  calendar had already moved on while the site had not, so a republish of the
 *  next day thought that day was live: it would not regenerate a round board
 *  nobody had seen yet, and a pin changed at 12:53 a.m. never reached it.
 *  The nightly window runs at 03:15 and later, where the two agree, so it is
 *  unchanged. And Eastern, not the machine's zone: a VM in UTC would call
 *  8 p.m. Eastern "tomorrow" and treat the board people are playing as one
 *  nobody has seen yet. */
export function easternToday(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(
    new Date(now.getTime() - (3 * 60 + 15) * 60_000)
  );
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

/** Generate one date's round boards and publish the ones asked for.
 *
 *  Generated as a third version of that date, so a round board is neither the
 *  day's daily nor any other day's, and published under env 'round' dated at
 *  that date -- the key result_is_plausible looks a board up by, and the date
 *  a game saves its result under, since a board carries its own date. */
export async function publishRoundBoards(date, games, dir, baseEnv = process.env, fetchImpl = fetch) {
  const env = {
    ...baseEnv,
    PUZZLES_DATE: date,
    PUZZLES_DATA_DIR: dir,
    SKIP_SOLVER_DATA: '1',
    PUZZLES_ROUND: '1',
  };
  execFileSync('node', ['scripts/fetch-puzzles.mjs'], {
    env,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  const rows = games.map((game) => ({
    puzzle_date: date,
    env: 'round',
    game,
    payload: JSON.parse(readFileSync(join(dir, `round-daily-${game}.json`), 'utf8')),
  }));
  const key = baseEnv.SUPABASE_SERVICE_ROLE_KEY;
  const post = () =>
    fetchImpl(`${baseEnv.SUPABASE_URL}/rest/v1/daily_puzzles`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates',
      },
      body: JSON.stringify(rows),
    });
  // The generator above runs synchronously, for seconds a day, holding the
  // event loop: a kept-alive connection from an earlier request can be closed
  // by the server meanwhile, and the post then goes out on a dead socket and
  // fails before it reaches anybody. The post is an upsert, so sending it
  // again on a fresh connection is safe.
  let res;
  try {
    res = await post();
  } catch {
    res = await post();
  }
  if (!res.ok) throw new Error(`Round publish failed: ${res.status} ${await res.text()}`);
  return rows.length;
}

/** A round's single board for each of its games, dated at its first day. */
export async function publishRound(round, dir, baseEnv = process.env, fetchImpl = fetch) {
  return publishRoundBoards(round.starts_on, round.games, dir, baseEnv, fetchImpl);
}

/** Which of these games already have a round board on this date. Asked per
 *  game: two rounds' boards can share a date now -- one round's first day and
 *  another's daily board -- so "anything published that day" no longer means
 *  "this round's boards are there". */
async function publishedOn(date, games, baseEnv, fetchImpl) {
  const key = baseEnv.SUPABASE_SERVICE_ROLE_KEY;
  const res = await fetchImpl(
    `${baseEnv.SUPABASE_URL}/rest/v1/daily_puzzles?select=game&env=eq.round&puzzle_date=eq.${date}` +
      `&game=in.(${games.join(',')})`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } }
  );
  const rows = res.ok ? await res.json() : [];
  return new Set(rows.map((r) => r.game));
}

const daysFrom = (from, until) => {
  const out = [];
  for (let d = from; d <= until; d = plusDays(d, 1)) out.push(d);
  return out;
};

/** Publish what every round in the window needs.
 *
 *  Run by the nightly window over its fortnight. Two kinds of board:
 *
 *  A round's single board per game, dated at its first day, published the
 *  night before it starts and regenerated each night until then -- the same
 *  board every time unless the settings moved, which is the point. Never once
 *  the round is under way: its board has been played, and a new one would put
 *  a different puzzle under everybody partway through. A round starting today
 *  is published only if it is not there yet, which is the case of a round set
 *  up on the morning it begins.
 *
 *  A game with a new board each day gets one for every day of the round inside
 *  the window, each dated at its own day, by the same rules a day at a time:
 *  days ahead regenerate freely -- nobody can see them, round_puzzle serves
 *  only today's -- today's only if missing, because people are playing it, and
 *  a day that is over never. A round under way still has days ahead of it, and
 *  a round whose end moved later gets boards for its new days the next night.
 *
 *  One generator run per date, however many rounds want boards on it. */
export async function publishRounds(from, until, dir, baseEnv = process.env, fetchImpl = fetch) {
  const rounds = (await serviceRpc('rounds_to_publish', { p_from: from, p_until: until }, baseEnv, fetchImpl)) ?? [];
  const today = easternToday();
  const plan = new Map(); // date -> Set of games
  const want = (date, game) => {
    if (!plan.has(date)) plan.set(date, new Set());
    plan.get(date).add(game);
  };
  const said = [];

  for (const round of rounds) {
    const games = round.games ?? [];
    // A round may be trivia and nothing else: nothing to generate, and running
    // the generator for an empty list is a slow no-op.
    if (games.length === 0) continue;
    const daily = new Set(round.daily_games ?? []);
    const once = games.filter((g) => !daily.has(g));

    if (once.length > 0 && round.starts_on >= today && round.starts_on >= from) {
      const there = round.starts_on === today ? await publishedOn(today, once, baseEnv, fetchImpl) : new Set();
      if (!once.every((g) => there.has(g))) {
        for (const g of once) want(round.starts_on, g);
        said.push(
          `Round ${round.starts_on} to ${round.ends_on}: ${once.length} board${once.length === 1 ? '' : 's'} (${once.join(', ')})`
        );
      }
    }

    if (daily.size > 0) {
      const first = [round.starts_on, today, from].sort().at(-1);
      const last = [round.ends_on, until].sort()[0];
      const days = [];
      for (const day of daysFrom(first, last)) {
        const need = [...daily];
        let missing = need;
        if (day === today) {
          const there = await publishedOn(today, need, baseEnv, fetchImpl);
          missing = need.filter((g) => !there.has(g));
        }
        if (missing.length === 0) continue;
        for (const g of missing) want(day, g);
        days.push(day);
      }
      if (days.length > 0) {
        said.push(
          `Round ${round.starts_on} to ${round.ends_on}: a new board each day for ${[...daily].join(', ')} ` +
            `(${days.length === 1 ? days[0] : `${days[0]} to ${days.at(-1)}`})`
        );
      }
    }
  }

  for (const [date, games] of [...plan.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
    await publishRoundBoards(date, [...games], dir, baseEnv, fetchImpl);
  }
  return said;
}
