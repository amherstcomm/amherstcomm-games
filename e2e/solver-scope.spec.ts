// Every solver page should show its own answer and nothing else.
//
// Four of them do not search a word list at all — squares fills a grid,
// cryptogram breaks a cipher, the ladder walks a route, the bridge joins two
// ends by rule — and the shared results panel underneath was gated by a
// denylist naming only two of them. So the ladder solver printed several
// thousand unrelated five-letter words below its route, under a heading
// offering to show all 4,743 of them, and the bridge solver did the same. It
// shipped that way with the ladder and went unnoticed until the tenth game
// repeated it.
//
// The gate is an allowlist now, so a new game is silent by default rather than
// having to opt out. This is the test that says so, because the failure is
// invisible to typechecking and to every other test here: the page is valid,
// the words are real, and nothing throws.
import { expect, test } from './fixtures';

/** the solvers whose answer *is* a list of dictionary words */
const SEARCHES_WORDS = ['guess', 'scramble', 'hive', 'grid', 'boxed', 'weave'];
/** the solvers that answer from a rule or a board */
const ANSWERS_OTHERWISE = ['squares', 'cryptogram', 'ladder', 'bridge'];

// Ten routes in one test, each a cold load of a solver — comfortably past the
// default timeout on a slow runner, where it failed on the tenth and passed on
// retry. The alternative is ten tests that each say a third of the thing.
test('only word-list solvers show a word list', async ({ page }) => {
  test.slow();
  const bad: string[] = [];

  for (const slug of ANSWERS_OTHERWISE) {
    await page.goto(`/solve/${slug}`);
    const text = await page.locator('body').innerText();
    // "Show all 4743" — the results panel, on a page with no results to show
    if (/Show all \d{3,}/.test(text)) bad.push(`${slug} prints a dictionary`);
    // and the footer that describes searching one
    if (/Searching [\d,]+ English words/.test(text)) {
      bad.push(`${slug} says it is searching a word list`);
    }
  }

  // the other half of the claim: the six that do search still say so, or this
  // test would pass just as well with the panel removed from everything
  for (const slug of SEARCHES_WORDS) {
    await page.goto(`/solve/${slug}`);
    const text = await page.locator('body').innerText();
    if (!/Searching [\d,]+ English words/.test(text)) {
      bad.push(`${slug} no longer names the word list it searches`);
    }
  }

  expect(bad, bad.join(' | ')).toEqual([]);
});
