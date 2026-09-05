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

/** The row under the session title. Three links and two buttons, which is the
 *  whole reason this test exists — the mix is what made it possible for half
 *  the row to be aligned differently from the other half. */
const ACTIONS = [
  'Presenter screen',
  'What the room sees',
  'Scores',
  'Duplicate',
  'Delete session',
] as const;

const IS_LINK = (label: string) => !['Duplicate', 'Delete session'].includes(label);

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
      .getByRole(IS_LINK(label) ? 'link' : 'button', { name: label })
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

// Reversal, noted rather than edited away: this used to assert every control
// shared one `top` — "on one line". That held for four controls on Windows and
// stopped holding the moment there were five, because the row is `flex-wrap`
// and Linux draws the same labels wider: CI went red with "the controls are on
// different lines" while the same commit passed on a Mac runner.
//
// One line was never the rule. The row wraps by design — it has to, on a phone,
// where it has always wrapped and this test has never run. What the row owes
// the reader is that its controls are the same size and that the ones sitting
// beside each other line up, which is what it now says. Equal heights is the
// half that catches the original bug's neighbourhood; the centring test above
// catches the bug itself.
test('and they are the same height, lining up with whatever shares their line', async ({
  page,
}) => {
  await editor(page);
  const boxes = [];
  for (const label of ACTIONS) {
    boxes.push(
      await page
        .getByRole(IS_LINK(label) ? 'link' : 'button', { name: label })
        .evaluate((el) => {
          const r = el.getBoundingClientRect();
          return { h: Math.round(r.height), top: Math.round(r.top) };
        })
    );
  }
  expect(new Set(boxes.map((b) => b.h)).size, 'the controls are different heights').toBe(1);

  // Grouped by line rather than assumed to be one. A control whose top is
  // within its own height of another's is beside it; anything further is the
  // next line down.
  const height = boxes[0].h;
  const lines = new Map<number, number[]>();
  for (const b of boxes) {
    const line = [...lines.keys()].find((t) => Math.abs(t - b.top) < height) ?? b.top;
    lines.set(line, [...(lines.get(line) ?? []), b.top]);
  }
  for (const [, tops] of lines) {
    expect(new Set(tops).size, 'controls on the same line do not line up').toBe(1);
  }
  // And the lines are lines: nothing is stacked one control per row, which is
  // what a broken flex container looks like.
  expect(lines.size, 'every control landed on its own line').toBeLessThan(boxes.length);
});

// ---------------------------------------------------------------------------
// Duplicating
//
// The copy is a whole new session, so the one thing worth asserting from the
// browser is that it lands on it. A duplicate that quietly succeeded and left
// you on the original looks exactly like a duplicate that did nothing.
// ---------------------------------------------------------------------------

const COPY = '9a1b2c3d-4e5f-4a6b-8c7d-1e2f3a4b5c6d';

test('duplicating opens the copy, under the name you gave it', async ({ page }) => {
  let asked: string | null = null;
  await page.route('**/rest/v1/rpc/**', (route) => {
    const url = route.request().url();
    if (url.includes('duplicate_session')) {
      asked = JSON.parse(route.request().postData() ?? '{}').p_title;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, id: COPY, items: 3 }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(url.includes('session_sheet') ? SHEET : []),
    });
  });
  await page.goto(`/sessions/${SESSION}`);
  await expect(page.getByRole('heading', { name: 'Test 3' })).toBeVisible();

  page.once('dialog', (d) => {
    // Offered rather than demanded: the default is what most copies want.
    expect(d.defaultValue()).toBe('Test 3 (copy)');
    void d.accept('October, week two');
  });
  await page.getByRole('button', { name: 'Duplicate' }).click();

  await expect(page).toHaveURL(new RegExp(`/sessions/${COPY}$`));
  expect(asked).toBe('October, week two');
});

test('and changing your mind about it does nothing at all', async ({ page }) => {
  let called = false;
  await page.route('**/rest/v1/rpc/**', (route) => {
    const url = route.request().url();
    if (url.includes('duplicate_session')) called = true;
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(url.includes('session_sheet') ? SHEET : []),
    });
  });
  await page.goto(`/sessions/${SESSION}`);
  await expect(page.getByRole('heading', { name: 'Test 3' })).toBeVisible();

  page.once('dialog', (d) => void d.dismiss());
  await page.getByRole('button', { name: 'Duplicate' }).click();
  await expect(page).toHaveURL(new RegExp(`/sessions/${SESSION}$`));
  expect(called, 'cancelling the name still made a copy').toBe(false);
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

async function board(page: import('@playwright/test').Page, { leave = true } = {}) {
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
  // It opens one at a time, because that is how it gets looked at — in front of
  // a room, or afterwards by somebody catching up. The list is the special
  // case.
  await expect(page.getByText(/^1 of \d+$/)).toBeVisible();
  if (leave) {
    // Leaving lands on the results, because that is what the slideshow was
    // showing.
    await page.getByRole('button', { name: 'Leave' }).click();
    await expect(page.getByRole('heading', { name: 'Results' })).toBeVisible();
  }
}

test('the board carries both views on one address', async ({ page }) => {
  // One link to find while a room waits, not two.
  await board(page);
  await page.getByRole('button', { name: /Who won/ }).click();
  await expect(page.getByRole('heading', { name: 'Scores' })).toBeVisible();
  await page.getByRole('button', { name: /How each question went/ }).click();
  await expect(page.getByRole('heading', { name: 'Results' })).toBeVisible();
});

test('an option nobody picked still gets a bar', async ({ page }) => {
  // A chart missing its zeroes quietly rewrites the question — it reads as
  // though 2023 was never offered.
  await board(page);
  await expect(page.getByText('2023')).toBeVisible();
});

test('and an anonymous question is still anonymous on the wall', async ({ page }) => {
  // The promise is to the room. This is the surface where breaking it would be
  // most public and least recoverable — it is on a projector.
  await board(page);
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

test('the results open one at a time, and can be walked through', async ({ page }) => {
  // Scrolling a list to find the next question while a room watches is the
  // part that goes badly, so this is the default rather than a mode to find.
  await board(page, { leave: false });

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

  // offered where it means something and nowhere else
  await expect(page.getByRole('button', { name: /word cloud/ })).toHaveCount(1);
  await page.getByRole('button', { name: /word cloud/ }).click();

  // A whole answer is one entry: splitting on whitespace took "employee
  // ownership" apart and showed the room two ideas where it had given one.
  await expect(page.getByText('Why is the coffee like that?')).toBeVisible();

  // What the cloud drops is the attribution. It carries no names because it
  // carries no rows, which is also why it is the safer thing to put on a wall
  // when the answers were personal.
  await expect(page.getByText(/— anonymous/)).toHaveCount(0);
  await expect(page.getByText('Ada Lovelace')).toHaveCount(0);

  await page.getByRole('button', { name: /Show what was said/ }).click();
  await expect(page.getByText(/— anonymous/)).toBeVisible();
});

test('an open question is marked as a cloud when it is written', async ({ page }) => {
  // Not found on the results screen afterwards: "one phrase for this month" is
  // a cloud before anybody answers it, and discovering the switch after the
  // event is discovering it too late.
  const sent: Record<string, unknown>[] = [];
  await page.route('**/rest/v1/rpc/**', (route) => {
    const url = route.request().url();
    if (url.includes('save_item')) {
      sent.push(JSON.parse(route.request().postData() ?? '{}'));
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, id: 'x' }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(url.includes('session_sheet') ? SHEET : []),
    });
  });
  await page.goto(`/sessions/${SESSION}`);
  await page.getByRole('button', { name: /Add a question/ }).click();
  await page.getByRole('button', { name: 'Open question', exact: true }).click();

  // and offered nowhere else, because nothing else has words to count
  await expect(page.getByText(/Show the answers as a word cloud/)).toBeVisible();
  await page.getByRole('button', { name: 'Multiple choice', exact: true }).click();
  await expect(page.getByText(/Show the answers as a word cloud/)).toHaveCount(0);

  await page.getByRole('button', { name: 'Open question', exact: true }).click();
  await page.getByRole('checkbox', { name: /word cloud/ }).check();
  await page.getByRole('textbox').first().fill('One phrase for this month?');
  await page.getByRole('button', { name: 'Add question' }).click();

  await expect.poll(() => sent.at(-1)?.p_payload).toEqual({ cloud: true });
});
