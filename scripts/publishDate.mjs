// One day's puzzles, generated and published. The unit both publishers share.
//
// The nightly window runs this fourteen times; ops/publish-day.sh runs it once,
// for the day somebody wants regenerated now rather than tonight. It lives in
// one place because two copies of "how a day is published" are two copies that
// would drift -- the window's loop body was the only copy until the second
// publisher needed it.
import { execFileSync } from 'node:child_process';

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
