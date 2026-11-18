// eNPS: 0 to 10, an optional reason, and the score in the results.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './fixtures';

const SESSION = 'a05f6071-8293-4dae-9f10-3b4c5d6e7f80';
type Call = { fn: string; args: Record<string, unknown> };

async function pulse(page: import('@playwright/test').Page) {
  const calls: Call[] = [];
  let answered = false;
  await page.route('**/rest/v1/rpc/**', (route) => {
    const fn = route.request().url().match(/\/rpc\/(\w+)/)?.[1] ?? '';
    const args = JSON.parse(route.request().postData() ?? '{}');
    calls.push({ fn, args });
    if (fn === 'answer_item') answered = true;
    const body =
      fn === 'current_item'
        ? answered
          ? { state: 'done', mode: 'open', total: 1 }
          : { state: 'open', mode: 'open', yours: false, id: 'q1', position: 1, kind: 'nps',
              prompt: 'How likely are you to recommend working here to a friend?',
              payload: { lowLabel: 'Not at all likely', highLabel: 'Extremely likely', askWhy: true },
              seconds: null, opened_at: new Date().toISOString(), now: new Date().toISOString(),
              mine: null, answer: null, total: 1, done: 0 }
        : fn === 'answer_item' ? { ok: true, answer: null }
        : {};
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.goto(`/live/${SESSION}`);
  return calls;
}

test('a score from 0 to 10, the ends labelled, and Send says what is missing', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 800 });
  const calls = await pulse(page);
  const scale = page.getByRole('group', { name: /How likely are you to recommend/ });
  await expect(scale.getByRole('button')).toHaveCount(11);
  await expect(scale.getByRole('button', { name: '0, Not at all likely' })).toBeVisible();
  await expect(scale.getByRole('button', { name: '10, Extremely likely' })).toBeVisible();

  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Pick' })).toHaveText('Pick a number from 0 to 10.');
  expect(calls.some((c) => c.fn === 'answer_item')).toBe(false);

  await scale.getByRole('button', { name: '8', exact: true }).click();
  await expect(scale.getByRole('button', { name: '8', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('textbox', { name: /Why\?/ }).fill('Good team, long hours');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect.poll(() => calls.find((c) => c.fn === 'answer_item')?.args.p_value)
    .toEqual({ score: 8, why: 'Good team, long hours' });
});

test('on a phone the scale wraps rather than shrinking past a finger', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await pulse(page);
  const zero = page.getByRole('button', { name: '0, Not at all likely' });
  const box = await zero.boundingBox();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations.map((v) => v.id)).toEqual([]);
});

test('the results give the score, the three groups and the reasons by group', async ({ page }) => {
  await page.route('**/rest/v1/rpc/**', (route) => {
    const url = route.request().url();
    const body = url.includes('session_results')
      ? { ok: true, title: 'Pulse', state: 'closed', mode: 'open', shared: false, privacy: 'room', keeps_score: false,
          items: [{ id: 'q1', position: 1, kind: 'nps', prompt: 'How likely are you to recommend working here?',
            chart: { type: 'nps', total: 10, counts: [1, 0, 0, 1, 0, 1, 1, 1, 1, 2, 2], promoters: 4, passives: 2,
                     detractors: 4, score: 0,
                     comments: [{ pick: 'Promoter', text: 'Good people' }, { pick: 'Detractor', text: 'Too much on call' }] } }] }
      : url.includes('session_scores') ? { ok: true, title: 'Pulse', standings: [], questions: [] } : {};
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.goto(`/scores/${SESSION}`);
  await page.getByRole('button', { name: 'Leave' }).click();
  await expect(page.getByText('eNPS 0')).toBeVisible();
  await expect(page.getByText(/Promoters \(9–10\)\s*40%/)).toBeVisible();
  await expect(page.getByText(/Detractors \(0–6\)\s*40%/)).toBeVisible();
  await expect(page.getByRole('img', { name: /^Scores: 0: 1, 1: 0/ })).toBeVisible();
  await expect(page.getByText('“Too much on call”')).toBeVisible();
});

test('the author picks eNPS and words for its ends', async ({ page }) => {
  const calls: Call[] = [];
  const sheet = {
    ok: true,
    session: { id: SESSION, title: 'Pulse', state: 'draft', late_join: 'strict', current_item: null,
               code: null, mode: 'open', qa: false, shared: false, points: 'off' },
    kinds: [{ kind: 'nps', description: 'x', scored: false }],
    items: [],
  };
  await page.route('**/rest/v1/rpc/**', (route) => {
    const fn = route.request().url().match(/\/rpc\/(\w+)/)?.[1] ?? '';
    calls.push({ fn, args: JSON.parse(route.request().postData() ?? '{}') });
    const body = fn === 'session_sheet' ? sheet : fn === 'save_item' ? { ok: true, id: 'i1' } : [];
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.goto(`/sessions/${SESSION}`);
  await page.getByRole('button', { name: 'Add a question' }).click();
  await page.getByRole('button', { name: 'eNPS', exact: true }).click();
  await page.getByRole('textbox', { name: 'Question' }).fill('How likely are you to recommend working here to a friend?');
  await page.getByRole('textbox', { name: 'Words under 10' }).fill('Very likely');
  await page.getByRole('button', { name: 'Add question' }).click();
  await expect.poll(() => calls.find((c) => c.fn === 'save_item')?.args).toMatchObject({
    p_kind: 'nps',
    p_payload: { lowLabel: 'Not at all likely', highLabel: 'Very likely', askWhy: true },
  });
});
