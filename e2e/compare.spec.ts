// A comparison, answered on your own time: the table, DIFFERS where the
// options are not the same, nothing sent until Next, and Back to change it.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './fixtures';

const SESSION = '6a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';

const PAY = {
  helper: 'Compare the two side by side.',
  options: [
    { id: 'a', name: 'Bi-weekly', subtitle: 'Every other Friday' },
    { id: 'b', name: 'Semi-monthly', subtitle: 'Twice a month' },
  ],
  rows: [
    { id: 'r1', label: 'Paychecks a year', kind: 'text', values: { a: '26', b: '24' }, differs: 'auto' },
    { id: 'r2', label: 'Your pay for the year', kind: 'text', values: { a: 'Same', b: 'Same' } },
    {
      id: 'r3', label: 'Paydays across a year', kind: 'months',
      values: { a: [2, 2, 3, 2, 2, 2, 2, 3, 2, 2, 2, 2], b: [2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2] },
      note: 'Which months get 3 depends on the first payday.',
    },
  ],
  allowNoPreference: true,
  askWhy: true,
  markDifferences: true,
  shuffleOptions: false,
};

type Sent = Record<string, unknown>;

/** Two comparisons and a choice question, played on your own time, with a
 *  server that remembers what was answered. */
async function survey(page: import('@playwright/test').Page) {
  const answers: Record<string, unknown> = {};
  const sent: Sent[] = [];
  const items = [
    { id: 'q1', position: 1, kind: 'compare', prompt: 'Which pay schedule would you prefer?', payload: PAY },
    { id: 'q2', position: 2, kind: 'compare', prompt: 'Which payday?', payload: { ...PAY, helper: undefined } },
    { id: 'q3', position: 3, kind: 'choice', prompt: 'Anything else?', payload: { options: ['Yes', 'No'] } },
  ];
  const served = (it: (typeof items)[number], extra: Record<string, unknown> = {}) => ({
    state: 'open', mode: 'open', yours: false, ...it, opened_at: new Date().toISOString(), seconds: null,
    now: new Date().toISOString(), mine: answers[it.id] ?? null, answer: null, total: 3,
    done: Object.keys(answers).length, ...extra,
  });
  await page.route('**/rest/v1/rpc/**', (route) => {
    const url = route.request().url();
    const args = JSON.parse(route.request().postData() ?? '{}');
    let body: unknown = {};
    if (url.includes('answer_item')) {
      sent.push(args);
      answers[args.p_item] = args.p_value;
      body = { ok: true, answer: null };
    } else if (url.includes('current_item')) {
      const next = items.find((i) => !(i.id in answers));
      body = next ? served(next) : { state: 'done', mode: 'open', total: 3 };
    } else if (url.includes('compare_trail')) {
      body = items.filter((i) => i.kind === 'compare' && i.id in answers).map((i) => ({ id: i.id, position: i.position }));
    } else if (url.includes('revisit_item')) {
      const it = items.find((i) => i.id === args.p_item)!;
      body = served(it, { revisit: true, number: it.position });
    } else if (url.includes('my_standing')) {
      body = { ok: true, points: 0, scored: 0 };
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  return { sent, answers };
}

test('the table says which rows differ, in words', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await survey(page);
  await page.goto(`/live/${SESSION}`);
  const table = page.getByRole('table');
  await expect(table.getByRole('columnheader', { name: /Option A\s*Bi-weekly/ })).toBeVisible();
  await expect(table.getByRole('rowheader', { name: /Paychecks a year\s*Differs/ })).toBeVisible();
  await expect(table.getByRole('rowheader', { name: 'Your pay for the year', exact: true })).toBeVisible();
  // the year of paydays is a picture, and says what it shows
  await expect(table.getByRole('img', { name: /^Bi-weekly: 2 in January, 2 in February, 3 in March/ })).toBeVisible();
  await expect(page.getByText('Compare the two side by side.')).toBeVisible();
});

test('nothing is sent until Next, and Next says what is missing', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const { sent } = await survey(page);
  await page.goto(`/live/${SESSION}`);
  await page.getByRole('button', { name: /Next question/ }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Pick one' })).toHaveText('Pick one of the options, or No preference.');
  expect(sent).toHaveLength(0);

  await page.getByRole('button', { name: 'I prefer this: Semi-monthly' }).click();
  await expect(page.getByRole('button', { name: /I prefer this: Semi-monthly/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('columnheader', { name: /Semi-monthly/ })).toHaveClass(/border-accent/);
  expect(sent, 'a pick on your own time waits for Next').toHaveLength(0);

  await page.getByRole('textbox', { name: /Why\?/ }).fill('Rent is due on the first');
  await page.getByRole('button', { name: /Next question/ }).click();
  await expect.poll(() => sent[0]).toEqual({
    p_item: 'q1', p_value: { pick: 'b', why: 'Rent is due on the first' }, p_anonymous: false,
  });
  await expect(page.getByRole('heading', { name: 'Which payday?' })).toBeVisible();
});

test('Back returns to what you said, and it can be changed', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const { sent } = await survey(page);
  await page.goto(`/live/${SESSION}`);
  await page.getByRole('button', { name: 'No preference' }).click();
  await page.getByRole('button', { name: /Next question/ }).click();
  await expect(page.getByRole('heading', { name: 'Which payday?' })).toBeVisible();

  await page.getByRole('button', { name: '← Back' }).click();
  await expect(page.getByRole('heading', { name: 'Which pay schedule would you prefer?' })).toBeVisible();
  await expect(page.getByText('Question 1 of 3')).toBeVisible();
  await expect(page.getByRole('button', { name: /No preference/ })).toHaveAttribute('aria-pressed', 'true');

  await page.getByRole('button', { name: 'I prefer this: Bi-weekly' }).click();
  await page.getByRole('button', { name: /Next question/ }).click();
  await expect.poll(() => sent.map((s) => (s.p_value as { pick: string }).pick)).toEqual(['none', 'a']);
  await expect(page.getByRole('heading', { name: 'Which payday?' })).toBeVisible();
});

test('on a phone the rows stack, the names stay up and the picks stay down', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await survey(page);
  await page.goto(`/live/${SESSION}`);
  await expect(page.getByRole('table')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Semi-monthly', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Semi-monthly', exact: true }).click();
  await expect(page.getByRole('button', { name: '✓ Semi-monthly' })).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

for (const [name, width] of [['desktop', 1280], ['phone', 390]] as const) {
  test(`a comparison passes axe on a ${name}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await survey(page);
    await page.goto(`/live/${SESSION}`);
    await expect(page.getByRole('heading', { name: 'Which pay schedule would you prefer?' })).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(', ')}`)).toEqual([]);
  });
}

test('an author builds one in the grid, and it saves as the table it shows', async ({ page }) => {
  const saved: Record<string, unknown>[] = [];
  const sheet = {
    ok: true,
    session: { id: SESSION, title: 'Pay schedule', state: 'draft', late_join: 'strict', current_item: null,
               code: null, mode: 'open', qa: false, shared: false },
    kinds: [
      { kind: 'choice', description: 'x', scored: true },
      { kind: 'compare', description: 'x', scored: false },
    ],
    items: [],
  };
  await page.route('**/rest/v1/rpc/**', (route) => {
    const url = route.request().url();
    if (url.includes('save_item')) saved.push(JSON.parse(route.request().postData() ?? '{}'));
    const body = url.includes('save_item') ? { ok: true, id: 'new' } : url.includes('session_sheet') ? sheet : [];
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.goto(`/sessions/${SESSION}`);
  await page.getByRole('button', { name: 'Add a question' }).click();
  await page.getByRole('button', { name: 'Compare', exact: true }).click();
  await page.getByRole('textbox', { name: 'Question' }).fill('Which pay schedule would you prefer?');
  // nothing about points or a clock: a comparison has neither
  await expect(page.getByRole('textbox', { name: 'Points' })).toHaveCount(0);

  await page.getByRole('textbox', { name: 'Option 1 name' }).fill('Bi-weekly');
  await page.getByRole('textbox', { name: 'Option 2 name' }).fill('Semi-monthly');
  await page.getByRole('textbox', { name: 'Row 1 label' }).fill('Paychecks a year');
  await page.getByRole('textbox', { name: 'Paychecks a year, Bi-weekly' }).fill('26');
  await page.getByRole('textbox', { name: 'Paychecks a year, Semi-monthly' }).fill('24');
  // worked out from the values, the way the question will show it
  await expect(page.getByRole('button', { name: /^differs/ })).toBeVisible();

  await page.getByRole('button', { name: 'Add question' }).click();
  await expect.poll(() => saved.length).toBe(1);
  expect(saved[0]).toMatchObject({
    p_kind: 'compare',
    p_prompt: 'Which pay schedule would you prefer?',
    p_payload: {
      options: [{ id: 'a', name: 'Bi-weekly' }, { id: 'b', name: 'Semi-monthly' }],
      rows: [{ id: 'r1', label: 'Paychecks a year', kind: 'text', values: { a: '26', b: '24' } }],
      allowNoPreference: true,
      askWhy: true,
      markDifferences: true,
      shuffleOptions: false,
    },
    p_answer: null,
  });
});

async function compareEditor(page: import('@playwright/test').Page) {
  const saved: Record<string, unknown>[] = [];
  const sheet = {
    ok: true,
    session: { id: SESSION, title: 'Pay schedule', state: 'draft', late_join: 'strict', current_item: null,
               code: null, mode: 'open', qa: false, shared: false, points: 'off' },
    kinds: [{ kind: 'compare', description: 'x', scored: false }],
    items: [],
  };
  await page.route('**/rest/v1/rpc/**', (route) => {
    const url = route.request().url();
    if (url.includes('save_item')) saved.push(JSON.parse(route.request().postData() ?? '{}'));
    const body = url.includes('save_item') ? { ok: true, id: 'new' } : url.includes('session_sheet') ? sheet : [];
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.goto(`/sessions/${SESSION}`);
  await page.getByRole('button', { name: 'Add a question' }).click();
  await page.getByRole('button', { name: 'Compare', exact: true }).click();
  await page.getByRole('textbox', { name: 'Question' }).fill('Which pay schedule would you prefer?');
  return saved;
}

test('a table pasted from a spreadsheet becomes the options and rows', async ({ page }) => {
  const saved = await compareEditor(page);
  await page.getByRole('button', { name: 'Paste from a spreadsheet' }).click();
  const box = page.getByRole('textbox', { name: /Copy the table from your spreadsheet/ });
  await box.fill('Bi-weekly, Semi-monthly' + String.fromCharCode(10) + '26, 24');
  await page.getByRole('button', { name: 'Use this table' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'tabs' }))
    .toHaveText('Cells need tabs between them: copy them straight from the spreadsheet.');

  await box.fill('\tBi-weekly\tSemi-monthly\nPaychecks a year\t26\t24\nWhen you are paid\tEvery other Friday\tTwice a month');
  await page.getByRole('button', { name: 'Use this table' }).click();
  await expect(page.getByRole('textbox', { name: 'Option 2 name' })).toHaveValue('Semi-monthly');
  await expect(page.getByRole('textbox', { name: 'When you are paid, Semi-monthly' })).toHaveValue('Twice a month');

  await page.getByRole('button', { name: 'Add question' }).click();
  await expect.poll(() => saved.length).toBe(1);
  expect((saved[0].p_payload as { rows: unknown[] }).rows).toHaveLength(2);
});

test('options move left and right, rows up and down, and save in that order', async ({ page }) => {
  const saved = await compareEditor(page);
  await page.getByRole('button', { name: 'Paste from a spreadsheet' }).click();
  await page.getByRole('textbox', { name: /Copy the table from your spreadsheet/ })
    .fill('\tBi-weekly\tSemi-monthly\nPaychecks a year\t26\t24\nWhen you are paid\tFridays\tThe 15th');
  await page.getByRole('button', { name: 'Use this table' }).click();

  // the first option cannot go further left, and the last row no further down
  await expect(page.getByRole('button', { name: 'Move Bi-weekly left' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Move When you are paid down' })).toBeDisabled();

  await page.getByRole('button', { name: 'Move Bi-weekly right' }).click();
  await expect(page.getByRole('textbox', { name: 'Option 1 name' })).toHaveValue('Semi-monthly');
  // the column moves with it
  await expect(page.getByRole('textbox', { name: 'Paychecks a year, Semi-monthly' })).toHaveValue('24');
  await page.getByRole('button', { name: 'Move When you are paid up' }).click();
  await expect(page.getByRole('textbox', { name: 'Row 1 label' })).toHaveValue('When you are paid');

  await page.getByRole('button', { name: 'Add question' }).click();
  await expect.poll(() => saved.length).toBe(1);
  const p = saved[0].p_payload as { options: { name: string }[]; rows: { label: string }[] };
  expect(p.options.map((o) => o.name)).toEqual(['Semi-monthly', 'Bi-weekly']);
  expect(p.rows.map((r) => r.label)).toEqual(['When you are paid', 'Paychecks a year']);
});

test('a picture row asks for a picture for each option before it can be saved', async ({ page }) => {
  await compareEditor(page);
  await page.getByRole('textbox', { name: 'Option 1 name' }).fill('Plan A');
  await page.getByRole('textbox', { name: 'Option 2 name' }).fill('Plan B');
  await page.getByRole('textbox', { name: 'Row 1 label' }).fill('Monthly cost');
  await page.getByRole('textbox', { name: 'Monthly cost, Plan A' }).fill('$80');
  await page.getByRole('textbox', { name: 'Monthly cost, Plan B' }).fill('$120');
  await page.getByRole('button', { name: 'Picture row' }).click();
  await page.getByRole('textbox', { name: 'Row 2 label' }).fill('Card');
  await expect(page.getByText('Choose a picture')).toHaveCount(2);
  await expect(page.getByText('Row "Card" needs a picture for each option.')).toBeVisible();
});
