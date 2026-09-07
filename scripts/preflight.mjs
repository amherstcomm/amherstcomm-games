// Is this deployment actually ready to publish a themed month?
//
// Every part of the themed pipeline can be checked on its own, and each of them
// has been at some point. What nobody could check was the *chain*: the settings
// are in the database, the generator reads them, the publish writes rows, and
// the site reads those rows. A break anywhere in it looks, from the admin
// pages, exactly like a month that is set up — which is the failure this whole
// area keeps producing, and the reason it is worth one command that walks the
// whole thing and says which link is missing.
//
// Read-only. Nothing here writes a row, publishes a puzzle or changes a
// setting, so it is safe to run at any hour and safe to run repeatedly.
//
// Usage (from the VM checkout, through ops/preflight.sh so the credentials are
// loaded):
//
//   ops/preflight.sh                       today, and the fortnight ahead
//   ops/preflight.sh --from 2026-10-01 --days 31
//
// Exit code is 0 when every check passed, 1 when any failed. A warning is not
// a failure: "no theme covers these days" is correct in June and is the whole
// question in October, and this cannot tell which month you meant.
import { themeFor, weaveThemesFor, passagesFor, policyFor, pinsFor } from './themedDaily.mjs';
import { FEED_NAMES } from './games.mjs';

const args = {};
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i]?.replace(/^--/, '');
  if (key) args[key] = process.argv[i + 1];
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !KEY) {
  console.error(
    'Nothing to check: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must both be set.\n' +
      'Run this through ops/preflight.sh, which loads ops/publish.env.'
  );
  process.exit(1);
}

const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
const from = args.from ?? today;
const days = Number(args.days ?? 14);
const plus = (date, n) =>
  new Date(new Date(`${date}T12:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);
const dates = Array.from({ length: days }, (_, i) => plus(from, i));

// How many rows a complete day has, read from the list of games rather than
// counted by hand: a tenth game added and this check left at nine would call
// every day thin, and an eleventh would call a broken day complete.
const GAMES = FEED_NAMES.length;

let failed = 0;
const say = (ok, label, detail) => {
  if (ok === false) failed += 1;
  const mark = ok === true ? 'PASS' : ok === false ? 'FAIL' : 'note';
  console.log(`${mark}  ${label}${detail ? ` — ${detail}` : ''}`);
};

const rest = async (path) => {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json();
};

const rpc = async (fn, body = {}) => {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json();
};

console.log(`Checking ${SUPABASE_URL} for ${days} day${days === 1 ? '' : 's'} from ${from}.\n`);

// ---------------------------------------------------------------------------
// The database itself
// ---------------------------------------------------------------------------
try {
  await rest('daily_puzzles?select=puzzle_date&limit=1');
  say(true, 'the database answers');
} catch (error) {
  say(false, 'the database answers', String(error.message ?? error));
  console.error('\nNothing else can be checked without it. Stopping here.');
  process.exit(1);
}

// The functions the generator calls. A schema that was never re-applied is the
// single most likely thing to be wrong here, and it fails in the quietest
// possible way: the fetchers treat "no such function" the same as "nothing
// covers this day", so a stale database publishes ordinary puzzles happily.
const NEEDED = [
  ['daily_theme', { p_date: today }],
  ['daily_weave_themes', { p_date: today }],
  ['daily_cryptogram_passages', { p_date: today }],
  ['daily_word_policy', { p_date: today }],
  ['daily_pins', { p_date: today }],
  ['sweep_reporter_emails', null],
];
for (const [fn, body] of NEEDED) {
  if (body === null) {
    // Called with the wrong argument count on purpose: a function that exists
    // answers 404-with-a-signature-complaint differently from one that does
    // not exist at all, and this one must not actually be run -- it deletes
    // addresses.
    try {
      await rpc(fn, { p_never: true });
      say(true, `${fn}() is present`);
    } catch (error) {
      const missing = /could not find|does not exist/i.test(String(error.message ?? error));
      say(!missing, `${fn}() is present`, missing ? 're-run supabase/schema.sql' : 'present');
    }
    continue;
  }
  try {
    await rpc(fn, body);
    say(true, `${fn}() is present`);
  } catch (error) {
    say(false, `${fn}() is present`, `re-run supabase/schema.sql (${error.message ?? error})`);
  }
}

// Squares became pinnable in September 2026, and that changed pin_puzzle. It is
// the one schema change whose absence shows up as a page that simply refuses,
// so it is worth naming rather than leaving to the reader to notice.
try {
  const answer = await rpc('pin_puzzle', {
    p_date: null,
    p_game: 'squares',
    p_difficulty: null,
    p_choice: {},
  });
  // A null date is refused by every version; what differs is the reason. The
  // old one refuses the *game* first.
  const stale = String(answer?.reason ?? '').includes('no themed candidates');
  say(!stale, 'Squares can be pinned', stale ? 're-run supabase/schema.sql' : 'schema is current');
} catch {
  say(null, 'Squares can be pinned', 'could not tell — pin_puzzle refused the probe');
}

// ---------------------------------------------------------------------------
// What is set up, and what is published
// ---------------------------------------------------------------------------
const env = process.env;
const published = await rest(
  `daily_puzzles?select=puzzle_date,game,env&env=eq.prod&puzzle_date=gte.${dates[0]}` +
    `&puzzle_date=lte.${dates[dates.length - 1]}`
);
const byDate = new Map();
for (const row of published) {
  byDate.set(row.puzzle_date, (byDate.get(row.puzzle_date) ?? 0) + 1);
}

const themedDays = [];
const missing = [];
const thin = [];
for (const date of dates) {
  const games = byDate.get(date) ?? 0;
  if (games === 0) missing.push(date);
  // Ten games. Fewer is a publish that fell over part way, which is worth
  // separating from one that never ran: the first leaves a day half-playable.
  else if (games < GAMES) thin.push(`${date} (${games})`);
  const theme = await themeFor(date, env);
  if (theme) themedDays.push(`${date} ${JSON.stringify(theme.name)}`);
}

say(
  missing.length === 0,
  'every day in the range is published',
  missing.length ? `nothing for ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? '…' : ''}` : `${dates.length} days`
);
if (thin.length) say(false, `and each published day has all ${GAMES} games`, thin.join(', '));

// The half that matters in October, and the half that cannot be asserted:
// nobody but you knows whether these days were meant to be themed.
say(
  null,
  'days a word list covers',
  themedDays.length ? themedDays.slice(0, 8).join(' · ') + (themedDays.length > 8 ? ' …' : '') : 'none in this range'
);

const [weave, passages, policy, pins] = await Promise.all([
  weaveThemesFor(dates[0], env),
  passagesFor(dates[0], env),
  policyFor(dates[0], env),
  pinsFor(dates[0], env),
]);
say(
  null,
  `the first day (${dates[0]})`,
  [
    `${weave.length} Weave theme${weave.length === 1 ? '' : 's'}`,
    `${passages.length} passage${passages.length === 1 ? '' : 's'}`,
    Object.keys(policy).length ? `rules on ${Object.keys(policy).join(', ')}` : 'no word rules',
    Object.keys(pins).length ? `pinned ${Object.keys(pins).join(', ')}` : 'nothing pinned',
  ].join(' · ')
);

// ---------------------------------------------------------------------------
// What the site will actually serve
// ---------------------------------------------------------------------------
// The last link, and the one nothing else covers: the browser does not read
// daily_puzzles, it calls daily_puzzle(), which gates on the date. A row that
// exists and a row the site can have are different claims.
try {
  // 'words', not 'guess': the published board is words and the row saying you
  // played it is guess. Both names are real and they differ by exactly this
  // one game -- see FEED_NAME and the note beside it in src/games.ts.
  const served = await rpc('daily_puzzle', { p_game: 'words', p_env: 'prod' });
  const ok = Boolean(served && (served.payload ?? served.date ?? served.byDifficulty));
  say(ok, "today's board is served to the site", ok ? 'daily_puzzle() answers' : 'it answered with nothing');
} catch (error) {
  say(false, "today's board is served to the site", String(error.message ?? error));
}

console.log(
  failed === 0
    ? '\nReady. Everything the themed pipeline needs is in place for this range.'
    : `\n${failed} check${failed === 1 ? '' : 's'} failed. The month will publish, but not the way the settings say.`
);
process.exit(failed === 0 ? 0 : 1);
