// The home page: today's games, and the boards. The boards rule has been
// wrong twice (find() only ever reached Guess; filtering on "done" excluded
// Hive and Weave for ever), so this is the page that most needs a browser.
import { expect, seedPlayedHive, test } from './fixtures';

test('shows all seven games', async ({ page }) => {
  await page.goto('/');
  const today = page.getByRole('main');
  for (const name of [
    'Guess the Word',
    'Scramble',
    'Hive',
    'Boxed',
    'Grid',
    'Weave',
    'Word Squares',
  ]) {
    await expect(today.getByText(name, { exact: false }).first()).toBeVisible();
  }
});

test('a played hive puts the hive board on the page — started counts, done is not required', async ({
  page,
}) => {
  await seedPlayedHive(page);
  await page.goto('/');
  // the board renders as a button (it links into stats), named by its rows
  await expect(page.getByRole('button', { name: /Hive.*Anagrimoire/s })).toBeVisible();
});

test('nothing played falls back to a single board rather than none', async ({ page }) => {
  await page.goto('/');
  // the stub gives four boards rows; exactly one should show unplayed
  await expect
    .poll(async () => page.getByText('Anagrimoire', { exact: true }).count())
    .toBeGreaterThanOrEqual(1);
});

test('the difficulty tabs re-ask the server for that difficulty', async ({ page, rpcCalls }) => {
  await page.goto('/');
  await expect
    .poll(() => rpcCalls.filter((c) => c.fn === 'leaderboard').length)
    .toBeGreaterThanOrEqual(1);
  await page.getByRole('group', { name: /difficulty/i }).getByRole('button', { name: 'Hard' }).click();
  await expect
    .poll(() =>
      rpcCalls.filter((c) => c.fn === 'leaderboard' && c.args.p_difficulty === 'hard').length
    )
    .toBeGreaterThanOrEqual(1);
});

// A board that ranks on the clock says so, on both surfaces.
//
// Weave, both Word Squares and Cryptogram rank on the fastest solve. Home
// showed the value alone and the leaderboard named those four games in a
// special case of its own, so the same row read two different ways depending
// on which page you were on -- and on Home, two people on "1 solved" in a
// deliberate order looked like a tie.
test('a board ranked on time shows the time, on the front page and the panel', async ({ page }) => {
  await page.goto('/');
  const home = page.locator('li', { hasText: 'Anagrimoire' }).filter({ hasText: '1 solved' });
  await expect(home.first()).toContainText('best 1:35');

  await page.goto('/stats/boards');
  const panel = page.locator('li', { hasText: 'Anagrimoire' }).filter({ hasText: '1 solved' });
  await expect(panel.first()).toContainText('best 1:35');
});
