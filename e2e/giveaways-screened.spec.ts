// Rated, then drawn: judges rate the answers, the best go into a drawing.
//
// The server decides who may see and do what (giveawaysscreened.sql). What
// the pages owe: an organiser can set one up with its questions, bar and
// odds; a judge rates blind, 1 to 5, never their own; the organiser sees every
// average, can move the bar, and sees how many it lets in before setting the
// pool; and once set, the pool is public and drawn like any drawing.
import { expect, test } from './fixtures';

const G = '5e4d3c2b-5b2d-4f81-a3c6-0d9e8f7a6b54';
const Q1 = 'q-1';

const giveaway = (over: Record<string, unknown> = {}) => ({
  id: G, title: 'Bucks tickets', prize: '2 seats', details: '', winners: 1, event_on: '2026-11-02',
  self_entry: true, entries_close_at: null, strength: 1, half_life_days: 365, status: 'open',
  cancelled_reason: null, created_at: '2026-10-20T14:00:00Z', created_by: 'Ray', mode: 'screened', picks: 3, bar: 3, ...over,
});

const entry = (label: string, answer: string, over: Record<string, unknown> = {}) => ({
  person: null, key: null, label, name: null, own: false, points: null, firsts: null, ranks: null,
  average: null, rated_by: null, qualified: null, ratings: null,
  answers: [{ question: Q1, answer }], ...over,
});

const judging = (over: Record<string, unknown> = {}) => ({
  ok: true, is_judge: false, decided: false, picks: 3, mode: 'screened', bar: 3,
  questions: [{ id: Q1, prompt: 'Why should you go?' }],
  judges: [{ user: 'u-j1', name: 'Rater One', ranked: true }, { user: 'u-j2', name: 'Rater Two', ranked: false }],
  entries_count: 3, mine: null, entered: false, entries: [], my_ranking: null, my_ratings: null, ...over,
});

type Sent = { fn: string; args: Record<string, unknown> };

async function server(
  page: import('@playwright/test').Page,
  state: { manage?: boolean; giveaway?: Record<string, unknown>; judging?: Record<string, unknown>; entrants?: unknown[] } = {}
) {
  const sent: Sent[] = [];
  await page.route('**/rest/v1/rpc/**', (route) => {
    const fn = route.request().url().match(/\/rpc\/(\w+)/)?.[1] ?? '';
    const args = JSON.parse(route.request().postData() ?? '{}');
    const reply = (b: unknown) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
    if (/giveaway|judg|rating|qualify/.test(fn)) sent.push({ fn, args });
    if (fn === 'giveaways_list') return reply({ ok: true, can_manage: state.manage ?? false, giveaways: [] });
    if (fn === 'giveaway_detail') {
      return reply({
        ok: true, can_manage: state.manage ?? false, me: null,
        chain: { hash: 'x', genesis: 1692803367, period: 3 },
        giveaway: giveaway(state.giveaway), entrants: state.entrants ?? [], draws: [], winners: [], log: [],
      });
    }
    if (fn === 'giveaway_judging') return reply(judging(state.judging));
    if (/giveaway|judg|rating|qualify/.test(fn)) return reply({ ok: true, id: G, in: 2, draw: 'd-1', round: 1, round_at: new Date().toISOString(), snapshot_hash: 'x' });
    return route.fallback();
  });
  return sent;
}

test('an organiser sets one up: rated, then drawn, with a bar and the usual odds', async ({ page }) => {
  const sent = await server(page, { manage: true });
  await page.goto('/giveaways');
  await page.getByRole('button', { name: 'New giveaway' }).click();
  await page.getByLabel('Answer questions, rated, then drawn').check();
  await page.getByLabel('What it is').fill('Bucks tickets');
  await page.getByLabel(/One per line/).fill('Why should you go?');
  await page.getByLabel('Into the drawing at an average rating of at least').fill('3.5');
  // the drawing's odds are set as for any drawing; a judged one's picks are not asked
  await expect(page.getByLabel('Right after going')).toBeVisible();
  await expect(page.getByLabel('Each judge ranks their top')).toHaveCount(0);
  await page.getByRole('button', { name: 'Create it' }).click();
  await expect.poll(() => sent.find((s) => s.fn === 'save_giveaway')?.args).toMatchObject({
    p_mode: 'screened', p_bar: 3.5, p_questions: ['Why should you go?'], p_strength: 1, p_half_life_days: 365,
  });
});

test('a judge rates blind, 1 to 5, and cannot rate their own', async ({ page }) => {
  const sent = await server(page, {
    giveaway: { status: 'judging' },
    judging: {
      is_judge: true, my_ratings: {},
      entries: [entry('Entry 1', 'I never miss a game'), entry('Entry 2', 'Why not', { own: true }),
                entry('Entry 3', 'My kids have never been')],
    },
  });
  await page.goto(`/giveaways/${G}`);
  const rating = page.getByRole('region', { name: 'Your rating' });
  await expect(rating.getByText('Your own entry: you cannot rate it')).toBeVisible();
  await expect(rating.getByRole('group', { name: 'Your rating for Entry 2' })).toHaveCount(0);
  await rating.getByRole('group', { name: 'Your rating for Entry 3' }).getByRole('button', { name: '5' }).click();
  await rating.getByRole('group', { name: 'Your rating for Entry 1' }).getByRole('button', { name: '2' }).click();
  await expect(rating).toContainText('2 of 2 rated');
  await rating.getByRole('button', { name: 'Save my ratings' }).click();
  await expect.poll(() => sent.find((s) => s.fn === 'save_giveaway_ratings')?.args).toEqual({
    p_id: G, p_ratings: { 'Entry 3': 5, 'Entry 1': 2 },
  });
});

test('the organiser sees every average, moves the bar, and sets the pool', async ({ page }) => {
  const sent = await server(page, {
    manage: true,
    giveaway: { status: 'judging' },
    judging: {
      entries: [
        entry('Entry 1', 'I never miss a game', { average: 4.5, rated_by: 2 }),
        entry('Entry 3', 'My kids have never been', { average: 2.5, rated_by: 2 }),
        entry('Entry 2', 'Free tickets', { average: 1.5, rated_by: 2 }),
      ],
    },
  });
  page.on('dialog', (d) => void d.accept());
  await page.goto(`/giveaways/${G}`);
  const pool = page.getByRole('region', { name: 'Set the pool' });
  await expect(pool).toContainText('4.50 average');
  await expect(pool).toContainText('1 of 3 entries goes into the drawing.');
  await pool.getByLabel('Into the drawing at an average of at least').fill('2.5');
  await expect(pool).toContainText('2 of 3 entries go into the drawing.');
  await pool.getByRole('button', { name: 'Set the pool' }).click();
  await expect.poll(() => sent.find((s) => s.fn === 'qualify_giveaway')?.args).toEqual({ p_id: G, p_bar: 2.5 });
});

test('once set, the pool is public, and the drawing is between the pool alone', async ({ page }) => {
  const sent = await server(page, {
    manage: true,
    giveaway: { status: 'qualified', bar: 2.5 },
    entrants: [
      { person: 'p-ada', name: 'Ada', linked: true, entered_at: '2026-10-20T15:00:00Z', entered_by: 'Ada', self: true, weight: 1000000, attended: [], qualified: true },
      { person: 'p-bea', name: 'Bea', linked: true, entered_at: '2026-10-20T15:00:00Z', entered_by: 'Bea', self: true, weight: 514239, attended: [{ on: '2026-09-20', what: 'Bucks game' }], qualified: true },
      { person: 'p-cy', name: 'Cy', linked: true, entered_at: '2026-10-20T15:00:00Z', entered_by: 'Cy', self: true, weight: 1000000, attended: [], qualified: false },
    ],
    judging: {
      decided: true, bar: 2.5,
      entries: [
        entry('Entry 1', 'I never miss a game', { name: 'Ada', person: 'p-ada', average: 4.5, qualified: true,
          ratings: [{ judge: 'Rater One', rating: 4 }, { judge: 'Rater Two', rating: 5 }] }),
        entry('Entry 2', 'Free tickets', { name: 'Cy', person: 'p-cy', average: 1.5, qualified: false,
          ratings: [{ judge: 'Rater One', rating: 1 }, { judge: 'Rater Two', rating: 2 }] }),
      ],
    },
  });
  page.on('dialog', (d) => void d.accept());
  await page.goto(`/giveaways/${G}`);
  const all = page.getByRole('region', { name: 'Every entry' });
  await expect(all).toContainText('4.50 average · in the drawing');
  await expect(all).toContainText('4 from Rater One · 5 from Rater Two');
  await expect(all).toContainText('1.50 average · not in the drawing');
  // the chances are among the pool: Ada 1,000,000 of 1,514,239, Cy not there
  const who = page.getByRole('region', { name: 'Who is in it' });
  await expect(who.locator('li', { hasText: 'Ada' })).toContainText('66%');
  await expect(who.getByText('Cy')).toHaveCount(0);
  const draw = page.getByRole('region', { name: 'Draw from the pool' });
  await expect(draw).toContainText('2 entries averaged 2.5 or more.');
  await draw.getByRole('button', { name: 'Draw the winner' }).click();
  await expect.poll(() => sent.some((s) => s.fn === 'commit_giveaway_draw')).toBe(true);
});
