// Cryptogram, the one game that shipped without any of this.
//
// The assertions are about the things that actually broke while it was being
// built: a mark repeating across the board and only one copy responding, the
// tier serving a cipher from the wrong pool, and the solver's panel showing
// nothing because its dictionary never loaded.
import { expect, test, type Page } from './fixtures';

/** Every cipher mark on the board. Punctuation is a plain span, so only the
 *  marks are buttons — and their labels carry the solved state. */
const marks = (page: Page) => page.getByRole('button', { name: /, (un)?solved( as .)?/ });

/** Which cipher each tier is allowed to draw, straight from the generator's
 *  TIER_VARIANTS. A board announcing something outside its own pool means the
 *  tiers have drifted, which is the failure this can see and a person can't. */
const TIER_LABELS = {
  Easy: ['Shift', 'Affine', 'Numbers'],
  Hard: ['Keyword', 'Mixed', 'Symbols'],
  Extreme: ['Mixed, grouped', 'Keyword, grouped', 'Polybius', 'Homophonic'],
} as const;

test('the daily board announces a cipher its own tier can draw', async ({ page }) => {
  await page.goto('/daily/cryptogram');
  await expect(marks(page).first()).toBeVisible();

  for (const [tier, allowed] of Object.entries(TIER_LABELS)) {
    await page.getByRole('button', { name: tier, exact: true }).click();
    await expect(marks(page).first()).toBeVisible();
    // the label sits above the passage, in its own line
    const label = page.locator('main p').filter({ hasText: /^[A-Z][a-z]+(, grouped)?$/ }).first();
    await expect(label).toHaveText(new RegExp(`^(${allowed.join('|')})$`));
  }
});

test('typing a letter fills every copy of that mark, not just the one tapped', async ({ page }) => {
  await page.goto('/daily/cryptogram');
  const all = marks(page);
  await expect(all.first()).toBeVisible();

  // Find a mark that appears more than once, by its label's leading name —
  // and that isn't already given. Easy boards reveal their three commonest
  // letters, and a revealed mark is locked, so typing over it does nothing:
  // pick one of those and this asserts on a square that was never going to
  // change. Which mark comes first is the generator's business and moves
  // whenever the board does.
  const cells = await all.evaluateAll((els) =>
    els.map((e) => {
      const label = e.getAttribute('aria-label')!;
      return { mark: label.split(',')[0], given: !/unsolved/.test(label) };
    })
  );
  const counts = new Map<string, number>();
  for (const c of cells) if (!c.given) counts.set(c.mark, (counts.get(c.mark) ?? 0) + 1);
  const repeated = [...counts].find(([, n]) => n > 1);
  expect(repeated, 'the passage should repeat at least one unrevealed mark').toBeTruthy();
  const [mark, times] = repeated!;

  // tap the last copy: the cursor used to jump to the first, so a later copy
  // is the one worth clicking
  const positions = cells.flatMap((c, i) => (c.mark === mark && !c.given ? [i] : []));
  await all.nth(positions[positions.length - 1]).click();

  // 'z' rather than a common letter: reveals hand over frequent letters, and a
  // clash would make this assert the wrong thing
  await page.keyboard.press('z');
  await expect(page.getByRole('button', { name: `${mark}, solved as z` })).toHaveCount(times);
});

test('practice draws a passage, and asks for another', async ({ page }) => {
  await page.goto('/play/cryptogram');
  await page.getByRole('button', { name: 'Practice', exact: true }).click();
  await expect(marks(page).first()).toBeVisible();

  // The board itself, not how many marks it has: two passages of the same
  // length are ordinary, and comparing counts made this pass alone and fail in
  // a full run. drawPractice holds the current board out of the draw, so a
  // different board is guaranteed rather than merely likely.
  const board = () => marks(page).evaluateAll((els) => els.map((e) => e.ariaLabel).join('|'));
  const before = await board();
  await page.getByRole('button', { name: 'New passage' }).click();
  await expect.poll(async () => (await board()) !== before, { timeout: 5000 }).toBe(true);
});

test('revealing fills the board and names the author', async ({ page }) => {
  await page.goto('/daily/cryptogram');
  await expect(marks(page).first()).toBeVisible();
  await page.getByRole('button', { name: 'Reveal' }).click();

  // nothing left unsolved once the answer is on the board
  await expect(page.getByRole('button', { name: /, unsolved/ })).toHaveCount(0);
  await expect(page.locator('main')).toContainText('—');
});

test('the crossed-off alphabet has a spoken equivalent', async ({ page }) => {
  await page.goto('/daily/cryptogram');
  // easy is never homophonic, and the tracker is hidden on a board that is —
  // a letter being used there says nothing about whether it can be used again
  const open = page.getByRole('button', { name: /, unsolved/ }).first();
  await expect(open).toBeVisible();

  // A board opens with given letters, so the tracker is already saying
  // something; there is no empty state to assert against.
  const spoken = page.getByText(/Plaintext letters used:|No plaintext letters used yet\./);
  await expect(spoken).toBeAttached();

  // A non-homophonic board is a bijection, so typing a letter already spoken
  // for is not a new fact. Pick one the board has not used.
  const before = (await spoken.innerText()).toUpperCase();
  const free = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').find((l) => !before.includes(l));
  expect(free, 'the board had already used every letter').toBeTruthy();

  await open.click();
  await page.keyboard.press((free as string).toLowerCase());
  await expect(page.getByText(new RegExp(`Plaintext letters used:[^.]*${free}`))).toBeAttached();
});
