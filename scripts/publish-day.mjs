// Regenerate and publish one day, now rather than tonight.
//
// The nightly run already regenerates every day in the fortnight window from
// the settings as they stand, so a word list added today reaches every future
// day by tomorrow morning on its own. This is for when tomorrow morning is too
// late: a list fixed at lunch for tomorrow's meeting, a pin changed an hour
// before a board goes out.
//
// Usage (through ops/publish-day.sh, which loads the credentials):
//
//   ops/publish-day.sh 2026-10-08
//   ops/publish-day.sh 2026-09-10 --force     today, and it says why that matters
//
// The board is deterministic in the date, the salt and the settings, so what
// this publishes is exactly what tonight's run would publish for that day -- a
// day regenerated here and then again tonight comes out the same unless the
// settings moved in between, which is the point of running it.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { themeFor } from './themedDaily.mjs';
import { easternToday, publishDate } from './publishDate.mjs';

const args = process.argv.slice(2);
const force = args.includes('--force');
const date = args.find((a) => !a.startsWith('--'));

const fail = (message) => {
  console.error(message);
  process.exitCode = 1;
};

const SUPABASE_URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T12:00:00Z`))) {
  fail('Which day? ops/publish-day.sh YYYY-MM-DD');
} else if (!SUPABASE_URL || !KEY || !process.env.PUZZLES_SEED_SALT) {
  // The salt as well as the credentials: without it the board is a different
  // board, and publishing it would replace the day's real puzzle with one that
  // only looks right.
  fail(
    'Nothing to publish with: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and\n' +
      'PUZZLES_SEED_SALT must all be set. Run this through ops/publish-day.sh.'
  );
} else {
  const today = easternToday();

  // A day that has started is a day people have played. Regenerating it puts a
  // different board under anybody partway through -- their progress was saved
  // against the old one -- and changes what an already-recorded result was a
  // result *of*. So the ordinary answer is no, and the override is spelled out.
  if (date <= today && !force) {
    fail(
      `${date} is ${date === today ? 'today' : 'in the past'}, and its board is already live.\n\n` +
        'Anybody who has played it would find a different board under their saved\n' +
        'progress, and results already recorded would be for a board that no longer\n' +
        'exists. If that is what you mean, run it again with --force.'
    );
  } else {
    if (date <= today) {
      console.log(
        `Regenerating ${date} with --force. People who have already played it will see a different board.\n`
      );
    }

    const dir = mkdtempSync(join(tmpdir(), 'anagrimoire-day-'));
    try {
      for (const line of publishDate(date, dir)) console.log(line);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }

    // Said, not assumed: the whole reason this exists is to get a theme onto a
    // day, and the one check that proves it happened is the published board
    // carrying the list's own words. The same check preflight makes.
    const theme = await themeFor(date, process.env);
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/daily_puzzles?select=payload&env=eq.prod&game=eq.words&puzzle_date=eq.${date}`,
      { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } }
    );
    const [row] = res.ok ? await res.json() : [];
    if (!row) {
      fail(`\nPublished, but ${date} could not be read back — check ops/preflight.sh.`);
    } else if (theme && !row.payload?.themed) {
      fail(
        `\n${date} is covered by "${theme.name}" but published unthemed. ` +
          'The generator did not use the list — run ops/preview-month.sh for that day to see why.'
      );
    } else {
      console.log(
        `\n${date} published${theme ? `, themed from "${theme.name}"` : ' — no word list covers it, so it is an ordinary day'}.`
      );
    }
  }
}
