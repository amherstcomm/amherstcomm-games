// Trivia for extra chances in a giveaway.
//
// The server counts the points and weighs the tickets (giveawaystrivia.sql).
// What the page owes: players see which trivia counts, what a point is worth,
// and a way to play it; each entrant's points show beside their chance; and an
// organiser links the sessions and sets the worth of a point.
import { expect, test } from './fixtures';

const G = '6f5e4d3c-5b2d-4f81-a3c6-0d9e8f7a6b54';

const giveaway = (over: Record<string, unknown> = {}) => ({
  id: G, title: 'Brewers tickets', prize: '2 seats', details: '', winners: 1, event_on: '2026-11-02',
  self_entry: true, entries_close_at: null, strength: 1, half_life_days: 365, status: 'open',
  cancelled_reason: null, created_at: '2026-10-20T14:00:00Z', created_by: 'Ray', mode: 'draw',
  trivia_bonus: 1,
  sessions: [{ id: 's-1', title: 'Ownership Trivia', state: 'live', mode: 'open', opens_at: null, closes_at: null }],
  ...over,
});

type Sent = { fn: string; args: Record<string, unknown> };

async function server(
  page: import('@playwright/test').Page,
  state: { manage?: boolean; giveaway?: Record<string, unknown>; me?: string | null } = {}
) {
  const sent: Sent[] = [];
  await page.route('**/rest/v1/rpc/**', (route) => {
    const fn = route.request().url().match(/\/rpc\/(\w+)/)?.[1] ?? '';
    const args = JSON.parse(route.request().postData() ?? '{}');
    const reply = (b: unknown) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
    if (fn.includes('giveaway')) sent.push({ fn, args });
    if (fn === 'giveaway_detail') {
      return reply({
        ok: true, can_manage: state.manage ?? false, me: state.me ?? null,
        chain: { hash: 'x', genesis: 1692803367, period: 3 },
        giveaway: giveaway(state.giveaway),
        entrants: [
          { person: 'p-ada', name: 'Ada', linked: true, entered_at: '2026-10-20T15:00:00Z', entered_by: 'Ada', self: true, weight: 3000000, attended: [], trivia: 2 },
          { person: 'p-bea', name: 'Bea', linked: true, entered_at: '2026-10-20T15:00:00Z', entered_by: 'Bea', self: true, weight: 1000000, attended: [], trivia: 0 },
        ],
        draws: [], winners: [], log: [],
      });
    }
    if (fn === 'giveaway_trivia_choices') {
      return reply({ ok: true, sessions: [
        { id: 's-1', title: 'Ownership Trivia', state: 'live', mode: 'open', opens_at: null, closes_at: null },
        { id: 's-2', title: 'Founders Quiz', state: 'closed', mode: 'live', opens_at: null, closes_at: null },
        { id: 's-3', title: 'Questions Still Being Written', state: 'draft', mode: 'open', opens_at: null, closes_at: null },
      ] });
    }
    if (fn.includes('giveaway')) return reply({ ok: true });
    return route.fallback();
  });
  return sent;
}

test('players see the trivia that counts, what a point is worth, and where to play it', async ({ page }) => {
  // Ada, who is entered: the trivia is for entrants
  await server(page, { me: 'p-ada' });
  await page.goto(`/giveaways/${G}`);
  const trivia = page.getByRole('region', { name: 'Trivia for extra chances' });
  await expect(trivia).toContainText('Each point you score adds an extra ticket: score 3 and your chance is 4×');
  await expect(trivia.getByRole('link', { name: 'Play' })).toHaveAttribute('href', '/live/s-1');
  await expect(trivia).toContainText('you are in, so play away');
  // and each entrant's points, beside their chance
  const who = page.getByRole('region', { name: 'Who is in it' });
  await expect(who.locator('li', { hasText: 'Ada' })).toContainText('Trivia: 2 points · 3× the chance');
  await expect(who.locator('li', { hasText: 'Ada' })).toContainText('75%');
});

test('an organiser links the sessions and sets what a point is worth', async ({ page }) => {
  const sent = await server(page, { manage: true, giveaway: { sessions: [] } });
  await page.goto(`/giveaways/${G}`);
  const trivia = page.getByRole('region', { name: 'Trivia for extra chances' });
  await trivia.getByRole('button', { name: 'Add trivia' }).click();
  await trivia.getByLabel(/Founders Quiz/).check();
  // trivia still being built can be linked too, and says so
  await expect(trivia.getByLabel(/Questions Still Being Written/)).toBeVisible();
  await expect(trivia).toContainText('Questions Still Being Written · on your own time, still being built');
  await trivia.getByLabel(/Questions Still Being Written/).check();
  await trivia.getByLabel('Extra tickets for each point').fill('2');
  await trivia.getByRole('button', { name: 'Save the trivia' }).click();
  await expect.poll(() => sent.find((s) => s.fn === 'set_giveaway_trivia')?.args).toEqual({
    p_id: G, p_sessions: ['s-2', 's-3'], p_bonus: 2,
  });
});

// A session waiting on its opening time says when; one with no opening time
// that nobody has started cannot open by itself, and the organiser is told how.
test('trivia not open yet says when it opens, or tells the organiser how to open it', async ({ page }) => {
  await server(page, { manage: true, giveaway: { sessions: [
    { id: 's-1', title: 'Brewers Trivia', state: 'draft', mode: 'open', opens_at: null, closes_at: null },
    { id: 's-2', title: 'Packers Trivia', state: 'draft', mode: 'open', opens_at: '2026-11-01T13:00:00Z', closes_at: null },
  ] } });
  await page.goto(`/giveaways/${G}`);
  const trivia = page.getByRole('region', { name: 'Trivia for extra chances' });
  await expect(trivia.locator('li', { hasText: 'Packers Trivia' })).toContainText('Opens Nov 1');
  await expect(trivia.locator('li', { hasText: 'Brewers Trivia' })).toContainText('Not open yet');
  await expect(trivia).toContainText('Brewers Trivia has no opening time and is not started: open it under Sessions');
  await expect(trivia.getByRole('link', { name: 'Play' })).toHaveCount(0);
});

test('a judged giveaway offers no trivia: it has no drawing to add chances in', async ({ page }) => {
  await server(page, { manage: true, giveaway: { mode: 'judged', sessions: [] } });
  await page.goto(`/giveaways/${G}`);
  await expect(page.getByRole('heading', { name: 'Brewers tickets' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Trivia for extra chances' })).toHaveCount(0);
});

// The trivia is the entrants': somebody not in is told to enter first, on the
// giveaway and on the session's own page -- where the server refuses them too.
test('somebody not entered is sent to enter first, not handed the trivia', async ({ page }) => {
  await server(page, { me: null });
  await page.goto(`/giveaways/${G}`);
  const trivia = page.getByRole('region', { name: 'Trivia for extra chances' });
  await expect(trivia).toContainText('The trivia is for entrants only: enter the giveaway first, then play.');
  await expect(trivia.getByRole('link', { name: 'Play' })).toHaveCount(0);
});

test("the trivia's own page sends somebody not entered to the giveaway", async ({ page }) => {
  await page.route('**/rest/v1/rpc/current_item', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json',
                    body: JSON.stringify({ state: 'giveaway-only', now: new Date().toISOString(), yours: false, giveaway: G }) })
  );
  await page.goto('/live/s-1');
  await expect(page.getByText('This trivia is part of a giveaway.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Go to the giveaway' })).toHaveAttribute('href', `/giveaways/${G}`);
});

// The trivia as a checklist of ways to more chances: entering ticked first,
// then each session ticked once it is behind you, with what it earned.
test('the reader sees which trivia they have done, as a checklist', async ({ page }) => {
  await server(page, { me: 'p-ada', giveaway: { sessions: [
    { id: 's-1', title: 'Brewers Trivia', state: 'live', mode: 'open', opens_at: null, closes_at: null,
      mine: { total: 13, done: 13, points: 13 } },
    { id: 's-2', title: 'Packers Trivia', state: 'live', mode: 'open', opens_at: null, closes_at: null,
      mine: { total: 10, done: 3, points: 2 } },
    { id: 's-3', title: 'Bucks Trivia', state: 'live', mode: 'open', opens_at: null, closes_at: null,
      mine: { total: 8, done: 0, points: 0 } },
  ] } });
  await page.goto(`/giveaways/${G}`);
  const list = page.getByRole('list', { name: 'Your chances' });
  const entered = list.locator('li', { hasText: 'You are entered' });
  await expect(entered.getByRole('img', { name: 'Done' })).toBeVisible();

  const done = list.locator('li', { hasText: 'Brewers Trivia' });
  await expect(done.getByRole('img', { name: 'Done' })).toBeVisible();
  await expect(done).toContainText('Done · 13 points · 13 extra tickets');
  // nothing left to play there
  await expect(done.getByRole('link')).toHaveCount(0);

  const partly = list.locator('li', { hasText: 'Packers Trivia' });
  await expect(partly.getByRole('img', { name: 'Partly done' })).toBeVisible();
  await expect(partly).toContainText('3 of 10 answered · 2 points so far');
  await expect(partly.getByRole('link', { name: 'Continue' })).toHaveAttribute('href', '/live/s-2');

  const todo = list.locator('li', { hasText: 'Bucks Trivia' });
  await expect(todo.getByRole('img', { name: 'Not done yet' })).toBeVisible();
  await expect(todo.getByRole('link', { name: 'Play' })).toBeVisible();
});

test('and somebody not yet entered sees that first', async ({ page }) => {
  await server(page, { me: null });
  await page.goto(`/giveaways/${G}`);
  const first = page.getByRole('list', { name: 'Your chances' }).locator('li').first();
  await expect(first).toContainText('Enter the giveaway');
  await expect(first.getByRole('img', { name: 'Not done yet' })).toBeVisible();
});
