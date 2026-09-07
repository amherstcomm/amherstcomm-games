// Bridge, on the things that make it different from the rest: the rule is
// membership in the word list rather than a stored answer, a hint is spent on
// one prompt rather than the board, and the solver can legitimately return more
// than one word where the daily never does.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from './fixtures';
import { DATA_DIR } from './global-setup';

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

  // Pressed until the board can answer, rather than once. The word list is
  // fetched, and a board that has not got it yet says "Still loading the word
  // list." — which is the right behaviour and was not what this asserted, so
  // the test failed whenever the fetch lost a race with the click. Measured at
  // five failures in twelve under parallel load; it had been passing on a quiet
  // machine and failing in full runs.
  await expect(async () => {
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(page.getByText(/is not a word/)).toBeVisible({ timeout: 500 });
  }).toPass({ timeout: 10_000 });
  await expect(rows(page).filter({ hasText: 'found' })).toHaveCount(0);
});

// Restored. This proved that a *correct* word is accepted until the solver
// went, which is where it used to find one: the prompt is whatever the day's
// board holds, so a hardcoded answer would rot the moment the feed moved.
//
// The answer comes out of the fixture feed instead — the same file the page
// reads. global-setup runs the real generator into e2e/.data, and a bridge
// board carries its answers base64'd for the reveal, so the test knows what the
// board knows on whatever day the run happens.
//
// The `dev-` prefix is not decoration: a site on localhost reads the dev feed
// (src/dailyData.ts), and the plain one alongside it is a different day's
// board. Reading the wrong one is a test that types a valid answer to somebody
// else's prompt, which is how this was first written and why it asserts the
// prompts on screen are the prompts it read.
test('and one that joins both is taken', async ({ page }) => {
  const feed = JSON.parse(readFileSync(join(DATA_DIR, 'dev-daily-bridge.json'), 'utf8'));
  // Easy, because that is the difficulty a board opens on.
  const board = feed.byDifficulty.easy;
  const answers: string[] = JSON.parse(Buffer.from(board.answers, 'base64').toString('utf8'));
  const first = board.prompts[0] as { x: string; y: string };

  await page.goto('/daily/bridge');
  const input = page.getByRole('textbox', { name: /joins/ });
  await expect(input).toBeVisible();
  // The board on screen is the board that was read, or the answer below means
  // nothing.
  await expect(page.getByText(`the word that joins ${first.x} and ${first.y}`)).toBeVisible();

  await input.fill(answers[0]);
  // Pressed until the board can answer, for the same reason the refusal above
  // is: the word list is fetched, and a board that has not got it yet says so
  // rather than judging the word.
  await expect(async () => {
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(rows(page).filter({ hasText: 'found' })).toHaveCount(1, { timeout: 500 });
  }).toPass({ timeout: 10_000 });
  await expect(page.getByText('1 / 5 found')).toBeVisible();
});

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
