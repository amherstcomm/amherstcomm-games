// The whiteboard, as somebody answering and as whoever writes the questions.
//
// The server decides who sees the board (whiteboard.sql). What the page owes:
// to ask before it shows, to show faces under each choice or beside each
// written answer once it may, to let an answer be changed, to take a
// suggestion, and to give the writer a way to write and schedule them.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './fixtures';

type Sent = { fn: string; args: Record<string, unknown> };

async function signedIn(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    localStorage.setItem('sb-stub-auth-token', JSON.stringify({
      access_token: 'test', refresh_token: 'test', token_type: 'bearer', expires_in: 3600, expires_at: exp,
      user: { id: 'u-me', aud: 'authenticated', role: 'authenticated', email: 'me@example.net',
              app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' },
    }));
  });
}

async function server(page: import('@playwright/test').Page, answers: Record<string, (args: Record<string, unknown>) => unknown>) {
  const sent: Sent[] = [];
  await page.route('**/rest/v1/rpc/**', (route) => {
    const fn = route.request().url().match(/\/rpc\/(\w+)/)?.[1] ?? '';
    const args = JSON.parse(route.request().postData() ?? '{}');
    sent.push({ fn, args });
    if (fn in answers) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(answers[fn](args)) });
    }
    return route.fallback();
  });
  return sent;
}

const WEEK = '2026-11-16';
const LAUNDRY = {
  id: 'q-laundry', prompt: 'Do you sort your laundry?', kind: 'choice',
  options: ['Always', 'Sometimes', 'Never'], week_of: WEEK, state: 'open', ends_at: '2026-11-23T06:00:00Z',
};
const PEOPLE = [
  { user: 'u-ann', name: 'Ann Lee', avatar: null, choice: 0, body: null },
  { user: 'u-bo', name: 'Bo Jensen', avatar: { kind: 'preset', value: 'cat', color: '#2b6cb0' }, choice: 2, body: null },
  { user: 'u-cy', name: 'Cy Ortiz', avatar: null, choice: 0, body: null },
];
const PAST = [{ id: 'q-pets', prompt: 'Cats or dogs?', week_of: '2026-11-09', answers: 14 }];

test('before answering: the question and how many, and no faces', async ({ page }) => {
  await signedIn(page);
  await server(page, {
    whiteboard_view: () => ({ ok: true, can_manage: false, week_of: WEEK, question: LAUNDRY, count: 3,
                              mine: null, answers: null, past: PAST }),
  });
  await page.goto('/whiteboard');
  await expect(page.getByRole('heading', { name: 'Do you sort your laundry?' })).toBeVisible();
  await expect(page.getByText('3 people have answered. Answer to see who said what.')).toBeVisible();
  await expect(page.getByText('Ann Lee')).toHaveCount(0);
  await expect(page.getByRole('link', { name: /Cats or dogs\?/ })).toHaveAttribute('href', '/whiteboard/q-pets');
});

test('picking an answer shows everybody, grouped under what they picked', async ({ page }) => {
  await signedIn(page);
  let mine: { choice: number; body: null } | null = null;
  const sent = await server(page, {
    whiteboard_view: () => ({
      ok: true, can_manage: false, week_of: WEEK, question: LAUNDRY,
      count: mine ? 4 : 3, mine,
      answers: mine ? [...PEOPLE, { user: 'u-me', name: 'Me Myself', avatar: null, choice: mine.choice, body: null }] : null,
      past: [],
    }),
    answer_whiteboard: (args) => {
      mine = { choice: args.p_choice as number, body: null };
      return { ok: true };
    },
  });
  await page.goto('/whiteboard');
  await page.getByRole('button', { name: 'Sometimes' }).click();
  await expect.poll(() => sent.find((s) => s.fn === 'answer_whiteboard')?.args).toEqual({
    p_question: 'q-laundry', p_choice: 1, p_body: null,
  });
  await expect(page.getByText('You said: Sometimes')).toBeVisible();
  await expect(page.getByRole('listitem', { name: 'Always: 2' })).toContainText('Ann Lee');
  await expect(page.getByRole('listitem', { name: 'Always: 2' })).toContainText('Cy Ortiz');
  await expect(page.getByRole('listitem', { name: 'Never: 1' })).toContainText('Bo Jensen');
  await expect(page.getByRole('listitem', { name: 'Sometimes: 1' })).toContainText('Me Myself');
  // nobody else's answer is anybody's to take down
  await expect(page.getByRole('button', { name: /answer down/ })).toHaveCount(0);

  await page.getByRole('button', { name: 'Change my answer' }).click();
  await expect(page.getByRole('button', { name: 'Sometimes' })).toHaveAttribute('aria-pressed', 'true');
});

test('a written question puts each face beside what they wrote', async ({ page }) => {
  await signedIn(page);
  const sent = await server(page, {
    whiteboard_view: () => ({
      ok: true, can_manage: false, week_of: WEEK,
      question: { ...LAUNDRY, id: 'q-weekend', kind: 'text', options: [], prompt: 'Best thing you did this weekend?' },
      count: 0, mine: null, answers: null, past: [],
    }),
    answer_whiteboard: () => ({ ok: true }),
  });
  await page.goto('/whiteboard');
  await expect(page.getByText('Nobody has answered yet. Answer to see who said what.')).toBeVisible();
  const box = page.getByLabel('Your answer');
  await box.fill('Went to a Bucks game');
  await expect(page.getByText('20 / 280')).toBeVisible();
  await page.getByRole('button', { name: 'Answer', exact: true }).click();
  await expect.poll(() => sent.find((s) => s.fn === 'answer_whiteboard')?.args).toEqual({
    p_question: 'q-weekend', p_choice: null, p_body: 'Went to a Bucks game',
  });
});

test('a past week shows its board to anybody, and offers no answering', async ({ page }) => {
  await signedIn(page);
  await server(page, {
    whiteboard_view: (args) => ({
      ok: true, can_manage: false, week_of: WEEK,
      question: { ...LAUNDRY, id: args.p_question, week_of: '2026-11-09', state: 'closed' },
      count: 3, mine: null, answers: PEOPLE, past: PAST,
    }),
  });
  await page.goto('/whiteboard/q-old');
  await expect(page.getByText(/the week of November 9 · over/i)).toBeVisible();
  await expect(page.getByText('Ann Lee')).toBeVisible();
  await expect(page.getByRole('group', { name: 'Your answer' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: '← This week' })).toHaveAttribute('href', '/whiteboard');
});

test('anybody can suggest a question', async ({ page }) => {
  await signedIn(page);
  const sent = await server(page, {
    whiteboard_view: () => ({ ok: true, can_manage: false, week_of: WEEK, question: null, past: [] }),
    suggest_whiteboard_question: () => ({ ok: true }),
  });
  await page.goto('/whiteboard');
  await expect(page.getByText('There is no question up this week. Suggest one below.')).toBeVisible();
  const form = page.getByRole('region', { name: 'Suggest a question' });
  await form.getByRole('textbox').fill('Cats or dogs?');
  await form.getByRole('button', { name: 'Suggest it' }).click();
  await expect(form.getByText('Thanks. Whoever writes the questions will see it.')).toBeVisible();
  expect(sent.find((s) => s.fn === 'suggest_whiteboard_question')?.args).toEqual({ p_prompt: 'Cats or dogs?' });
});

const SHEET = {
  ok: true, week_of: WEEK,
  questions: [{ ...LAUNDRY, answers: 3 }],
  suggestions: [{ id: 's-1', prompt: 'Cats or dogs?', at: '2026-11-15T10:00:00Z', from: 'Ann Lee' }],
};

test('the writer turns a suggestion into next week’s question', async ({ page }) => {
  await signedIn(page);
  const sent = await server(page, {
    whiteboard_view: () => ({ ok: true, can_manage: true, week_of: WEEK, question: LAUNDRY, count: 3,
                              mine: null, answers: PEOPLE, past: [] }),
    whiteboard_sheet: () => SHEET,
    save_whiteboard_question: () => ({ ok: true, id: 'q-new' }),
  });
  await page.goto('/whiteboard');
  // the writer sees the board without answering, and can take an answer down
  await expect(page.getByRole('button', { name: 'Take Bo Jensen’s answer down' })).toBeVisible();

  const writing = page.getByRole('region', { name: 'Writing the questions' });
  await expect(writing.getByText('Cats or dogs? — Ann Lee')).toBeVisible();
  await writing.getByRole('button', { name: 'Use it' }).click();
  const form = page.getByRole('form', { name: 'New question' });
  await expect(form.getByLabel('Question')).toHaveValue('Cats or dogs?');
  // this week has one, so the form starts on the next free week
  await expect(form.getByLabel('Week')).toHaveValue('2026-11-23');
  await form.getByRole('textbox', { name: 'Answer 1' }).fill('Cats');
  await form.getByRole('textbox', { name: 'Answer 2' }).fill('Dogs');
  await form.getByRole('button', { name: 'Another answer' }).click();
  await form.getByRole('textbox', { name: 'Answer 3' }).fill('Neither');
  await form.getByRole('button', { name: 'Add it' }).click();
  await expect.poll(() => sent.find((s) => s.fn === 'save_whiteboard_question')?.args).toEqual({
    p_id: null, p_prompt: 'Cats or dogs?', p_kind: 'choice', p_options: ['Cats', 'Dogs', 'Neither'],
    p_week_of: '2026-11-23', p_suggestion: 's-1',
  });
});

test('this week’s question is the first card on the home page', async ({ page }) => {
  await signedIn(page);
  await server(page, {
    whiteboard_view: () => ({ ok: true, can_manage: false, week_of: WEEK, question: LAUNDRY, count: 3,
                              mine: null, answers: null, past: [] }),
    home_features: () => ({ ok: true, features: [] }),
  });
  await page.goto('/');
  const card = page.getByRole('region', { name: 'Featured' }).getByRole('article');
  await expect(card).toHaveCount(1);
  await expect(card).toContainText('This week’s question');
  await expect(card).toContainText('Do you sort your laundry?');
  await expect(card).toContainText('3 people have answered');
  await expect(card.getByRole('link', { name: 'Answer' })).toHaveAttribute('href', '/whiteboard');
});

test('the board, writer’s view, has no WCAG A/AA violations axe can see', async ({ page }) => {
  await signedIn(page);
  await server(page, {
    whiteboard_view: () => ({ ok: true, can_manage: true, week_of: WEEK, question: LAUNDRY, count: 3,
                              mine: { choice: 0, body: null }, answers: PEOPLE, past: PAST }),
    whiteboard_sheet: () => SHEET,
  });
  await page.goto('/whiteboard');
  await page.getByRole('button', { name: 'New question' }).click();
  await expect(page.getByRole('form', { name: 'New question' })).toBeVisible();
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const summary = results.violations.map((v) => ({ id: v.id, nodes: v.nodes.length, sample: v.nodes[0]?.html.slice(0, 400), why: v.nodes[0]?.failureSummary }));
  expect(summary, JSON.stringify(summary, null, 2)).toEqual([]);
});
