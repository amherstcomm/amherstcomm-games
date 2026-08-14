// Word ladder, on the two things that make it different from every other game
// here: a wrong rung is refused rather than recorded, and the answer is a rule
// rather than a stored route.
import { expect, test } from './fixtures';

const rungs = (page: import('@playwright/test').Page) =>
  page.getByRole('list', { name: /ladder from/ }).locator('li');

test('the board gives both ends and states a par', async ({ page }) => {
  await page.goto('/daily/ladder');
  const list = rungs(page);
  await expect(list.first()).toBeVisible();
  // first and last are the given ends; par is on the status row
  await expect(page.getByText(/\d+ \/ \d+ steps/)).toBeVisible();
});

test('a rung that breaks a rule is refused, and says which', async ({ page }) => {
  await page.goto('/daily/ladder');
  const input = page.getByRole('textbox', { name: /next rung/ });
  await expect(input).toBeVisible();

  // two letters at once is the rule players break first, and the refusal has
  // to name it rather than just decline
  const first = await rungs(page).first().innerText();
  const twoOff =
    first.toLowerCase().slice(0, -2) +
    (first.toLowerCase().at(-2) === 'z' ? 'a' : 'z') +
    (first.toLowerCase().at(-1) === 'z' ? 'a' : 'z');
  await input.fill(twoOff);
  await page.getByRole('button', { name: 'Add rung' }).click();
  await expect(page.getByText(/Change exactly one letter|not in the word list/)).toBeVisible();

  // and the board did not keep it
  await expect(rungs(page).filter({ hasText: twoOff.toUpperCase() })).toHaveCount(0);
});

test('the solver answers with a route, not a ranking', async ({ page }) => {
  await page.goto('/solve/ladder');
  await page.getByRole('textbox', { name: 'from' }).fill('cold');
  await page.getByRole('textbox', { name: 'to' }).fill('warm');
  // every rung one letter apart, ending where it should
  const list = page.locator('ol li');
  await expect(list.first()).toHaveText(/COLD/i, { timeout: 15000 });
  await expect(list.last()).toHaveText(/WARM/i);
  const words = (await list.allInnerTexts()).map((w) => w.trim().toLowerCase());
  for (let i = 1; i < words.length; i++) {
    const differ = [...words[i]].filter((c, k) => c !== words[i - 1][k]).length;
    expect(differ, `${words[i - 1]} -> ${words[i]}`).toBe(1);
  }
});

test('mismatched lengths are refused before any search', async ({ page }) => {
  await page.goto('/solve/ladder');
  await page.getByRole('textbox', { name: 'from' }).fill('cold');
  await page.getByRole('textbox', { name: 'to' }).fill('warmer');
  await expect(page.getByText('Both words have to be the same length.')).toBeVisible();
});
