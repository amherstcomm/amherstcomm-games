// Playing a tournament round.
//
// A round board is played through the daily machinery inside a different
// channel, so what has to be true is the part that differs: the round's board
// is the one on screen, nothing daily-only comes with it -- no practice
// toggle, no difficulty picker, no streak -- a game the round does not list is
// not quietly shown as the daily, and the daily is still there afterwards,
// untouched.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from './fixtures';
import { DATA_DIR } from './global-setup';

const easternToday = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
const plus = (date: string, n: number) =>
  new Date(new Date(`${date}T12:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);

const START = plus(easternToday(), -1);
const ROUND = {
  tournament_id: 't1',
  tournament: 'Ownership Cup',
  difficulty: 'hard',
  tournament_starts_on: START,
  tournament_ends_on: plus(START, 30),
  round_id: 'r1',
  starts_on: START,
  ends_on: plus(START, 6),
  games: ['hive', 'words'],
  number: 2,
  of: 4,
};

/** A round's hive: the fixture feed's own hive, re-dated to the round's first
 *  day and with different letters on the hard board, so the test can tell the
 *  round's board from the daily's by what is on screen. */
function roundHive() {
  const daily = JSON.parse(readFileSync(join(DATA_DIR, 'dev-daily-hive.json'), 'utf8'));
  const hard = { ...daily.byDifficulty.hard, center: 'q', outers: ['u', 'i', 'c', 'k', 'e', 'r'] };
  return { ...daily, date: START, byDifficulty: { ...daily.byDifficulty, hard } };
}

async function tournament(page: import('@playwright/test').Page, round: unknown) {
  const hive = roundHive();
  await page.route('**/rest/v1/rpc/**', (route) => {
    const url = route.request().url();
    const fn = url.match(/\/rpc\/(\w+)/)?.[1] ?? '';
    const reply = (body: unknown) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (fn === 'current_round') return reply(round);
    if (fn === 'round_puzzle') {
      const game = JSON.parse(route.request().postData() ?? '{}').p_game;
      return reply(game === 'hive' ? hive : null);
    }
    // Everything else as the shared fixture would answer: the daily comes
    // from the file feed, which is how the other specs play it too.
    return route.fallback();
  });
}

test('the round page lists its games, and a game opens on the round board', async ({ page }) => {
  await tournament(page, ROUND);
  await page.goto('/tournament');
  await expect(page.getByRole('heading', { name: /Ownership Cup/ })).toBeVisible();
  await expect(page.getByText(/Round 2 of 4/)).toBeVisible();

  await page.getByRole('list', { name: 'Games in this round' }).getByRole('link', { name: /Hive/ }).click();
  await expect(page).toHaveURL(/\/tournament\/hive$/);

  // The round's board, not the day's: the letters the round was dealt.
  await expect(page.getByRole('region', { name: 'Tournament round' })).toContainText('One attempt');
  await expect(page.getByText(/^q$/i).first()).toBeVisible();

  // Nothing daily-only came with it.
  await expect(page.getByRole('button', { name: /^Practice$/ })).toHaveCount(0);
  await expect(page.getByText('Difficulty', { exact: true })).toHaveCount(0);
});

// A game the round does not list is not played on the round's board -- and is
// not quietly shown as the daily under the round's address either.
test('a game the round does not include says so rather than showing the daily', async ({ page }) => {
  await tournament(page, ROUND);
  await page.goto('/tournament/grid');
  await expect(page.getByText("That game isn't in this round.")).toBeVisible();
  await expect(page.getByRole('button', { name: /^Practice$/ })).toHaveCount(0);
});

test('with nothing on, the page says so', async ({ page }) => {
  await tournament(page, null);
  await page.goto('/tournament');
  await expect(page.getByText('No tournament round is on today.')).toBeVisible();
});

// The round keeps its board under its own key, so the daily is exactly where
// it was: a round opened in the morning must not cost anybody their daily.
test('and the daily is still the daily afterwards', async ({ page }) => {
  await tournament(page, ROUND);
  await page.goto('/tournament/hive');
  await expect(page.getByText(/^q$/i).first()).toBeVisible();

  await page.goto('/daily/hive');
  await expect(page.getByRole('button', { name: /^Practice$/ })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Tournament round' })).toHaveCount(0);
});
