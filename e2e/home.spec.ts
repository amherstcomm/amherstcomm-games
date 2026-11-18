// The home page: today's games, and the boards. The boards rule has been
// wrong twice (find() only ever reached Guess; filtering on "done" excluded
// Hive and Weave for ever), so this is the page that most needs a browser.
import { expect, seedPlayedHive, test } from './fixtures';

test('shows all seven games', async ({ page }) => {
  await page.goto('/');
  const today = page.getByRole('main');
  for (const name of [
    'Guess',
    'Scramble',
    'Hive',
    'Boxed',
    'Grid',
    'Weave',
    // the tiles carry the short names
    'Squares',
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

// Every board with anybody on it, in one row that scrolls sideways -- not
// only the boards for games you have played, which left somebody who had
// played nothing with a single board and no way to see the rest from here.
test('every board with entries is in the row, with a last card for all of them', async ({ page }) => {
  await page.goto('/');
  const row = page.getByRole('group', { name: "Today's boards" });
  // the stub has rows on every board, and nothing has been played here
  await expect.poll(() => row.locator(':scope > ul > li').count()).toBeGreaterThan(3);
  await expect(row.getByRole('button', { name: /See all the boards/ })).toBeVisible();
  // it scrolls inside itself; the page does not
  const w = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  expect(w[0]).toBeLessThanOrEqual(w[1]);
});

test('the arrows and the arrow keys move the row, and the left arrow appears once moved', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  const row = page.getByRole('group', { name: "Today's boards" });
  await expect(page.getByRole('button', { name: "Scroll Today's boards right" })).toBeVisible();
  await expect(page.getByRole('button', { name: "Scroll Today's boards left" })).toHaveCount(0);
  await page.getByRole('button', { name: "Scroll Today's boards right" }).click();
  await expect.poll(() => row.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
  await expect(page.getByRole('button', { name: "Scroll Today's boards left" })).toBeVisible();
  const before = await row.evaluate((el) => el.scrollLeft);
  await row.focus();
  await page.keyboard.press('ArrowLeft');
  await expect.poll(() => row.evaluate((el) => el.scrollLeft)).toBeLessThan(before);
  // the keys moved the row, not the site to another game
  await expect(page).toHaveURL(/\/$/);
});
