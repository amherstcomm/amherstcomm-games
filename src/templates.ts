// The blank a month gets written into.
//
// These are handed to somebody — or to something — that will fill them in
// elsewhere and paste the result back, so the template has to explain itself
// without a page around it. `_readme` is a key the parsers ignore, which is
// the only way to put a sentence inside JSON.
//
// tests/unit/templates.test.ts pushes each one back through its own parser and
// requires it to come out clean. A template that does not import is worse than
// no template: it looks like the shape and is not.

/** A key the parsers skip, holding the instructions. */
const README_THEMES =
  'Each theme fills a Weave board exactly. The spangram is one word of 6 to 16 ' +
  'letters threaded corner to corner; the other words must add up to the ' +
  'squares it leaves — 48 on easy, 63 on hard, 80 on extreme. Words are 4 to 10 ' +
  'letters each. Dates are optional: put the same date in both for a single ' +
  'day, or a range to add the theme to the pool for those days. Anything ' +
  'worked out rather than given (word_count, total_letters, spangram_length) ' +
  'is ignored and recalculated.';

const README_LISTS =
  'Words of your own, for a themed round in a session and for the daily word. ' +
  'A word does not have to be in the dictionary — ESOP is the point. Three to ' +
  'fifteen letters. daily_from and daily_until are optional and make the list ' +
  'take over the daily word for those days.';

const README_PASSAGES =
  'Passages for the daily cryptogram. Length is counted in letters — spaces ' +
  'and punctuation are carried through as themselves and do not count. 50 to ' +
  '100 letters plays at easy and hard; 35 to 49 plays at extreme; anything ' +
  'outside 35 to 100 has no board and is refused. The author is optional and ' +
  'is shown under the solved puzzle. Dates are optional: the same date in ' +
  'both for a single day, or a range to add the passage to the pool for those ' +
  'days.';

export const THEME_TEMPLATE = {
  _readme: README_THEMES,
  themes: [
    {
      theme: 'Profit sharing',
      spangram: 'profitsharing',
      words: ['metrics', 'payout', 'reward', 'target', 'bonus', 'split'],
      starts_on: '2026-10-01',
      ends_on: '2026-10-01',
    },
    {
      theme: 'On the board',
      spangram: 'stakeholders',
      words: ['voting', 'shares', 'trustee', 'equity', 'member', 'owner'],
      starts_on: '2026-10-02',
      ends_on: '2026-10-02',
    },
  ],
};

export const LIST_TEMPLATE = {
  _readme: README_LISTS,
  lists: [
    {
      name: 'Employee ownership',
      words: ['shares', 'dividend', 'esop', 'vesting', 'buyout', 'equity'],
    },
    {
      name: 'Around the office',
      words: ['fibre', 'splice', 'conduit', 'router', 'switch'],
    },
  ],
};

export const PASSAGE_TEMPLATE = {
  _readme: README_PASSAGES,
  passages: [
    {
      // 52 letters: easy and hard.
      text: 'We own this place together, and every share of it was earned here.',
      author: 'The charter',
      starts_on: '2026-10-01',
      ends_on: '2026-10-31',
    },
    {
      // 39 letters: the short band, which extreme plays.
      text: 'One share each, and the year we all earned it here.',
      author: null,
      starts_on: '2026-10-01',
      ends_on: '2026-10-31',
    },
  ],
};

/** Hand a file to the browser.
 *
 *  An object URL and a click, because there is no server involved and nothing
 *  to ask for: the template is a constant in this bundle. Revoked afterwards,
 *  or the blob is held for the life of the page. */
export function downloadJson(filename: string, value: unknown): void {
  const blob = new Blob([JSON.stringify(value, null, 2) + '\n'], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
