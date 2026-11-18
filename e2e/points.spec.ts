// Keep score: asked when a session is made, switchable until people answer,
// and each question with its own say. A question that keeps no score shows no
// points field and no clock, because neither means anything there.
import { expect, test } from './fixtures';

const SESSION = '8c3d4e5f-6071-4b8c-9d0e-1f2a3b4c5d6e';
type Call = { fn: string; args: Record<string, unknown> };

async function stub(page: import('@playwright/test').Page, session: Record<string, unknown> = {}) {
  const calls: Call[] = [];
  const sheet = {
    ok: true,
    session: { id: SESSION, title: 'Benefits', state: 'draft', late_join: 'strict', current_item: null, code: null,
               mode: 'open', qa: false, shared: false, avatars: 'off', privacy: 'room', points: 'on',
               min_results: 5, show_comments: true, answered: 0, attached: false, ...session },
    kinds: [
      { kind: 'choice', description: 'x', scored: true },
      { kind: 'survey', description: 'x', scored: false },
    ],
    items: [],
  };
  await page.route('**/rest/v1/rpc/**', (route) => {
    const fn = route.request().url().match(/\/rpc\/(\w+)/)?.[1] ?? '';
    const args = JSON.parse(route.request().postData() ?? '{}');
    calls.push({ fn, args });
    const body =
      fn === 'session_sheet' ? sheet
      : fn === 'create_session' ? { ok: true, id: SESSION }
      : fn === 'set_session_points' || fn === 'save_item' ? { ok: true, id: 'i1' }
      : fn === 'my_sessions' ? []
      : [];
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  return calls;
}

test('a session is asked whether it is trivia or a survey, and a survey keeps no score', async ({ page }) => {
  const calls = await stub(page);
  await page.goto('/sessions');
  // the name is asked for by pressing, not by a greyed-out button
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByText('Give it a name first.')).toBeVisible();

  await page.getByRole('textbox').first().fill('Benefits survey');
  await page.getByRole('radio', { name: /^Survey/ }).check();
  await page.getByRole('button', { name: 'Create' }).click();
  await expect.poll(() => calls.find((c) => c.fn === 'set_session_points')?.args)
    .toEqual({ p_session: SESSION, p_points: 'off' });
});

test('trivia is made keeping score, with nothing more to call', async ({ page }) => {
  const calls = await stub(page);
  await page.goto('/sessions');
  await page.getByRole('textbox').first().fill('Friday trivia');
  await page.getByRole('button', { name: 'Create' }).click();
  await expect.poll(() => calls.some((c) => c.fn === 'create_session')).toBe(true);
  expect(calls.some((c) => c.fn === 'set_session_points')).toBe(false);
});

test('in a session that keeps no score, a question shows no points and no clock unless it says so', async ({ page }) => {
  const calls = await stub(page, { points: 'off' });
  await page.goto(`/sessions/${SESSION}`);
  await expect(page.getByRole('checkbox', { name: 'Keep score' })).not.toBeChecked();
  await page.getByRole('button', { name: 'Add a question' }).click();
  await page.getByRole('button', { name: 'Multiple choice', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Points' })).toHaveCount(0);
  await expect(page.getByText(/Seconds to answer/)).toHaveCount(0);
  await expect(page.getByText('No points and no clock. The correct answer is still shown after.')).toBeVisible();

  // one scored question in a survey
  await page.getByRole('combobox', { name: 'Keep score' }).selectOption('on');
  await expect(page.getByRole('textbox', { name: 'Points' })).toBeVisible();
  await expect(page.getByText(/Seconds to answer/)).toBeVisible();

  await page.getByRole('textbox', { name: 'Question' }).fill('Which plan has the lower deductible?');
  await page.getByRole('textbox', { name: /Options, one per line/ }).fill('PPO\nHDHP');
  await page.getByRole('group', { name: 'Correct' }).getByRole('checkbox', { name: 'PPO' }).check();
  await page.getByRole('button', { name: 'Add question' }).click();
  await expect.poll(() => calls.find((c) => c.fn === 'save_item')?.args.p_scoring).toBe('on');
});

test('a fully anonymous survey cannot keep score, and says so', async ({ page }) => {
  await stub(page, { points: 'off', privacy: 'full' });
  await page.goto(`/sessions/${SESSION}`);
  await expect(page.getByRole('checkbox', { name: 'Keep score' })).toBeDisabled();
  await expect(page.getByText('Fully anonymous surveys can’t keep score.')).toBeVisible();
  await page.getByRole('button', { name: 'Add a question' }).click();
  await page.getByRole('button', { name: 'Multiple choice', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Keep score' })).toHaveCount(0);
});

test('results for a survey that keeps no score have no "who won"', async ({ page }) => {
  await page.route('**/rest/v1/rpc/**', (route) => {
    const url = route.request().url();
    const body = url.includes('session_results')
      ? { ok: true, title: 'Benefits', state: 'closed', mode: 'open', shared: false, privacy: 'room', keeps_score: false,
          items: [{ id: 'q1', position: 1, kind: 'choice', prompt: 'Which plan?',
                    chart: { type: 'bars', total: 3, bars: [{ label: 'PPO', count: 2, correct: true }, { label: 'HDHP', count: 1, correct: false }] } }] }
      : url.includes('session_scores') ? { ok: true, title: 'Benefits', standings: [], questions: [] } : {};
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.goto(`/scores/${SESSION}`);
  await expect(page.getByText('1 of 1')).toBeVisible();
  await page.getByRole('button', { name: 'Leave' }).click();
  await expect(page.getByRole('button', { name: 'Who won' })).toHaveCount(0);
});
