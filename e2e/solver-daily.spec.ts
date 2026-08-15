// Every solver offers a "today's daily board" button, and all five of them
// silently stopped working: the feed is { date, byDifficulty: {...} } and they
// were still reading the flat shape it had before difficulty tiers existed.
// The read returned undefined, the validation called that a bad payload, and
// the user got "Couldn't fetch today's board — try again in a minute" for a
// board that was already on screen in the game next door.
//
// Nothing covered this. The suite exercised the games, which read the tiers
// correctly, and the solvers only ever had their manual-entry paths tested.
//
// Asserting that letters *arrived*, not that the error is absent. The first
// version of this test checked `toHaveCount(0)` on the error text and passed
// against the broken build — an absent element is absent immediately, so it
// was really asserting that the click had not finished yet.
import { expect, test } from './fixtures';

const CASES = [
  { slug: 'hive', button: "Today's daily hive" },
  { slug: 'boxed', button: "Today's daily box" },
  { slug: 'grid', button: "Today's daily grid" },
  { slug: 'scramble', button: "Today's daily rack" },
];

/** How much of the board is holding a letter.
 *
 *  Two shapes, because the solvers use two. Most are grids of one-letter
 *  inputs; the rack is a chip field, whose own input is always empty — it is
 *  an append box, and the letters live in the "Remove x" chips beside it. A
 *  count that only looked at inputs called the rack empty on a filled board. */
const filled = (page: import('@playwright/test').Page) =>
  page.evaluate(
    () =>
      [...document.querySelectorAll('input')].filter((i) => (i as HTMLInputElement).value.trim())
        .length +
      [...document.querySelectorAll('button[aria-label^="Remove "]')].length
  );

for (const c of CASES) {
  test(`the ${c.slug} solver loads today's board`, async ({ page }) => {
    await page.goto(`/solve/${c.slug}`);
    const button = page.getByRole('button', { name: c.button });
    await expect(button).toBeVisible();

    const before = await filled(page);
    await button.click();

    // the board has to actually turn up, which is the half the error message
    // cannot tell you about
    await expect
      .poll(() => filled(page), { timeout: 10000, message: `${c.slug} never filled its board` })
      .toBeGreaterThan(before);
    await expect(page.getByText(/try again in a minute/)).toHaveCount(0);
  });
}
