// The editor's action row lines up.
//
// A <button> centres its own content; an <a> does not. The same class carrying
// a fixed height on both gave a row where two of the four controls had their
// label sitting at the top of the box — reported from the editor, and invisible
// to every check this project had: it typechecks, it lints, axe reads the same
// accessible names either way, and the one link that happened to carry its own
// `inline-flex` for an icon looked perfectly fine next to the two that did not.
//
// Measured rather than eyeballed, because "looks aligned" is the judgement that
// missed it in the first place.
import { expect, test } from './fixtures';

const SESSION = '5f7c2a10-3b4d-4e8f-9a12-6c0d1e2f3a4b';

/** The row under the session title. Three links and a button, which is the
 *  whole reason this test exists. */
const ACTIONS = ['Presenter screen', 'What the room sees', 'Scores', 'Delete session'] as const;

const SHEET = {
  ok: true,
  session: {
    id: SESSION,
    title: 'Test 3',
    state: 'closed',
    late_join: 'strict',
    current_item: null,
    code: 'K4TP',
  },
  kinds: [
    { kind: 'choice', description: 'x', scored: true },
    { kind: 'survey', description: 'x', scored: false },
    { kind: 'open', description: 'x', scored: false },
    { kind: 'match', description: 'x', scored: true },
    { kind: 'number', description: 'x', scored: true },
    { kind: 'rank', description: 'x', scored: true },
    { kind: 'game', description: 'x', scored: true },
  ],
  items: [
    {
      id: 'a',
      position: 1,
      kind: 'survey',
      prompt: 'Favorite Animal?',
      payload: { options: ['Cat', 'Dog'], seconds: 60 },
      state: 'revealed',
      answer: null,
      responses: 1,
    },
  ],
};

async function editor(page: import('@playwright/test').Page) {
  await page.route('**/rest/v1/rpc/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(route.request().url().includes('session_sheet') ? SHEET : []),
    })
  );
  await page.goto(`/sessions/${SESSION}`);
  await expect(page.getByRole('heading', { name: 'Test 3' })).toBeVisible();
}

/** Where the label actually sits inside its control, as a fraction of the
 *  control's height. Half is centred; a label pinned to the top comes out well
 *  under that, which is what this caught. */
const OFFSETS = `(el) => {
  const box = el.getBoundingClientRect();
  const range = document.createRange();
  range.selectNodeContents(el);
  const text = range.getBoundingClientRect();
  return (text.top + text.height / 2 - box.top) / box.height;
}`;

test('every control in the action row has its label centred', async ({ page }) => {
  await editor(page);
  const offsets: { label: string; at: number }[] = [];
  for (const label of ACTIONS) {
    const at = await page
      .getByRole(label === 'Delete session' ? 'button' : 'link', { name: label })
      .evaluate(
        (el, fn) =>
          // eslint-disable-next-line no-new-func
          new Function('return ' + fn)()(el) as number,
        OFFSETS
      );
    offsets.push({ label, at });
  }

  for (const { label, at } of offsets) {
    // Generous: a centred label lands at 0.5, and the failure this guards put
    // one at roughly 0.25. Anything inside a fifth of the middle is fine.
    expect(at, `"${label}" sits at ${at.toFixed(2)} of its height`).toBeGreaterThan(0.4);
    expect(at, `"${label}" sits at ${at.toFixed(2)} of its height`).toBeLessThan(0.6);
  }
});

test('and they are the same height, on one line', async ({ page }) => {
  await editor(page);
  const boxes = [];
  for (const label of ACTIONS) {
    boxes.push(
      await page
        .getByRole(label === 'Delete session' ? 'button' : 'link', { name: label })
        .evaluate((el) => {
          const r = el.getBoundingClientRect();
          return { h: Math.round(r.height), top: Math.round(r.top) };
        })
    );
  }
  expect(new Set(boxes.map((b) => b.h)).size, 'the controls are different heights').toBe(1);
  expect(new Set(boxes.map((b) => b.top)).size, 'the controls are on different lines').toBe(1);
});

// ---------------------------------------------------------------------------
// The results panel
// ---------------------------------------------------------------------------

const SCORES = {
  ok: true,
  title: 'Week one',
  state: 'closed',
  mode: 'live',
  questions: [{ id: 'a', position: 1, kind: 'choice', prompt: 'Which year?' }],
  standings: [{ place: 1, name: 'Ada Lovelace', points: 2, seconds: 6, marks: { '1': 1 } }],
};

const RESULTS = {
  ok: true,
  title: 'Week one',
  state: 'closed',
  mode: 'live',
  items: [
    {
      id: 'w',
      position: 0,
      kind: 'survey',
      prompt: 'How is the coffee?',
      chart: {
        type: 'bars',
        total: 4,
        bars: [
          { label: 'Fine', count: 1, correct: null },
          { label: 'Not fine', count: 3, correct: null },
        ],
      },
    },
    {
      id: 'a',
      position: 1,
      kind: 'choice',
      prompt: 'Which year did we become employee-owned?',
      chart: {
        type: 'bars',
        total: 14,
        bars: [
          { label: '2019', count: 5, correct: false },
          { label: '2021', count: 9, correct: true },
          { label: '2023', count: 0, correct: false },
        ],
      },
    },
    {
      id: 'e',
      position: 2,
      kind: 'open',
      prompt: 'Anything for the board?',
      chart: {
        type: 'texts',
        total: 2,
        texts: [
          { value: 'When is the picnic?', who: 'Ada Lovelace' },
          { value: 'Why is the coffee like that?', who: null },
        ],
      },
    },
  ],
};

async function board(page: import('@playwright/test').Page) {
  await page.route('**/rest/v1/rpc/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        route.request().url().includes('session_results') ? RESULTS : SCORES
      ),
    })
  );
  await page.goto(`/scores/${SESSION}`);
  await expect(page.getByRole('heading', { name: 'Scores' })).toBeVisible();
}

test('the board carries both views on one address', async ({ page }) => {
  // One link to find while a room waits, not two.
  await board(page);
  await page.getByRole('button', { name: /How each question went/ }).click();
  await expect(page.getByRole('heading', { name: 'Results' })).toBeVisible();
  await page.getByRole('button', { name: /Who won/ }).click();
  await expect(page.getByRole('heading', { name: 'Scores' })).toBeVisible();
});

test('an option nobody picked still gets a bar', async ({ page }) => {
  // A chart missing its zeroes quietly rewrites the question — it reads as
  // though 2023 was never offered.
  await board(page);
  await page.getByRole('button', { name: /How each question went/ }).click();
  await expect(page.getByText('2023')).toBeVisible();
});

test('and an anonymous question is still anonymous on the wall', async ({ page }) => {
  // The promise is to the room. This is the surface where breaking it would be
  // most public and least recoverable — it is on a projector.
  await board(page);
  await page.getByRole('button', { name: /How each question went/ }).click();
  await expect(page.getByText('Why is the coffee like that?')).toBeVisible();
  await expect(page.getByText(/— anonymous/)).toBeVisible();

  const named = page.locator('li', { hasText: 'Why is the coffee like that?' });
  await expect(named).not.toContainText('Ada Lovelace');
});

test('every field caption sits above its input, not beside it', async ({ page }) => {
  // Two of these are capped narrow — the clock and the currency code — and
  // every other one is full width. A full-width input pushes its caption onto
  // its own line all by itself, so the captions looked stacked without any of
  // them saying so; the narrow ones then sat beside their words with nothing
  // between them. Reported from the authoring form.
  //
  // Measured over every field in the form rather than the two that broke, so
  // the next narrow input is covered by a test that already exists.
  await editor(page);
  await page.getByRole('button', { name: /Add a question/ }).click();

  // walk the kinds, because which fields exist depends on the kind
  for (const kind of ['Multiple choice', 'Closest guess', 'Matching', 'Word game']) {
    await page.getByRole('button', { name: kind, exact: true }).click();

    const rows = await page
      .locator('label:has(> span):has(input, textarea, select)')
      .evaluateAll((labels) =>
        labels.map((el) => {
          const caption = el.querySelector(':scope > span') as HTMLElement | null;
          const field = el.querySelector('input, textarea, select') as HTMLElement | null;
          if (!caption || !field) return null;
          const c = caption.getBoundingClientRect();
          const f = field.getBoundingClientRect();
          return { label: caption.textContent?.trim().slice(0, 40) ?? '', below: f.top >= c.bottom };
        })
      );

    for (const row of rows) {
      if (!row) continue;
      expect(row.below, `"${row.label}" (${kind}) is beside its caption`).toBe(true);
    }
  }
});

test('the results can be walked through one at a time', async ({ page }) => {
  // Scrolling a list to find the next question while a room watches is the
  // part that goes badly.
  await board(page);
  await page.getByRole('button', { name: /How each question went/ }).click();
  await page.getByRole('button', { name: /One at a time/ }).click();

  await expect(page.getByText('1 of 4')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'How is the coffee?' })).toBeVisible();

  // A presentation remote is a keyboard that sends some subset of these and
  // nobody knows which, so it answers to all of them.
  await page.keyboard.press('ArrowRight');
  await expect(page.getByText('2 of 4')).toBeVisible();
  await page.keyboard.press('PageDown');
  await expect(page.getByText('3 of 4')).toBeVisible();
  await page.keyboard.press('Space');

  // The standings are the last slide, because that is the order it gets told
  // in — how each question went, and then who won.
  await expect(page.getByRole('heading', { name: 'Who won' })).toBeVisible();
  await expect(page.getByText('Ada Lovelace')).toBeVisible();

  await page.keyboard.press('ArrowRight');
  await expect(page.getByText('4 of 4'), 'walked off the end').toBeVisible();

  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: /One at a time/ })).toBeVisible();
});

test('an open question can be shown as a word cloud', async ({ page }) => {
  await board(page);
  await page.getByRole('button', { name: /How each question went/ }).click();

  // offered where it means something and nowhere else
  await expect(page.getByRole('button', { name: /word cloud/ })).toHaveCount(1);
  await page.getByRole('button', { name: /word cloud/ }).click();

  // The sentences are gone and the words are there. A cloud carries no names
  // because it carries no sentences, which is also why it is the safer thing
  // to put on a wall when the answers were personal.
  await expect(page.getByText('Why is the coffee like that?')).toHaveCount(0);
  await expect(page.getByText('coffee', { exact: true })).toBeVisible();
  await expect(page.getByText('the', { exact: true }), 'a filler word on the wall').toHaveCount(0);

  await page.getByRole('button', { name: /Show what was said/ }).click();
  await expect(page.getByText('Why is the coffee like that?')).toBeVisible();
});
