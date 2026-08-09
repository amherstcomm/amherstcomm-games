// The solvers: the search itself, and the word lists behind it. The three
// options are the difficulties' accept tiers — the counts asserted here are
// the same 67,170 / 111,406 / 276,854 the unit layer measures, seen from the
// user's side of the glass.
import { expect, test } from './fixtures';

test('descramble finds words, and the word list changes what it searches', async ({ page }) => {
  await page.goto('/solve/scramble');

  const footer = page.getByText(/Searching [\d,]+ English words/);
  await expect(footer).toHaveText(/67,170/); // easy is the default here

  await page.getByRole('button', { name: 'Extreme', exact: true }).click();
  await expect(footer).toHaveText(/276,854/);

  await page.getByRole('button', { name: 'Hard', exact: true }).click();
  await expect(footer).toHaveText(/111,406/);

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
