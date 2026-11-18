// Splitting the results by an answer: host and site admins only, a table per
// question with a row per group, and small groups said rather than shown.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './fixtures';

const SESSION = 'c27b8d31-5e4f-4a6b-9c7d-8e9f0a1b2c3d';
type Call = { fn: string; args: Record<string, unknown> };

const Q = [
  { id: 'q1', position: 1, prompt: 'Happy with the pay schedule?', kind: 'survey' },
  { id: 'q2', position: 2, prompt: 'Would you switch to twice a month?', kind: 'survey' },
  { id: 'q3', position: 3, prompt: 'Recommend us?', kind: 'nps' },
];

const SPLIT = {
  ok: true, privacy: 'room', min: 5, unlinked: 0, by: Q[0],
  groups: [
    { label: 'Yes', n: 10, hidden: null, questions: [
      { ...Q[1], answered: 10, cells: [{ label: 'Yes', count: 7 }, { label: 'No', count: 3 }] },
      { ...Q[2], answered: 5, cells: [{ label: 'Promoters (9-10)', count: 2 }, { label: 'Passives (7-8)', count: 1 },
                                     { label: 'Detractors (0-6)', count: 2 }] },
    ] },
    { label: 'Unsure', n: 6, hidden: null, questions: [
      { ...Q[1], answered: 6, cells: [{ label: 'Yes', count: 6 }, { label: 'No', count: 0 }] },
      { ...Q[2], answered: 0, cells: [{ label: 'Promoters (9-10)', count: 0 }, { label: 'Passives (7-8)', count: 0 },
                                     { label: 'Detractors (0-6)', count: 0 }] },
    ] },
    { label: 'No', n: 3, hidden: 'small', questions: null },
  ],
};

async function stub(page: import('@playwright/test').Page, host: boolean) {
  const calls: Call[] = [];
  await page.route('**/rest/v1/rpc/**', (route) => {
    const fn = route.request().url().match(/\/rpc\/(\w+)/)?.[1] ?? '';
    const args = JSON.parse(route.request().postData() ?? '{}');
    calls.push({ fn, args });
    const body =
      fn === 'session_results'
        ? { ok: true, title: 'Pulse', state: 'closed', mode: 'open', shared: true, privacy: 'room', keeps_score: false,
            items: [{ id: 'q1', position: 1, kind: 'survey', prompt: Q[0].prompt,
                      chart: { type: 'bars', total: 19, bars: [{ label: 'Yes', count: 10 }, { label: 'Unsure', count: 6 },
                                                                 { label: 'No', count: 3 }] } }] }
        : fn === 'session_scores' ? { ok: true, title: 'Pulse', standings: [], questions: [] }
        : fn === 'session_split'
          ? !host ? { ok: false, reason: 'only the host and site admins split the results' }
            : args.p_by ? SPLIT : { ok: true, questions: Q }
        : {};
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.goto(`/scores/${SESSION}`);
  await page.getByRole('button', { name: 'Leave' }).click();
  return calls;
}

test('the host splits by an answer: a row per group, a column per answer', async ({ page }) => {
  const calls = await stub(page, true);
  await page.getByRole('button', { name: 'Split by an answer' }).click();
  await expect(page.getByText('Only the host and site admins see this.')).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Split everybody by how they answered' })).toHaveValue('q1');
  await expect.poll(() => calls.find((c) => c.fn === 'session_split' && c.args.p_by)?.args.p_by).toBe('q1');

  const q2 = page.getByRole('table').first();
  const yes = q2.getByRole('row', { name: /^Yes/ });
  await expect(yes.getByRole('cell').nth(0)).toHaveText('770%');
  await expect(yes.getByRole('cell').nth(1)).toHaveText('330%');
  await expect(q2.getByRole('row', { name: /^No/ })).toContainText('Fewer than 5: not shown');
  await expect(q2.getByRole('row', { name: /^Unsure/ }).getByRole('cell').nth(0)).toHaveText('6100%');
  await expect(page.getByText(/the next smallest/)).toHaveCount(0);

  // the eNPS table has its score per group: 2 promoters less 2 detractors
  const nps = page.getByRole('table').nth(1);
  await expect(nps.getByRole('columnheader', { name: 'eNPS' })).toBeVisible();
  await expect(nps.getByRole('row', { name: /^Yes/ }).getByRole('cell').last()).toHaveText('0');

  await page.getByRole('combobox', { name: 'Split everybody by how they answered' }).selectOption('q3');
  await expect.poll(() => calls.filter((c) => c.fn === 'session_split' && c.args.p_by).map((c) => c.args.p_by))
    .toContain('q3');
});

test('anybody else gets no split at all', async ({ page }) => {
  await stub(page, false);
  await expect(page.getByRole('button', { name: 'How each question went' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Split by an answer' })).toHaveCount(0);
});

test('on a phone a wide table scrolls in its box, not the page, and it passes axe', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await stub(page, true);
  await page.getByRole('button', { name: 'Split by an answer' }).click();
  await expect(page.getByRole('table').first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations.map((v) => v.id)).toEqual([]);
});

function editorSheet(privacy: 'room' | 'full', answered: number, split?: { split_hide: boolean; split_min: number }) {
  return {
    ok: true,
    session: { id: SESSION, title: 'Pulse', state: 'live', late_join: 'open', current_item: null, code: null,
               mode: 'open', qa: false, shared: false, points: 'off', privacy, min_results: 5, show_comments: true,
               opens_at: null, closes_at: null, answered, ...split },
    kinds: [{ kind: 'survey', description: 'x', scored: false }],
    items: [],
  };
}

async function editor(page: import('@playwright/test').Page, sheet: ReturnType<typeof editorSheet>) {
  const calls: Call[] = [];
  await page.route('**/rest/v1/rpc/**', (route) => {
    const fn = route.request().url().match(/\/rpc\/(\w+)/)?.[1] ?? '';
    calls.push({ fn, args: JSON.parse(route.request().postData() ?? '{}') });
    const body = fn === 'session_sheet' ? sheet : fn === 'set_split_groups' ? { ok: true } : [];
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.goto(`/sessions/${SESSION}`);
  return calls;
}

test('an ordinary survey shows every group until the author holds small ones back', async ({ page }) => {
  const calls = await editor(page, editorSheet('room', 20));
  const hold = page.getByRole('checkbox', { name: /Hold back small groups/ });
  await expect(hold).not.toBeChecked();
  await hold.click();
  await expect.poll(() => calls.find((c) => c.fn === 'set_split_groups')?.args)
    .toMatchObject({ p_session: SESSION, p_hide: true, p_min: null });
});

test('the author sets the size, and an anonymous survey with answers can only go up', async ({ page }) => {
  const calls = await editor(page, editorSheet('full', 12, { split_hide: true, split_min: 5 }));
  const size = page.getByRole('textbox', { name: 'Smallest group shown when splitting results' });
  await expect(size).toHaveValue('5');
  await size.fill('3');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'can go up from 5 but not down' })).toBeVisible();
  await page.getByRole('checkbox', { name: /Hold back small groups/ }).click();
  await expect(page.getByRole('status').filter({ hasText: 'so this stays on' })).toBeVisible();
  expect(calls.some((c) => c.fn === 'set_split_groups')).toBe(false);

  await size.fill('8');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect.poll(() => calls.find((c) => c.fn === 'set_split_groups')?.args)
    .toMatchObject({ p_hide: null, p_min: 8 });
});

test('a fully anonymous survey never shows a group of one or two, even before anyone answers', async ({ page }) => {
  const calls = await editor(page, editorSheet('full', 0, { split_hide: true, split_min: 3 }));
  await expect(page.getByRole('checkbox', { name: /Hold back small groups/ })).toBeChecked();
  const size = page.getByRole('textbox', { name: 'Smallest group shown when splitting results' });
  await expect(size).toHaveValue('3');
  await size.fill('2');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'At least 3 in a fully anonymous survey' })).toBeVisible();
  await page.getByRole('checkbox', { name: /Hold back small groups/ }).click();
  await expect(page.getByRole('status').filter({ hasText: 'always holds back groups of one or two' })).toBeVisible();
  expect(calls.some((c) => c.fn === 'set_split_groups')).toBe(false);
});
