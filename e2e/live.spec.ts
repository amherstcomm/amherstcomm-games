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
  // What it shows instead is why. It used to offer "Play it yourself", which
  // stopped being true when the host stopped being a player in their own
  // session — a link to a screen that would refuse them.
  await expect(page.getByText(/Nobody is looking at the same question/)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Play it yourself' })).toHaveCount(0);
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

// ---------------------------------------------------------------------------
// The presenter is not playing
// ---------------------------------------------------------------------------

test('the presenter sees the question but cannot answer it', async ({ page }) => {
  // The screen is pointed at a room, so the question is on it. What is not on
  // it is a way in: the host wrote the answers, or has the correct one in front
  // of them to run the reveal, and a score from that seat means nothing.
  //
  // The server refuses either way — runs_session — so this is about not
  // offering a control that would be refused, which is the screen lying.
  await presenting(page, 'choice');
  await expect(page.getByText('Which year?')).toBeVisible();

  const options = page.getByRole('button', { name: /^(2019|2021)$/ });
  await expect(options).toHaveCount(2);
  for (const el of await options.all()) {
    await expect(el, 'an option the presenter could press').toBeDisabled();
  }
  await expect(page.getByText(/you are not scored on it/i)).toBeVisible();
});

test('and is offered no way to submit one either', async ({ page }) => {
  await presenting(page, 'choice');
  // the multi-select send, which is the one that is not a bare option
  await expect(page.getByRole('button', { name: 'Send answer' })).toHaveCount(0);
});

test('an open question is read out by the presenter, not asked by them', async ({ page }) => {
  await presenting(page, 'open');
  await expect(page.getByText('Ask anything')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Send$/ })).toHaveCount(0);
  await expect(page.getByPlaceholder(/What would you like to ask/)).toHaveCount(0);
});

test('a word game on the presenter screen takes no guesses', async ({ page }) => {
  await presenting(page, 'game');
  // the grid is there — it is what the room is looking at
  await expect(page.getByText(/Six letters/)).toBeVisible();
  // and the way in is not
  await expect(page.getByText(/Type your guess, then press Enter/)).toHaveCount(0);
});

test('but a player still gets all of it', async ({ page }) => {
  // the other half of the rule: this must not have disabled the room
  const item = {
    state: 'open',
    id: 'q1',
    position: 2,
    opened_at: new Date().toISOString(),
    seconds: null,
    now: new Date().toISOString(),
    mine: null,
    answer: null,
    ...ITEMS.choice,
  };
  await page.route('**/rest/v1/rpc/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        route.request().url().includes('current_item')
          ? item
          : route.request().url().includes('my_standing')
            ? { ok: true, points: 0, scored: 0 }
            : {}
      ),
    })
  );
  await page.goto(`/live/${SESSION}`);
  await expect(page.getByText('Which year?')).toBeVisible();
  await expect(page.getByRole('button', { name: '2021' })).toBeEnabled();
  await expect(page.getByText(/you are not scored on it/i)).toHaveCount(0);
});

// ---------------------------------------------------------------------------
// Moving on, in an open session
// ---------------------------------------------------------------------------

/** Answering, per kind, because each one submits differently — and that is
 *  exactly how one of them came to have no way onwards while the other six
 *  were fine. */
const ANSWER: Record<string, (p: import('@playwright/test').Page) => Promise<void>> = {
  // ITEMS.choice is a multi-select, so picking is not sending — which is the
  // whole reason each kind needs its own gesture here.
  choice: async (p) => {
    await p.getByRole('button', { name: '2019' }).click();
    await p.getByRole('button', { name: 'Send answer' }).click();
  },
  match: async (p) => {
    await p.getByRole('combobox').selectOption('Analyst');
    await p.getByRole('button', { name: 'Send answer' }).click();
  },
  number: async (p) => {
    await p.getByRole('textbox').first().fill('41');
    await p.getByRole('button', { name: /Send guess/ }).click();
  },
  rank: async (p) => void (await p.getByRole('button', { name: /Send order/ }).click()),
  open: async (p) => {
    await p.getByPlaceholder(/What would you like to ask/).fill('why');
    await p.getByRole('button', { name: /^Send$/ }).click();
  },
  game: async (p) => {
    await p.keyboard.type('owners');
    await p.keyboard.press('Enter');
  },
};

async function playing(page: import('@playwright/test').Page, which: keyof typeof ITEMS) {
  await page.route('**/rest/v1/rpc/**', (route) => {
    const url = route.request().url();
    if (url.includes('guess_word')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          marks: Array(6).fill('correct'),
          solved: true,
          left: 5,
          word: 'OWNERS',
        }),
      });
    }
    const body = url.includes('answer_item')
      ? { ok: true, answer: { correct: ['2019'] } }
      : url.includes('current_item')
        ? {
            state: 'open',
            mode: 'open',
            id: 'q1',
            position: 1,
            opened_at: new Date().toISOString(),
            seconds: null,
            now: new Date().toISOString(),
            mine: null,
            answer: null,
            total: 3,
            done: 0,
            ...ITEMS[which],
          }
        : url.includes('game_state')
          ? { ok: true, guesses: [], solved: false, word: null }
          : url.includes('my_standing')
            ? { ok: true, points: 0, scored: 0 }
            : {};
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
  await page.goto(`/live/${SESSION}`);
  await expect(page.getByRole('heading').last()).toBeVisible();
}

for (const kind of Object.keys(ANSWER) as (keyof typeof ITEMS)[]) {
  test(`answering a ${kind} question in an open session offers a way onwards`, async ({
    page,
  }) => {
    // The word game had none: every other kind goes through one send, and it
    // does not — each guess is its own call — so the screen around it never
    // learned the round was over and the player sat on a solved board.
    await playing(page, kind);
    await ANSWER[kind](page);
    await expect(page.getByRole('button', { name: /Next question|^Finish$/ })).toBeVisible({
      timeout: 3000,
    });
  });
}

test('and nothing is served while they are looking at how they did', async ({ page }) => {
  // current_item does not report in open mode, it serves — so a poll running
  // here hands out the next question and starts its clock while the player is
  // still reading the last one's answer. Seconds off a timed question they
  // have not been shown.
  let served = 0;
  await page.route('**/rest/v1/rpc/**', (route) => {
    const url = route.request().url();
    if (url.includes('current_item')) served++;
    const body = url.includes('answer_item')
      ? { ok: true, answer: { correct: ['2019'] } }
      : url.includes('current_item')
        ? {
            state: 'open',
            mode: 'open',
            id: 'q1',
            position: 1,
            opened_at: new Date().toISOString(),
            seconds: 30,
            now: new Date().toISOString(),
            mine: null,
            answer: null,
            total: 3,
            done: 0,
            ...ITEMS.choice,
          }
        : url.includes('my_standing')
          ? { ok: true, points: 0, scored: 0 }
          : {};
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
  await page.goto(`/live/${SESSION}`);
  await expect(page.getByRole('button', { name: '2019' })).toBeVisible();
  await page.getByRole('button', { name: '2019' }).click();
  await page.getByRole('button', { name: 'Send answer' }).click();
  await expect(page.getByRole('button', { name: /Next question|^Finish$/ })).toBeVisible();

  const before = served;
  // longer than the poll interval, which is five seconds
  await page.waitForTimeout(6500);
  expect(served, 'the next question was served while they were still reading').toBe(before);

  await page.getByRole('button', { name: /Next question|^Finish$/ }).click();
  await expect.poll(() => served).toBeGreaterThan(before);
});

test('the host arriving at the player address is not offered a way in', async ({ page }) => {
  // The bug this closes. `readOnly` used to come from the address — /host or
  // not — while the server's rule is whether *this person* runs the session.
  // They disagree for exactly one person: the host arriving through /join like
  // everybody else. They got a fully working question, answered it, and were
  // refused, with nothing moving on. Reported as "it sent, but nothing moved
  // on" over a matching question, which is a kind that needs a Send button and
  // so makes the disagreement visible rather than instant.
  const item = {
    state: 'open',
    id: 'q1',
    position: 2,
    opened_at: new Date().toISOString(),
    seconds: null,
    now: new Date().toISOString(),
    mine: null,
    answer: null,
    yours: true,
    ...ITEMS.match,
  };
  await page.route('**/rest/v1/rpc/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        route.request().url().includes('current_item')
          ? item
          : route.request().url().includes('my_standing')
            ? { ok: true, points: 0, scored: 0 }
            : {}
      ),
    })
  );
  // the player address, not /host
  await page.goto(`/live/${SESSION}`);
  await expect(page.getByText('Match them up')).toBeVisible();

  await expect(page.getByRole('combobox').first()).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Send answer' })).toHaveCount(0);
  await expect(page.getByText(/you are not scored on it/i)).toBeVisible();
});

test('and everybody else at that address still gets a working question', async ({ page }) => {
  const item = {
    state: 'open',
    id: 'q1',
    position: 2,
    opened_at: new Date().toISOString(),
    seconds: null,
    now: new Date().toISOString(),
    mine: null,
    answer: null,
    yours: false,
    ...ITEMS.match,
  };
  await page.route('**/rest/v1/rpc/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        route.request().url().includes('current_item')
          ? item
          : route.request().url().includes('my_standing')
            ? { ok: true, points: 0, scored: 0 }
            : {}
      ),
    })
  );
  await page.goto(`/live/${SESSION}`);
  await expect(page.getByRole('combobox').first()).toBeEnabled();
  await page.getByRole('combobox').first().selectOption('Analyst');
  await expect(page.getByRole('button', { name: 'Send answer' })).toBeEnabled();
  await expect(page.getByText(/you are not scored on it/i)).toHaveCount(0);
});

test('a timed question that runs out is not a dead end', async ({ page }) => {
  // Reported from a live deployment, over a matching question: the clock hit
  // zero, the screen still offered "Send answer", the server refused it, and
  // there was no way forward. Open mode has no presenter to move the room on,
  // so the round simply stopped.
  //
  // Served three seconds ago with a five-second window, so it runs out while
  // the test watches rather than being expired on arrival — the transition is
  // the thing that was broken.
  let done = 0;
  await page.route('**/rest/v1/rpc/**', (route) => {
    const url = route.request().url();
    const body = url.includes('answer_item')
      ? { ok: false, reason: 'time is up for this one' }
      : url.includes('current_item')
        ? done === 0
          ? {
              state: 'open',
              mode: 'open',
              yours: false,
              id: 'q1',
              position: 1,
              opened_at: new Date(Date.now() - 3000).toISOString(),
              seconds: 5,
              now: new Date().toISOString(),
              mine: null,
              answer: null,
              total: 6,
              done: 0,
              ...ITEMS.match,
            }
          : {
              state: 'open',
              mode: 'open',
              yours: false,
              id: 'q2',
              position: 2,
              opened_at: new Date().toISOString(),
              seconds: null,
              now: new Date().toISOString(),
              mine: null,
              answer: null,
              total: 6,
              done: 1,
              ...ITEMS.choice,
              prompt: 'The one after it',
            }
        : url.includes('my_standing')
          ? { ok: true, points: 0, scored: 0 }
          : {};
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
  await page.goto(`/live/${SESSION}`);
  await expect(page.getByRole('combobox').first()).toBeEnabled();

  // the clock runs out
  await expect(page.getByText(/Time is up/i)).toBeVisible({ timeout: 6000 });

  // nothing is offered that the server would refuse
  await expect(page.getByRole('button', { name: 'Send answer' })).toHaveCount(0);
  await expect(page.getByRole('combobox').first()).toBeDisabled();

  // and there is a way past it
  const on = page.getByRole('button', { name: 'Move on' });
  await expect(on).toBeVisible();
  done = 1;
  await on.click();
  await expect(page.getByText('The one after it')).toBeVisible();
});
