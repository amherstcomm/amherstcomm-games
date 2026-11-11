// The Start button on a session played on your own time.
//
// The server holds this one too (starting.sql): current_item answers `ready`
// and serves nothing until begin_playing. What the page owes: to say what is
// about to start, to show no question and no count until it has, and to say so
// when Start is refused.
import { expect, test } from './fixtures';

const SESSION = '5f7c2a10-3b4d-4e8f-9a12-6c0d1e2f3a4c';

const READY = {
  state: 'ready',
  mode: 'open',
  yours: false,
  title: 'PowerBeats Pro 2 Trivia',
  total: 20,
  timed: 20,
  seconds_each: 30,
  now: new Date().toISOString(),
};

const QUESTION = {
  state: 'open',
  mode: 'open',
  id: 'q1',
  position: 1,
  opened_at: new Date().toISOString(),
  seconds: 30,
  now: new Date().toISOString(),
  mine: null,
  answer: null,
  total: 20,
  done: 0,
  paused: false,
  kind: 'choice',
  prompt: 'Which year was the company founded?',
  payload: { options: ['2019', '2021'] },
};

async function session(
  page: import('@playwright/test').Page,
  { ready = READY as Record<string, unknown>, refuse = false } = {}
) {
  const state = { started: false, begins: 0 };
  await page.route('**/rest/v1/rpc/**', (route) => {
    const fn = route.request().url().match(/\/rpc\/(\w+)/)?.[1] ?? '';
    const reply = (body: unknown) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (fn === 'begin_playing') {
      state.begins += 1;
      if (refuse) return reply({ ok: false, reason: 'it is not running' });
      state.started = true;
      return reply({ ok: true });
    }
    if (fn === 'current_item') return reply(state.started ? QUESTION : ready);
    if (fn === 'my_standing') return reply({ ok: true, points: 0, scored: 0 });
    return reply({});
  });
  return state;
}

test('opening a session shows what it is and waits for Start', async ({ page }) => {
  const state = await session(page);
  await page.goto(`/live/${SESSION}`);

  await expect(page.getByRole('heading', { name: 'PowerBeats Pro 2 Trivia' })).toBeVisible();
  await expect(page.getByText('20 questions, 30 seconds each.')).toBeVisible();
  await expect(page.getByText(QUESTION.prompt)).toHaveCount(0);
  // No count over a button: nobody is on question 1 yet.
  await expect(page.getByText(/Question 1 of 20/)).toHaveCount(0);

  await page.getByRole('button', { name: 'Start' }).click();
  await expect(page.getByText(QUESTION.prompt)).toBeVisible();
  await expect(page.getByText('Question 1 of 20')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start' })).toHaveCount(0);
  expect(state.begins).toBe(1);
});

test('reloading before starting lands back on Start', async ({ page }) => {
  const state = await session(page);
  await page.goto(`/live/${SESSION}`);
  await expect(page.getByRole('button', { name: 'Start' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Start' })).toBeVisible();
  expect(state.begins).toBe(0);
});

test('a refused Start says why and leaves them where they were', async ({ page }) => {
  await session(page, { refuse: true });
  await page.goto(`/live/${SESSION}`);
  await page.getByRole('button', { name: 'Start' }).click();
  await expect(page.getByText('it is not running')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start' })).toBeEnabled();
});

for (const [line, ready] of [
  ['1 question, no time limit.', { total: 1, timed: 0, seconds_each: null }],
  ['8 questions, each with its own time limit.', { total: 8, timed: 8, seconds_each: null }],
  ['8 questions, 3 of them timed.', { total: 8, timed: 3, seconds_each: null }],
] as const) {
  test(`says "${line}"`, async ({ page }) => {
    await session(page, { ready: { ...READY, ...ready } });
    await page.goto(`/live/${SESSION}`);
    await expect(page.getByText(line)).toBeVisible();
  });
}
