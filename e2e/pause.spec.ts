// Pausing a session played on your own time.
//
// The server holds the pause (pausereset.sql): the question you are on stays
// yours to finish, and the next one is not served -- its clock not started --
// until you resume. What the page owes: a way to ask for it while answering,
// a button after answering that says what it will do, a paused screen that is
// what a reload lands on, and a resume that asks for the next question.
import { expect, test } from './fixtures';

const SESSION = '5f7c2a10-3b4d-4e8f-9a12-6c0d1e2f3a4b';

const QUESTION = (id: string, done: number, paused: boolean) => ({
  state: 'open',
  mode: 'open',
  id,
  position: done + 1,
  opened_at: new Date().toISOString(),
  seconds: null,
  now: new Date().toISOString(),
  mine: null,
  answer: null,
  total: 3,
  done,
  paused,
  kind: 'choice',
  prompt: `Question ${id}`,
  payload: { options: ['2019', '2021'], multi: true },
});

/** A session whose server-side pause flag the test can watch being set. */
async function session(page: import('@playwright/test').Page) {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const state = { paused: false, answered: false };
  await page.route('**/rest/v1/rpc/**', (route) => {
    const fn = route.request().url().match(/\/rpc\/(\w+)/)?.[1] ?? '';
    let args: Record<string, unknown> = {};
    try {
      args = JSON.parse(route.request().postData() ?? '{}');
    } catch {
      // a GET carries nothing this file reads
    }
    calls.push({ fn, args });
    const reply = (body: unknown) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (fn === 'pause_session') {
      state.paused = !!args.p_on;
      return reply({ ok: true, paused: state.paused });
    }
    if (fn === 'answer_item') {
      state.answered = true;
      return reply({ ok: true, answer: { correct: ['2019'] } });
    }
    if (fn === 'current_item') {
      // What the server does: once q1 is answered, a pause holds back q2.
      if (!state.answered) return reply(QUESTION('q1', 0, state.paused));
      if (state.paused) {
        return reply({ state: 'paused', mode: 'open', paused: true, total: 3, done: 1,
                       now: new Date().toISOString() });
      }
      return reply(QUESTION('q2', 1, false));
    }
    if (fn === 'my_standing') return reply({ ok: true, points: 1, scored: 1 });
    return reply({});
  });
  return { calls, state };
}

test('a player can pause after the question they are on, and come back to the next', async ({ page }) => {
  const { calls, state } = await session(page);
  await page.goto(`/live/${SESSION}`);
  await expect(page.getByText('Question q1')).toBeVisible();

  // Asked for while answering; the question in front of them stays theirs.
  const pause = page.getByRole('button', { name: 'Pause after this question' });
  await pause.click();
  await expect(page.getByRole('button', { name: /Pausing after this question/ })).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  // The switch shows at once and the request follows it, so wait for that.
  await expect.poll(() => state.paused).toBe(true);
  await expect(page.getByText('Question q1')).toBeVisible();

  await page.getByRole('button', { name: '2019' }).click();
  await page.getByRole('button', { name: 'Send answer' }).click();
  // The button after answering says what it will do.
  await page.getByRole('button', { name: 'Pause here' }).click();

  await expect(page.getByText('Paused', { exact: true })).toBeVisible();
  await expect(page.getByText('Paused before question 2 of 3')).toBeVisible();
  await expect(page.getByText(/its clock, will wait until you come back/)).toBeVisible();
  // Nothing to answer while paused.
  await expect(page.getByText('Question q2')).toHaveCount(0);

  await page.getByRole('button', { name: 'Resume' }).click();
  await expect(page.getByText('Question q2')).toBeVisible();
  expect(calls.filter((c) => c.fn === 'pause_session').map((c) => c.args.p_on)).toEqual([true, false]);
});

test('coming back while paused lands on the paused screen, not a new question', async ({ page }) => {
  const { state } = await session(page);
  state.paused = true;
  state.answered = true;
  await page.goto(`/live/${SESSION}`);
  await expect(page.getByText('Paused', { exact: true })).toBeVisible();
  await expect(page.getByText('Question q2')).toHaveCount(0);
});

test('changing their mind before answering carries on as normal', async ({ page }) => {
  const { state } = await session(page);
  await page.goto(`/live/${SESSION}`);
  await page.getByRole('button', { name: 'Pause after this question' }).click();
  await page.getByRole('button', { name: /Pausing after this question/ }).click();
  await expect.poll(() => state.paused).toBe(false);

  await page.getByRole('button', { name: '2019' }).click();
  await page.getByRole('button', { name: 'Send answer' }).click();
  await page.getByRole('button', { name: 'Next question' }).click();
  await expect(page.getByText('Question q2')).toBeVisible();
});
