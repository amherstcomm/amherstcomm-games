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
