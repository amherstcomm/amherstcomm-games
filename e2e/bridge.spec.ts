// Bridge, on the things that make it different from the rest: the rule is
// membership in the word list rather than a stored answer, a hint is spent on
// one prompt rather than the board, and the solver can legitimately return more
// than one word where the daily never does.
import { expect, test } from './fixtures';

const rows = (page: import('@playwright/test').Page) =>
  page.getByRole('list', { name: 'bridges' }).locator('li');

test('the board gives five prompts and a hint budget', async ({ page }) => {
  await page.goto('/daily/bridge');
  await expect(rows(page)).toHaveCount(5);
  await expect(page.getByText(/0 \/ 5 found/)).toBeVisible();
  // easy grants three; the count is the difficulty setting, so it is on screen
  await expect(page.getByText(/\d+ left/)).toBeVisible();
});

test('a word that joins neither side is refused', async ({ page }) => {
  await page.goto('/daily/bridge');
  const input = page.getByRole('textbox', { name: /joins/ });
  await expect(input).toBeVisible();

  // something that is certainly not a word on either side
  await input.fill('zzz');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByText(/is not a word/)).toBeVisible();
  await expect(rows(page).filter({ hasText: 'found' })).toHaveCount(0);
});

// Coverage deliberately lost, and worth naming rather than quietly dropping:
// this test also used to prove that a *correct* word is accepted. It found one
// by asking the site's own Bridge solver, because the prompt is whatever the
// day's board holds and a hardcoded answer would rot the moment the feed
// moved. With the solver gone there is no cheap way for a test to discover a
// valid answer for an arbitrary prompt.
//
// Restoring it needs a fixture that pins the bridge daily to a known prompt —
// worth doing, but it is a change to the fixtures rather than to this file.

test('a hint is spent on one prompt and comes out of the budget', async ({ page }) => {
  await page.goto('/daily/bridge');
  await expect(page.getByText(/3 left/)).toBeVisible();
  await page.getByRole('button', { name: 'Length' }).click();
  await expect(page.getByText(/2 left/)).toBeVisible();
  // exactly one row now states a length; the other four are untouched
  await expect(rows(page).filter({ hasText: /\d+ letters/ })).toHaveCount(1);
});

test('Learn is the real board, played', async ({ page }) => {
  await page.goto('/learn/bridge');
  const demo = page.locator('ol li span.sr-only');
  await expect(demo.first()).toHaveText(/snow blank park/);
  // typed at the document, the way the demo listens
  for (const ch of 'ball') await page.keyboard.press(ch);

  // The word list is a real download and the demo says so rather than
  // swallowing the keypress, which is what this retry is waiting out. The
  // entry survives a refused submit, so pressing again is all it takes —
  // and this is how the loading case was found in the first place.
  await expect
    .poll(
      async () => {
        await page.keyboard.press('Enter');
        return demo.first().innerText();
      },
      { timeout: 30000, message: 'the demo never accepted BALL' }
    )
    .toMatch(/snow ball park, found/);
});
