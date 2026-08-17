// The controls above a board are a ladder, and every game climbs it the same way.
//
//   solve / play / learn      which surface you want
//   easy / hard / extreme     what it is built from — "Difficulty" when playing,
//                             "Word list" when solving
//   daily / practice          which board
//   then the game
//
// The first two rungs are shared, rendered once by App for whichever game is on
// screen. That did not make them consistent. Difficulty rendered above the game
// blocks and Word list rendered *among* them, so the same rung of the same
// ladder appeared above the board for boxed, grid, guess, hive and scramble and
// below the first control for bridge, cryptogram, ladder, squares and weave —
// decided entirely by where each game's JSX happened to sit in a four-thousand
// line file. Nobody chose the split and nothing could see it: both orders type
// check, both render, and every other test here passes under either.
//
// So this measures the order instead of trusting it. It is the kind of rule
// that cannot be enforced by construction while the sections are hand-placed
// siblings — the compiler has no opinion about the order of two JSX children —
// and the kind that quietly re-breaks the next time a game is added in the
// wrong place.
import { expect, test } from './fixtures';
import { ALL_SLUGS } from '../src/games';

/** the label of every rung, in the order they must appear */
const RUNG = { play: 'Difficulty', solve: 'Word list' } as const;

// Rung three, asserted for every game rather than for the eight that had it.
//
// Ladder offered a grey text link below the board instead, and Bridge had no
// control at all — its practice mode could not be reached from the page. Both
// rendered fine and neither showed up in any suite, because "this game is
// missing a control the other eight have" is not a thing a per-game test asks.
test('every game offers the daily/practice choice the same way', async ({ page }) => {
  test.slow();
  const missing: string[] = [];

  for (const slug of ALL_SLUGS) {
    await page.goto(`/play/${slug}`);
    const daily = page.getByRole('button', { name: 'Daily', exact: true });
    const practice = page.getByRole('button', { name: 'Practice', exact: true });
    if (!(await daily.isVisible()) || !(await practice.isVisible())) missing.push(slug);
  }

  expect(missing, `these games have no daily/practice control: ${missing.join(', ')}`).toEqual([]);
});

for (const view of ['solve', 'play'] as const) {
  test(`${view}: the shared controls come before the game, for every game`, async ({ page }) => {
    test.slow();
    const wrong: string[] = [];

    for (const slug of ALL_SLUGS) {
      await page.goto(`/${view}/${slug}`);

      // Every label on the page, top to bottom. Not `section > label`: the
      // controls that were jumping the queue — bridge's "First", ladder's
      // "from", squares' "Grid size" — live inside the game's own markup and
      // are not children of a <section> at all, so that selector matched the
      // one shared control and nothing else. It made this test pass against
      // the layout it was written to reject.
      const labels = await page.locator('main label, main legend').allTextContents();
      const seen = labels.map((t) => t.trim());
      const rung = seen.indexOf(RUNG[view]);

      // Absent is allowed — the rung hides when there is nothing left for it to
      // pick (one dictionary chosen site-wide, or a fixed difficulty). Present
      // but not first is the failure.
      if (rung > 0) wrong.push(`${view}/${slug}: ${seen.slice(0, rung + 1).join(' > ')}`);
    }

    expect(wrong, `these games put a control above the shared one:\n${wrong.join('\n')}`).toEqual(
      []
    );
  });
}
