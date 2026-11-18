// Previewing a session before it opens: the real question screens, and
// nothing sent.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './fixtures';

const SESSION = 'b16a7c20-4d3e-4f5a-8b6c-7d8e9f0a1b2c';
type Call = { fn: string; args: Record<string, unknown> };

function sheet(privacy: 'room' | 'full') {
  return {
    ok: true,
    session: { id: SESSION, title: 'Pay schedule', state: 'draft', late_join: 'open', current_item: null,
               code: null, mode: 'open', qa: false, shared: false, points: 'off', privacy,
               min_results: 5, show_comments: true, opens_at: null, closes_at: null },
    kinds: [{ kind: 'survey', description: 'x', scored: false }, { kind: 'nps', description: 'x', scored: false },
            { kind: 'open', description: 'x', scored: false }],
    items: [
      { id: 'i1', position: 1, kind: 'survey', prompt: 'Which pay schedule suits you?', state: 'pending',
        payload: { options: ['Every two weeks', 'Twice a month'] }, answer: null, responses: 0 },
      { id: 'i2', position: 2, kind: 'nps', prompt: 'How likely are you to recommend working here?', state: 'pending',
        payload: { lowLabel: 'Not at all likely', highLabel: 'Extremely likely', askWhy: true }, answer: null, responses: 0 },
      { id: 'i3', position: 3, kind: 'open', prompt: 'Anything else?', state: 'pending',
        payload: { private: true }, answer: null, responses: 0 },
    ],
  };
}

async function stub(page: import('@playwright/test').Page, privacy: 'room' | 'full' = 'room') {
  const calls: Call[] = [];
  await page.route('**/rest/v1/rpc/**', (route) => {
    const fn = route.request().url().match(/\/rpc\/(\w+)/)?.[1] ?? '';
    calls.push({ fn, args: JSON.parse(route.request().postData() ?? '{}') });
    const body = fn === 'session_sheet' ? sheet(privacy) : fn === 'my_sessions' ? [] : {};
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  return calls;
}

const SENT = /^(answer_|advance_session|begin_playing|current_item|save_item)/;

test('the editor has a Preview, and it goes to the questions rather than a waiting screen', async ({ page }) => {
  await stub(page);
  await page.goto(`/sessions/${SESSION}`);
  await page.getByRole('link', { name: 'Preview' }).click();
  await expect(page).toHaveURL(new RegExp(`/sessions/${SESSION}/preview$`));
  await expect(page.getByRole('heading', { name: 'Preview' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Which pay schedule suits you?' })).toBeVisible();
});

test('answering steps through every question and sends nothing', async ({ page }) => {
  const calls = await stub(page);
  await page.goto(`/sessions/${SESSION}/preview`);
  await expect(page.getByRole('note')).toContainText('nothing you pick here is sent or counted');
  await expect(page.getByText(/Question 1 of 3/)).toBeVisible();

  await page.getByRole('button', { name: 'Twice a month' }).click();
  await expect(page.getByText(/Question 2 of 3/)).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'would have been sent' }))
    .toHaveText('Question 1 would have been sent. Nothing was.');

  await page.getByRole('button', { name: '9', exact: true }).click();
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByText(/Question 3 of 3/)).toBeVisible();

  // back a step, and forward again without answering
  await page.getByRole('button', { name: '← Previous' }).click();
  await expect(page.getByText(/Question 2 of 3/)).toBeVisible();
  await page.getByRole('button', { name: 'Skip →' }).click();

  await page.getByRole('textbox', { name: 'Your answer' }).fill('More notice of schedule changes');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByText('That was the last question.')).toBeVisible();
  await page.getByRole('button', { name: 'Start again' }).click();
  await expect(page.getByText(/Question 1 of 3/)).toBeVisible();

  expect(calls.filter((c) => SENT.test(c.fn)).map((c) => c.fn)).toEqual([]);
});

test('a fully anonymous survey previews with its banner, and fits a phone', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await stub(page, 'full');
  await page.goto(`/sessions/${SESSION}/preview`);
  await expect(page.getByRole('region', { name: 'Fully anonymous' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Which pay schedule suits you?' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations.map((v) => v.id)).toEqual([]);
});
