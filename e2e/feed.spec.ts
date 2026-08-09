// Where the daily comes from. The database is the primary feed and the file
// the fallback — these tests pin the ordering, because "RPC first" is the
// entire anti-transparency point and a silent fall-through to the file would
// look identical in every other test.
import { expect, test } from './fixtures';

const appToday = () => new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString().slice(0, 10);

test('the daily comes from the RPC when the database has it', async ({ page }) => {
  // a board the file feed cannot contain — if these letters render, they
  // came through daily_puzzle()
  const board = { center: 'q', outers: ['w', 'x', 'y', 'z', 'j', 'k'], words: 42 };
  const payload = {
    date: appToday(),
    ...board,
    byDifficulty: { easy: board, hard: board, extreme: board },
    fetchedAt: new Date().toISOString(),
  };

  await page.route('https://stub.supabase.co/rest/v1/rpc/daily_puzzle**', async (route) => {
    const args = JSON.parse(route.request().postData() ?? '{}');
    if (args.p_game === 'hive') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(payload),
      });
    }
    return route.fallback();
  });

  await page.goto('/daily/hive');
  const letters = page.locator('main button').filter({ hasText: /^[a-z]$/i });
  await expect(letters).toHaveCount(7);
  expect((await letters.allTextContents()).sort().join('')).toBe('jkqwxyz');
});

test('an empty RPC falls back to the file feed and the daily still plays', async ({ page }) => {
  // the shared fixture answers every non-leaderboard RPC with null, so this
  // is the fallback path: the board must come from the generated files
  await page.goto('/daily/hive');
  const letters = page.locator('main button').filter({ hasText: /^[a-z]$/i });
  await expect(letters).toHaveCount(7);
});

test('a broken RPC is indistinguishable from an empty one', async ({ page }) => {
  await page.route('https://stub.supabase.co/rest/v1/rpc/daily_puzzle**', (route) =>
    route.fulfill({ status: 500, body: 'boom' })
  );
  await page.goto('/daily/hive');
  const letters = page.locator('main button').filter({ hasText: /^[a-z]$/i });
  await expect(letters).toHaveCount(7);
});
