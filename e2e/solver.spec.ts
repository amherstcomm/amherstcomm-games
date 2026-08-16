// The solvers: the search itself, and the word lists behind it. The three
// options are the difficulties' accept tiers.
//
// The exact sizes are pinned in tests/unit/dictionaries.test.ts, against the
// band files themselves, and they are not repeated here. They used to be, and
// the comment on this line carried 276,790 — a figure two rebuilds out of date
// that nothing failed on, because a comment cannot fail. The assertions below
// it were live, so every rebuild that moved a count cost a ten-minute e2e run
// to discover a number the unit suite had already checked in fifteen seconds.
//
// What only this layer can say is that the three options are wired to three
// different lists and the footer follows the one you picked. So that is what
// it asserts: distinct, ordered, and changing on click.
import { expect, test } from './fixtures';

const shown = async (footer: import('@playwright/test').Locator) =>
  Number(((await footer.textContent()) ?? '').replace(/[^\d]/g, ''));

test('descramble finds words, and the word list changes what it searches', async ({ page }) => {
  await page.goto('/solve/scramble');

  const footer = page.getByText(/Searching [\d,]+ English words/);

  // Wait for a real count, not merely for the line to appear. The footer
  // renders "0" while the word list is still arriving, and against a built
  // preview that gap is long enough to read — the list is fetched rather than
  // served warm by a dev server. A "wait until it changes" check then fires on
  // the load itself and reads the previous tier's number, which is how this
  // test once reported hard as larger than extreme.
  const settled = async (): Promise<number> => {
    await expect
      .poll(async () => shown(footer), { timeout: 15000 })
      .toBeGreaterThan(0);
    return shown(footer);
  };

  const easy = await settled(); // easy is the default here

  await page.getByRole('button', { name: 'Extreme', exact: true }).click();
  await expect.poll(async () => shown(footer), { timeout: 15000 }).not.toBe(easy);
  const extreme = await settled();

  await page.getByRole('button', { name: 'Hard', exact: true }).click();
  await expect.poll(async () => shown(footer), { timeout: 15000 }).not.toBe(extreme);
  const hard = await settled();

  // each tier is the one below it plus more, which is the promise the accept
  // pools make and the reason the options are ordered as they are
  expect(easy, `easy ${easy} < hard ${hard} < extreme ${extreme}`).toBeLessThan(hard);
  expect(hard, `easy ${easy} < hard ${hard} < extreme ${extreme}`).toBeLessThan(extreme);
  expect(easy).toBeGreaterThan(10_000); // not an empty list dressed as one

  await page.getByLabel('Letters to descramble').fill('retinas');
  // a rack of RETINAS yields plenty; "retain" is safely in every tier
  await expect(page.getByRole('main').getByText('retain', { exact: true })).toBeVisible();
});

test('pattern solver narrows by known letters', async ({ page }) => {
  await page.goto('/solve/guess');
  const inputs = page.locator('main input[maxlength="1"]');
  await expect(inputs).toHaveCount(5);
  await inputs.nth(0).fill('q');
  await expect(page.getByRole('main').getByText('quiet', { exact: true })).toBeVisible();
});

test('the coarse-word filter hides strong words from solver results', async ({ page }) => {
  // the letters F U C K descramble to exactly one strong word
  await page.goto('/solve/scramble');
  await page.getByLabel('Letters to descramble').fill('fuck');
  await expect(page.getByRole('button', { name: 'fuck', exact: true })).toBeVisible();

  // same rack with the filter on: the word is gone from display — and only
  // from display; acceptance is a different code path entirely
  await page.addInitScript(() => {
    localStorage.setItem(
      'anagrimoire:v1',
      JSON.stringify({ onboarded: true, wordFilter: 'strong' })
    );
  });
  await page.goto('/solve/scramble');
  await page.getByLabel('Letters to descramble').fill('fuck');
  await expect(page.getByRole('button', { name: 'fuck', exact: true })).not.toBeVisible();
});
