// Fully anonymous surveys, from the browser's side: answers go by this
// browser's key and never through answer_item, the same key every time, no
// "hide my name" to choose, and plain words when the key is gone. The server's
// side -- what is stored and what is refused -- is supabase/tests/anonymous.sql.
import { expect, test } from './fixtures';

const SESSION = '7b2c3d4e-5f60-4a7b-8c9d-0e1f2a3b4c5d';

const PAY = {
  options: [{ id: 'a', name: 'Bi-weekly' }, { id: 'b', name: 'Semi-monthly' }],
  rows: [{ id: 'r1', label: 'Paychecks a year', kind: 'text', values: { a: '26', b: '24' } }],
  allowNoPreference: true, askWhy: true, markDifferences: true, shuffleOptions: false,
};

type Call = { fn: string; args: Record<string, unknown> };

async function anonymousSurvey(page: import('@playwright/test').Page, opts: { keyLost?: boolean } = {}) {
  const calls: Call[] = [];
  const answered = new Set<string>();
  const items = [
    { id: 'q1', position: 1, kind: 'compare', prompt: 'Which pay schedule would you prefer?', payload: PAY },
    { id: 'q2', position: 2, kind: 'open', prompt: 'Anything else?', payload: {} },
  ];
  await page.route('**/rest/v1/rpc/**', (route) => {
    const fn = route.request().url().match(/\/rpc\/(\w+)/)?.[1] ?? '';
    const args = JSON.parse(route.request().postData() ?? '{}');
    calls.push({ fn, args });
    let body: unknown = {};
    if (fn === 'current_item') {
      const next = items.find((i) => !answered.has(i.id));
      body = opts.keyLost
        ? { state: 'done', mode: 'open', privacy: 'full', key_lost: true, total: 2 }
        : next
          ? { state: 'open', mode: 'open', privacy: 'full', yours: false, ...next, seconds: null, opened_at: null,
              now: new Date().toISOString(), mine: null, answer: null, paused: false, total: 2, done: answered.size }
          : { state: 'done', mode: 'open', privacy: 'full', total: 2 };
    } else if (fn === 'answer_anonymously') {
      answered.add(args.p_item as string);
      body = { ok: true, answer: null };
    } else if (fn === 'compare_trail') {
      body = [];
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  return calls;
}

test("answers go by this browser's key, the same key each time, and never beside a name", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const calls = await anonymousSurvey(page);
  await page.goto(`/live/${SESSION}`);
  await expect(page.getByText('Optional, also anonymous')).toBeVisible();
  // no clocks to pause between
  await expect(page.getByRole('button', { name: /Pause after this question/ })).toHaveCount(0);

  await page.getByRole('button', { name: 'I prefer this: Semi-monthly' }).click();
  await page.getByRole('button', { name: /Next question/ }).click();
  await expect(page.getByRole('heading', { name: 'Anything else?' })).toBeVisible();

  // an open question has no "don't show my name" to tick: nothing carries one
  await expect(page.getByRole('checkbox', { name: /Don.t show my name/ })).toHaveCount(0);
  await expect(page.getByText(/Sent without your name/)).toBeVisible();
  await page.getByRole('textbox').fill('More notice before a change, please.');
  await page.getByRole('button', { name: 'Send' }).click();

  await expect.poll(() => calls.filter((c) => c.fn === 'answer_anonymously').length).toBe(2);
  const sent = calls.filter((c) => c.fn === 'answer_anonymously');
  const key = sent[0].args.p_key as string;
  expect(key).toMatch(/^[0-9a-f]{64}$/);
  expect(sent[1].args.p_key, 'one browser, one key').toBe(key);
  expect(sent[0].args.p_value).toEqual({ pick: 'b', why: null });
  expect(calls.some((c) => c.fn === 'answer_item'), 'answer_item carries a name').toBe(false);
  // and the question after the first answer was asked for with it
  expect(calls.filter((c) => c.fn === 'current_item').some((c) => c.args.p_key === key)).toBe(true);
});

test('a browser without the key says the answers stand, rather than offering questions', async ({ page }) => {
  await anonymousSurvey(page, { keyLost: true });
  await page.goto(`/live/${SESSION}`);
  await expect(page.getByText('Your answers are in.')).toBeVisible();
  await expect(page.getByText(/They still count/)).toBeVisible();
  await expect(page.getByRole('button', { name: /I prefer this/ })).toHaveCount(0);
});

test('the results say what kind of survey it was, and hold back what a small count would give away', async ({ page }) => {
  await page.route('**/rest/v1/rpc/**', (route) => {
    const url = route.request().url();
    const body = url.includes('session_results')
      ? { ok: true, title: 'Pay schedule', state: 'live', mode: 'open', shared: false, privacy: 'full', min_results: 5,
          answered: 3, items: [{ id: 'q1', position: 1, kind: 'compare', prompt: 'Which pay schedule would you prefer?',
            chart: { type: 'hidden', total: 3, answered: 3, needed: 5 } }] }
      : url.includes('session_scores') ? { ok: true, title: 'Pay schedule', standings: [], scored: 0 } : {};
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.goto(`/scores/${SESSION}`);
  // one at a time first, as it opens: said there too, and no "who won" slide
  await expect(page.getByText(/Fully anonymous survey\. Counts only, no names\./)).toBeVisible();
  await expect(page.getByText(/Results show once 5 people have answered/)).toBeVisible();
  await expect(page.getByText('1 of 1')).toBeVisible();
  await page.getByRole('button', { name: 'Leave' }).click();
  await expect(page.getByText(/Fully anonymous survey\. These are counts only/)).toBeVisible();
  await expect(page.getByText(/no export with names, for anyone/)).toBeVisible();
  // nobody is scored, so nobody won
  await expect(page.getByRole('button', { name: 'Who won' })).toHaveCount(0);
  await expect(page.getByText(/Results show once 5 people have answered/)).toBeVisible();
  await expect(page.getByText(/3 so far/)).toBeVisible();
});

async function editor(page: import('@playwright/test').Page, session: Record<string, unknown>) {
  const calls: Call[] = [];
  const sheet = {
    ok: true,
    session: { id: SESSION, title: 'Pay schedule', state: 'draft', late_join: 'strict', current_item: null,
               code: null, mode: 'open', qa: true, shared: false, avatars: 'off', privacy: 'room', min_results: 5,
               show_comments: true, answered: 0, attached: false, ...session },
    kinds: [{ kind: 'compare', description: 'x', scored: false }],
    items: [],
  };
  await page.route('**/rest/v1/rpc/**', (route) => {
    const fn = route.request().url().match(/\/rpc\/(\w+)/)?.[1] ?? '';
    calls.push({ fn, args: JSON.parse(route.request().postData() ?? '{}') });
    const body = fn === 'session_sheet' ? sheet : fn === 'set_session_privacy' ? { ok: true } : [];
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.goto(`/sessions/${SESSION}`);
  await expect(page.getByRole('heading', { name: 'Pay schedule' })).toBeVisible();
  return calls;
}

test('the author makes a survey fully anonymous before anybody answers', async ({ page }) => {
  const calls = await editor(page, {});
  const card = page.getByRole('region', { name: 'Survey privacy' });
  // clicked rather than checked: the server's answer is what moves it
  await card.getByRole('radio', { name: /Fully anonymous/ }).click();
  await expect.poll(() => calls.find((c) => c.fn === 'set_session_privacy')?.args).toMatchObject({
    p_session: SESSION, p_privacy: 'full',
  });
  await expect(card.getByText("Can't be switched once anyone answers.")).toBeVisible();
});

test('and it is fixed once people have, with the minimum able to go up but not down', async ({ page }) => {
  const calls = await editor(page, { privacy: 'full', answered: 4, qa: false });
  const card = page.getByRole('region', { name: 'Survey privacy' });
  await expect(card.getByText('People have answered, so this can no longer change.')).toBeVisible();
  await expect(card.getByRole('radio', { name: /Anonymous to other participants/ })).toBeDisabled();
  // the room's questions and the avatars carry names, so they are off and say why
  await expect(page.getByRole('checkbox', { name: /Let the room ask questions/ })).toBeDisabled();
  await expect(page.getByText(/an avatar on an answer is a name on it/)).toBeVisible();

  const min = card.getByRole('textbox', { name: 'Answers needed before results show' });
  await min.fill('3');
  await card.getByRole('button', { name: 'Save' }).click();
  await expect(card.getByRole('status')).toHaveText('At least 5, so a small count cannot point to anybody.');
  await min.fill('8');
  await card.getByRole('button', { name: 'Save' }).click();
  await expect.poll(() => calls.find((c) => c.fn === 'set_session_privacy')?.args).toMatchObject({ p_min_results: 8 });
});
