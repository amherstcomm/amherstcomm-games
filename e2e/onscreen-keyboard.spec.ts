// The on-screen keyboard has to reach whichever board is on screen.
//
// It routes through one function in App with three steps: Learn if it is open,
// then the mounted play board, then — the step that is easy to forget exists —
// straight into the focused DOM input on a solver surface.
//
// The middle step was an if-chain naming eight of the ten games. Ladder and
// Bridge both expose `pressKey` and App held refs to both, and neither was ever
// called. Nothing caught it: it compiled, it rendered, every suite passed, and
// the keyboard itself drew all twenty-six keys on those two boards.
//
// So this covers both ends. A play board that was broken, and a solver surface
// that was not — because the first attempt at the fix returned early instead of
// falling through, which would have killed the keyboard on all ten solvers to
// fix it on two play boards. That trade was invisible until it was tested.
import { expect, test } from './fixtures';

const key = (page: import('@playwright/test').Page, c: string) =>
  page.getByRole('button', { name: `Key ${c}`, exact: true });

/** The panel is a preference and starts closed here, because the e2e fixture
 *  writes the stored blob wholesale and resets it. Opening it is part of the
 *  scenario rather than setup noise: the keyboard only matters when shown. */
async function showKeyboard(page: import('@playwright/test').Page) {
  const toggle = page.getByRole('button', { name: /keyboard/i }).first();
  await expect(toggle).toBeVisible();
  if ((await toggle.getAttribute('aria-label'))?.startsWith('Show')) await toggle.click();
  await expect(key(page, 'q')).toBeVisible();
}

test('the keyboard types into a play board', async ({ page }) => {
  test.slow();
  await page.goto('/daily/ladder');

  const rung = page.locator('#ladder-rung');
  await expect(rung).toBeVisible({ timeout: 20_000 });

  // Ladder is one of the two the chain never named. Its rung field is an
  // ordinary input, so a device keyboard always worked here — which is why
  // nobody hit this — but the on-screen one wrote nothing.
  await showKeyboard(page);
  for (const c of ['c', 'o', 'r', 'd']) await key(page, c).click();

  await expect(rung).toHaveValue('cord');
});

test('the keyboard still types into a solver, which has no board at all', async ({ page }) => {
  await page.goto('/solve/grid');

  await showKeyboard(page);
  const first = page.locator('input[data-tile-group="grid"]').first();
  await first.focus();
  await key(page, 'q').click();

  await expect(first).toHaveValue('q');
});
