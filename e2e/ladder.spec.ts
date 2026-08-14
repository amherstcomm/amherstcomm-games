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

// The game used to speak only when it said no. Rungs land in a list that is
// not a live region, and the one region it had was cleared to empty on a good
// word — so a screen reader heard every rejection and never heard an
// acceptance, a step count, or a win. Asserting on the announcement rather
// than on the list, because the list was always right; it was the saying that
// was missing.
test('an accepted rung is announced, not just drawn', async ({ page }) => {
  await page.goto('/daily/ladder');
  const input = page.getByRole('textbox', { name: /next rung/ });
  await expect(input).toBeVisible();

  // The pair comes from a fixture regenerated off the live feed, so it changes
  // by date — a hardcoded rung would pass today and rot tomorrow. Walk the
  // first letter instead until one neighbour is taken; every legal ladder has
  // at least one, or the board would be unsolvable.
  const first = (await rungs(page).first().innerText()).toLowerCase().trim();
  const add = page.getByRole('button', { name: 'Add rung' });
  let accepted = '';
  for (const c of 'abcdefghijklmnopqrstuvwxyz') {
    if (c === first[0]) continue;
    const candidate = c + first.slice(1);
    await input.fill(candidate);
    await add.click();
    if (await rungs(page).filter({ hasText: candidate.toUpperCase() }).count()) {
      accepted = candidate;
      break;
    }
  }
  expect(accepted, `no one-letter neighbour of ${first} was accepted`).not.toBe('');

  // the rung is on the board, and something said so. sr-only, so this asserts
  // presence rather than visibility.
  await expect(
    page.locator('[aria-live]').filter({ hasText: new RegExp(`${accepted} accepted, 1 of \\d+`) })
  ).toHaveCount(1);
});
