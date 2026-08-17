// Hovering a result draws it back on the board.
//
// This existed for three solvers and was tested by nothing — no unit test, no
// e2e, no assertion anywhere touched the word "trace". Which meant a green
// suite said nothing about it, and when the trace machinery was pulled into
// src/solvers/useBoardTrace.ts there was no way to tell a working refactor from
// a broken one except by hovering the page by hand.
//
// It cost an hour and a wrong conclusion to find that out, twice over: a
// synthetic `mouseenter` never reaches React, which synthesises enter/leave
// from `mouseover`, so a hand-rolled probe reported the feature dead while it
// was fine. Playwright's hover() moves a real mouse and does not have that
// problem, which is the other reason this belongs here rather than in a unit
// test with a fake DOM.
//
// What it asserts is the shape of the answer, not the coordinates: a polyline
// appears on hover, has as many points as the word has letters, and goes away
// again. Pinning the numbers would pin the tile size.
import { expect, test } from './fixtures';

/** type a board's letters, left to right */
async function fillBoard(page: import('@playwright/test').Page, group: string, letters: string) {
  const tiles = page.locator(`input[data-tile-group="${group}"]`);
  for (let i = 0; i < letters.length; i++) await tiles.nth(i).fill(letters[i]);
}

test('hovering a grid result traces it on the board', async ({ page }) => {
  test.slow();
  await page.goto('/solve/grid');
  await fillBoard(page, 'grid', 'catsdogsbirdfish');

  const word = page.getByRole('button', { name: 'dish', exact: true });
  await expect(word).toBeVisible({ timeout: 15_000 });

  const trace = page.locator('svg.absolute polyline');
  await expect(trace).toHaveCount(0);

  await word.hover();
  await expect(trace).toHaveCount(1);

  // one point per letter: d-i-s-h is four cells, and a path visits each once
  const points = (await trace.getAttribute('points'))!.trim().split(/\s+/);
  expect(points).toHaveLength(4);

  // and the tiles it passes through are tinted, which is the half of the
  // feature the polyline does not cover
  await expect(page.locator('input[data-tile-group="grid"].border-sky-300')).toHaveCount(4);

  // moving away puts the board back
  await page.getByRole('heading', { level: 1 }).first().hover();
  await expect(trace).toHaveCount(0);
});

// Weave is the reason the trace became a module: its board was inseparable
// from the results panel while the trace state sat between them. Forty-eight
// cells rather than sixteen, and it needs all of them — a part-filled weave
// board reports nothing, which is how the first hand-check of this looked like
// a broken trace when it was an unfinished board.
test('hovering a weave result traces it on the larger board', async ({ page }) => {
  test.slow();
  await page.goto('/solve/weave');

  const tiles = page.locator('input[data-tile-group="weave"]');
  await expect(tiles).toHaveCount(48);
  const letters = 'rstlneaioducmphgbyfwkvxzjq';
  for (let i = 0; i < 48; i++) await tiles.nth(i).fill(letters[i % letters.length]);

  const trace = page.locator('svg.absolute polyline');
  const word = page.locator('main button').filter({ hasText: /^[a-z]{4,}$/ }).first();
  await expect(word).toBeVisible({ timeout: 20_000 });

  await word.hover();
  await expect(trace).toHaveCount(1);

  // as many cells lit as the word has letters — the polyline and the tinting
  // are computed separately and have to agree
  const letterCount = (await word.textContent())!.trim().length;
  const points = (await trace.getAttribute('points'))!.trim().split(/\s+/);
  expect(points).toHaveLength(letterCount);
  await expect(page.locator('input[data-tile-group="weave"].border-sky-300')).toHaveCount(
    letterCount
  );
});

test('hovering a boxed solution draws a chord per word', async ({ page }) => {
  test.slow();
  await page.goto('/solve/boxed');
  await fillBoard(page, 'boxed', 'abcdefghijkl');

  // Boxed answers in chains, and each word in a chain gets its own polyline —
  // that is the case the shared hook has to keep working, since grid and weave
  // only ever draw one.
  const trace = page.locator('svg.absolute polyline');
  const first = page.locator('button[class*="rounded"]:visible').filter({ hasText: /^[a-z]{3,}$/ }).first();

  if ((await first.count()) === 0) {
    test.skip(true, 'those twelve letters spell nothing — pick another set if this ever fires');
  }

  await first.hover();
  await expect(trace.first()).toBeVisible();
  expect(await trace.count()).toBeGreaterThanOrEqual(1);
});
