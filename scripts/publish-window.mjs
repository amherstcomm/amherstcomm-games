// Publishes a rolling fortnight of puzzles to Postgres: generate each date
// into a scratch directory, publish its rows, repeat. The RPC's date gate
// reveals one day at a time, so the future rows are outage insurance that
// nobody can ask for.
//
// This is what turns "GitHub Actions must be up every morning at 07:15" into
// "GitHub Actions must be up once a fortnight" — the generator stays where
// the compute is comfortable, and the schedule stops being urgent.
//
// Day 0 is generated here too, identically to the files the workflow just
// wrote (same date, same salt), so rows and files can never disagree.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const WINDOW_DAYS = 14;

const baseDate =
  process.env.PUZZLES_DATE ||
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());

// day arithmetic on the calendar date itself — noon UTC keeps clear of DST
const plus = (dateStr, days) =>
  new Date(new Date(`${dateStr}T12:00:00Z`).getTime() + days * 86_400_000)
    .toISOString()
    .slice(0, 10);

const dir = mkdtempSync(join(tmpdir(), 'anagrimoire-window-'));
try {
  for (let offset = 0; offset < WINDOW_DAYS; offset++) {
    const date = plus(baseDate, offset);
    const env = {
      ...process.env,
      PUZZLES_DATE: date,
      PUZZLES_DATA_DIR: dir,
      SKIP_SOLVER_DATA: '1',
    };
    // Output discarded except for the theming line. The generator is chatty —
    // a dozen "Wrote …" lines per day, fourteen days — but which days a themed
    // list took over is the one thing worth seeing in the nightly log, and
    // "trust me, October is themed" is not a thing to find out is wrong on the
    // first.
    const said = execFileSync('node', ['scripts/fetch-puzzles.mjs'], {
      env,
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    });
    for (const line of said.split(/\r?\n/)) {
      if (line.startsWith('Theming ')) console.log(line);
    }
    execFileSync('node', ['scripts/publish-puzzles.mjs'], { env, stdio: 'inherit' });
  }
  console.log(`Window published: ${baseDate} through ${plus(baseDate, WINDOW_DAYS - 1)}`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
