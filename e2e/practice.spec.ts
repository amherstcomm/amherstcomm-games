// Practice is the daily generated on the fly, with its own difficulty
// control. Two of the session's worst bugs lived here: practice never redrew
// when the difficulty changed, and then redrew from the word band about to be
// replaced — every level drew from the one below while appearing to work.
import { expect, test, type Page } from './fixtures';

const weaveCells = (page: Page) => page.getByRole('application').locator('button');

test('weave practice redraws at the new size when its difficulty changes', async ({ page }) => {
  await page.goto('/play/weave');
  await page.getByRole('button', { name: 'Practice', exact: true }).click();
  await expect(weaveCells(page)).toHaveCount(6 * 8);

  await page.getByRole('button', { name: 'Extreme', exact: true }).click();
  await expect(weaveCells(page)).toHaveCount(8 * 10);
});

test('grid practice follows the difficulty too', async ({ page }) => {
  await page.goto('/play/grid');
  await page.getByRole('button', { name: 'Practice', exact: true }).click();
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  const cells = page.locator('main button').filter({ hasText: /^[a-z]$/i });
  await expect(cells).toHaveCount(16);

  await page.getByRole('button', { name: 'Hard', exact: true }).click();
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(cells).toHaveCount(25);
});

test('scramble practice deals a rack and a new difficulty deals a fresh one', async ({ page }) => {
  await page.goto('/play/scramble');
  await page.getByRole('button', { name: 'Practice', exact: true }).click();
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  const tiles = page.locator('main button').filter({ hasText: /^[a-z]$/i });
  await expect(tiles).toHaveCount(7);
  const first = (await tiles.allTextContents()).sort().join('');

  await page.getByRole('button', { name: 'Extreme', exact: true }).click();
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(tiles).toHaveCount(7);
  // different band, different word — comparing sorted letters, so even a
  // reshuffle of the same rack would not pass by accident
  await expect
    .poll(async () => (await tiles.allTextContents()).sort().join(''))
    .not.toBe(first);
});
