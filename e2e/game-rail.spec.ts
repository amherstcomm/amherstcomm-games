// A game's own panel -- its progress, what it found, sharing -- in the rail
// beside the board when there is one, and inline where it always was when the
// rail has dropped below the game (railSlot.ts).
import { expect, test } from './fixtures';

test('Guess the Word: its game in the rail on a wide page, inline on a narrow one', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/daily/guess');
  const panel = page.getByRole('region', { name: 'Your game' });
  await expect(panel).toContainText('Guess 1 of 6');
  await expect(panel).toContainText('Played');
  // and not also above the board
  await expect(page.getByText(/^Streak \d+$/)).toHaveCount(0);

  await page.setViewportSize({ width: 900, height: 900 });
  await expect(panel).toHaveCount(0);
  await expect(page.getByText(/^Streak \d+$/)).toBeVisible();
});

test('Hive: rank and found words in the rail', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/daily/hive');
  const panel = page.getByRole('region', { name: 'Your progress' });
  await expect(panel).toContainText(/Beginner|Good|Solid|Nice|Great|Amazing|Genius/);
  await expect(panel).toContainText(/words? found/);
});

test('Scramble: what was found and the longest word in the rail, the clock with the rack', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/daily/scramble');
  await expect(page.getByRole('region', { name: 'Found' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Longest possible' })).toContainText(/\d+ letters/);
});
