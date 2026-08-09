// The dailies, at all three difficulties. The assertions are structural —
// cell counts, board widths — because those are what regressed before: the
// 7-wide weave wrapped into six columns, and squares' hard board vanished
// under extreme in the legacy map.
import { expect, test, type Page } from './fixtures';

// Weave's board is the application landmark; every button inside is a cell.
const weaveCells = (page: Page) => page.getByRole('application').locator('button');

// The sprint games keep their letters hidden until the clock starts.
async function startSprint(page: Page) {
  await page.getByRole('button', { name: 'Start', exact: true }).click();
}

test('weave is 6, 7 and 8 wide as the difficulty climbs', async ({ page }) => {
  await page.goto('/daily/weave');
  await expect(weaveCells(page)).toHaveCount(6 * 8); // easy

  await page.getByRole('button', { name: 'Hard', exact: true }).click();
  await expect(weaveCells(page)).toHaveCount(7 * 9);

  await page.getByRole('button', { name: 'Extreme', exact: true }).click();
  await expect(weaveCells(page)).toHaveCount(8 * 10);
});

test('weave draws its columns at the board width, not the nearest power of two', async ({
  page,
}) => {
  await page.goto('/daily/weave');
  await page.getByRole('button', { name: 'Hard', exact: true }).click();
  const cells = weaveCells(page);
  await expect(cells).toHaveCount(63);
  // 7 columns means cell 0 and cell 7 share an x coordinate; when this board
  // wrapped at 6 columns they did not
  const first = await cells.nth(0).boundingBox();
  const eighth = await cells.nth(7).boundingBox();
  expect(first!.x).toBeCloseTo(eighth!.x, 0);
});

test('squares is 4x4 at easy and 5x5 at hard — hard exists', async ({ page }) => {
  await page.goto('/daily/squares');
  const cells = page.getByRole('button', { name: /^row \d+ column \d+/ });
  await expect(cells).toHaveCount(16);

  await page.getByRole('button', { name: 'Hard', exact: true }).click();
  await expect(cells).toHaveCount(25);

  await page.getByRole('button', { name: 'Extreme', exact: true }).click();
  await expect(cells).toHaveCount(25);
});

test('hive serves a different board per difficulty', async ({ page }) => {
  await page.goto('/daily/hive');
  const letters = page.locator('main button').filter({ hasText: /^[a-z]$/i });
  await expect(letters).toHaveCount(7);
  const easy = (await letters.allTextContents()).join('');

  await page.getByRole('button', { name: 'Extreme', exact: true }).click();
  await expect(letters).toHaveCount(7);
  await expect.poll(async () => (await letters.allTextContents()).join('')).not.toBe(easy);
});

test('grid grows from 16 to 25 cells above easy', async ({ page }) => {
  await page.goto('/daily/grid');
  await startSprint(page);
  const cells = page.locator('main button').filter({ hasText: /^[a-z]$/i });
  await expect(cells).toHaveCount(16);

  await page.getByRole('button', { name: 'Hard', exact: true }).click();
  await startSprint(page);
  await expect(cells).toHaveCount(25);
});
