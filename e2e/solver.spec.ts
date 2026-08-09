// The solvers: the search itself, and the word lists behind it. The three
// options are the difficulties' accept tiers — the counts asserted here are
// the same 67,141 / 111,370 / 276,790 the unit layer measures, seen from the
// user's side of the glass.
import { expect, test } from './fixtures';

test('descramble finds words, and the word list changes what it searches', async ({ page }) => {
  await page.goto('/solve/scramble');

  const footer = page.getByText(/Searching [\d,]+ English words/);
  await expect(footer).toHaveText(/67,141/); // easy is the default here

  await page.getByRole('button', { name: 'Extreme', exact: true }).click();
  await expect(footer).toHaveText(/242,602/);

  await page.getByRole('button', { name: 'Hard', exact: true }).click();
  await expect(footer).toHaveText(/111,370/);

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
