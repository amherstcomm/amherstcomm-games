// The presenter can always move the room on.
//
// This exists because of one bug and generalises past it. The word game's
// touch-typing overlay is `absolute inset-0`, which fills the nearest
// *positioned* ancestor — and rendered with none it filled the page, sat
// invisibly over the presenter's controls, and ate every click on Close,
// Reveal and Finish. Nothing looked wrong. The board was perfect, the tiles
// typed, and the room could not be advanced.
//
// A screenshot cannot see it, axe cannot see it, and the unit tests do not
// render. What catches it is asking the browser what is actually on top of the
// button — which is what Playwright does when it clicks, so clicking *is* the
// assertion.
import { expect, test } from './fixtures';

const SESSION = '5f7c2a10-3b4d-4e8f-9a12-6c0d1e2f3a4b';

const DOOR = {
  ok: true,
  title: 'Week one',
  code: 'K4TP',
  state: 'live',
  total: 4,
  pending: 2,
  position: 2,
  item_state: 'open',
};

/** Every kind that has ever put something over the page. `game` is the one
 *  that broke; the rest are here so the next overlay is caught by a test that
 *  already exists rather than by somebody at a projector. */
const ITEMS = {
  game: {
    kind: 'game',
    prompt: 'Six letters. What we all are.',
    payload: { slug: 'guess', length: 6, tries: 6 },
  },
  choice: {
    kind: 'choice',
    prompt: 'Which year?',
    payload: { options: ['2019', '2021'], multi: true },
  },
  match: {
    kind: 'match',
    prompt: 'Match them up',
    payload: { left: ['Ada'], right: ['Analyst', 'Teacher'] },
  },
  number: { kind: 'number', prompt: 'How much?', payload: { currency: 'USD' } },
  rank: { kind: 'rank', prompt: 'In order', payload: { options: ['a', 'b', 'c'] } },
  open: { kind: 'open', prompt: 'Ask anything', payload: {} },
} as const;

async function presenting(page: import('@playwright/test').Page, which: keyof typeof ITEMS) {
  // Recorded here rather than through the shared fixture: this route is
  // registered after the fixture's and wins, so the fixture never sees these.
  const calls: string[] = [];
  const item = {
    state: 'open',
    id: 'q1',
    position: 2,
    opened_at: new Date().toISOString(),
    seconds: null,
    now: new Date().toISOString(),
    mine: null,
    answer: null,
    ...ITEMS[which],
  };
  // Registered after the fixture's handler, so this one wins.
  await page.route('**/rest/v1/rpc/**', (route) => {
    const url = route.request().url();
    calls.push(url.split('/rpc/')[1]?.split('?')[0] ?? '');
    const body = url.includes('session_door')
      ? DOOR
      : url.includes('current_item')
        ? item
        : url.includes('presenter_view')
          ? { ok: true, answered: 3, responses: [] }
          : url.includes('game_state')
            ? { ok: true, guesses: [], solved: false, word: null }
            : url.includes('session_leaderboard')
              ? { ok: true, scored: 1, standings: [] }
              : url.includes('advance_session')
                ? { ok: true }
                : {};
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
  await page.goto(`/live/${SESSION}/host`);
  await expect(page.getByText('Question 2 of 4')).toBeVisible();
  return calls;
}

for (const kind of Object.keys(ITEMS) as (keyof typeof ITEMS)[]) {
  test(`the presenter can close the answers over a ${kind} question`, async ({ page }) => {
    const calls = await presenting(page, kind);

    // The primary move. `click` fails if anything covers the button — which is
    // the whole point, and is exactly how the bug presented.
    await page.getByRole('button', { name: 'Close the answers' }).click({ timeout: 3000 });
    await expect
      .poll(() => calls.filter((c) => c === 'advance_session').length, {
        message: 'the click reached the server',
      })
      .toBeGreaterThan(0);
  });

  test(`and can finish the session over a ${kind} question`, async ({ page }) => {
    await presenting(page, kind);
    // A secondary move, and the last one on the row — the far end of the
    // control block is where a page-filling overlay bites first.
    await page.getByRole('button', { name: 'Finish', exact: true }).click({ timeout: 3000 });
  });
}

test('nothing invisible is sitting on top of the presenter controls', async ({ page }) => {
  // The same fact stated directly rather than through a click, so a failure
  // says *what* is covering the button instead of "element intercepts pointer
  // events". Worth having both: this one names the culprit.
  await presenting(page, 'game');
  const covering = await page
    .getByRole('button', { name: 'Close the answers' })
    .evaluate((el) => {
      const r = el.getBoundingClientRect();
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return top === el || el.contains(top) ? null : (top?.outerHTML.slice(0, 120) ?? 'nothing');
    });
  expect(covering, 'something is over the button').toBeNull();
});

// ---------------------------------------------------------------------------
// Hosting an open session
// ---------------------------------------------------------------------------

const OPEN_DOOR = {
  ok: true,
  title: 'Play it whenever',
  code: 'K4TP',
  state: 'live',
  mode: 'open',
  total: 6,
  pending: 0,
  position: null,
  item_state: null,
  players: 7,
};

async function hostingOpen(page: import('@playwright/test').Page) {
  const calls: string[] = [];
  await page.route('**/rest/v1/rpc/**', (route) => {
    const url = route.request().url();
    calls.push(url.split('/rpc/')[1]?.split('?')[0] ?? '');
    const body = url.includes('session_door')
      ? OPEN_DOOR
      : url.includes('session_leaderboard')
        ? { ok: true, scored: 4, standings: [] }
        : url.includes('current_item')
          ? { ...ITEMS.choice, state: 'open', mode: 'open', id: 'q1', now: new Date().toISOString() }
          : {};
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
  await page.goto(`/live/${SESSION}/host`);
  await expect(page.getByText(/people have played/)).toBeVisible();
  return calls;
}

test('hosting an open session never asks for a question', async ({ page }) => {
  // The bug, and the reason this is asserted on the *call* rather than on what
  // is drawn: current_item does not merely report in open mode, it serves —
  // asking what you are looking at is what puts a question in front of you and
  // starts your clock. So opening this page dealt the host into their own
  // session. A screen with no question on it would look identical either way.
  const calls = await hostingOpen(page);
  await page.waitForTimeout(300);
  expect(calls, 'the host was served a question').not.toContain('current_item');
});

test('and shows no question, because everybody is somewhere different', async ({ page }) => {
  await hostingOpen(page);
  await expect(page.getByText('Which year?')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '2019' })).toHaveCount(0);
  // what it shows instead: why, and the way to play it as a player
  await expect(page.getByText(/Nobody is looking at the same question/)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Play it yourself' })).toBeVisible();
});

test('and keeps the code and the one control it does have', async ({ page }) => {
  await hostingOpen(page);
  await expect(page.getByText('K4TP').first()).toBeVisible();
  await expect(page.getByRole('img', { name: /Scan to join/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Close it' })).toBeVisible();
  // and not one of the presenter's, which the server would refuse anyway
  for (const gone of ['Close the answers', 'Show the answer', 'Skip to the next question']) {
    await expect(page.getByRole('button', { name: gone })).toHaveCount(0);
  }
});
