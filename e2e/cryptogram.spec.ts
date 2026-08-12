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

  // find a mark that appears more than once, by its label's leading name
  const labels = await all.evaluateAll((els) =>
    els.map((e) => e.getAttribute('aria-label')!.split(',')[0])
  );
  const counts = new Map<string, number>();
  for (const l of labels) counts.set(l, (counts.get(l) ?? 0) + 1);
  const repeated = [...counts].find(([, n]) => n > 1);
  expect(repeated, 'the passage should repeat at least one mark').toBeTruthy();
  const [mark, times] = repeated!;

  // tap the last copy: the cursor used to jump to the first, so a later copy
  // is the one worth clicking
  const positions = labels.flatMap((l, i) => (l === mark ? [i] : []));
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

test('the solver deduces from a pasted passage', async ({ page }) => {
  await page.goto('/solve/cryptogram');
  // a shift of 11, so the answer is known and the board is a real cryptogram
  const plain = 'success is counted sweetest by those who never succeed';
  const cipher = plain.replace(/[a-z]/g, (c) =>
    String.fromCharCode(((c.charCodeAt(0) - 97 + 11) % 26) + 97)
  );
  await page.locator('#crypto-in').fill(cipher.toUpperCase());

  // the words with distinctive shapes settle on their own; the dots are the
  // marks the shapes genuinely cannot pin
  await expect(page.locator('main')).toContainText(/[1-9]\d* marks settled/, { timeout: 20000 });
  await expect(page.locator('main p.font-mono').first()).toContainText('success');
});
