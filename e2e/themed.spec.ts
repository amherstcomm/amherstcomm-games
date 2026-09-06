// A themed day, on the board rather than in the feed.
//
// The generator's own tests prove the rack is built out of a theme word and
// that the day's words ride along in the payload. What they cannot prove is
// that the board does anything with them — and that is the half that has been
// wrong before: a themed answer the dictionary had never heard of used to be
// dropped, so ESOP could be the answer and not be typeable.
//
// So this plays one. The rack spells a word no dictionary carries, and the
// board has to accept it, score it, and say why it is worth more.
import { expect, test } from './fixtures';
import { appToday } from './global-setup';

/** A rack that is a theme word rather than an English one, with the rest of the
 *  day's list riding along. `esop` is spellable from these letters and is in no
 *  dictionary; `pose` is spellable and is in every one. */
const THEME = ['esop', 'pales', 'shares'];
const RACK = 'esoplan'; // e s o p l a n — spells `esop`, and `pales`

const payload = {
  date: appToday(),
  byDifficulty: Object.fromEntries(
    ['easy', 'hard', 'extreme'].map((tier) => [tier, { letters: RACK.split('') }])
  ),
  themed: btoa(THEME.join(' ')),
  fetchedAt: new Date(0).toISOString(),
};

test('a themed rack accepts the day s own words and pays a bonus for them', async ({ page }) => {
  await page.route('**/*daily-scramble.json', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(payload),
    })
  );

  await page.goto('/daily/scramble');
  await page.getByRole('button', { name: 'Start', exact: true }).click();

  // An ordinary word from the same rack, so the board is working normally.
  //
  // Retried until it lands, because the dictionary is a lazy import and a
  // submit before it arrives is answered with "Dictionary still loading…"
  // rather than a score. That is the right behaviour — a guess refused because
  // a fetch was slow would read as the board calling you wrong — and it is why
  // typing straight after Start passed alone and failed in a full run.
  // Retrying is safe: submit clears the box before it checks anything.
  await expect(async () => {
    await page.keyboard.type('pose');
    await page.keyboard.press('Enter');
    await expect(page.getByText('+4', { exact: true })).toBeVisible({ timeout: 1000 });
  }).toPass();

  // And the one no dictionary carries. Without the day's words shipped beside
  // the rack this is "Not in dictionary" — which is the failure this exists to
  // catch, and it looks like the board calling you wrong.
  await page.keyboard.type('esop');
  await page.keyboard.press('Enter');
  // 4 letters = 4 points, +5 for being the day's own word.
  await expect(page.getByText('Theme word! +9')).toBeVisible();

  // In the found list, not merely flashed at: the score is rebuilt from what
  // was found, so a word that flashed and was not kept would score nothing.
  await expect(page.getByText('esop', { exact: true })).toBeVisible();
});

test('and an ordinary day says nothing about themes', async ({ page }) => {
  await page.goto('/daily/scramble');
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(page.getByText(/worth \+5 each/)).toHaveCount(0);
});
