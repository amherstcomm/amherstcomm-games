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

async function server(page: import('@playwright/test').Page, state: { manage?: boolean; giveaway?: Record<string, unknown> } = {}) {
  const sent: Sent[] = [];
  await page.route('**/rest/v1/rpc/**', (route) => {
    const fn = route.request().url().match(/\/rpc\/(\w+)/)?.[1] ?? '';
    const args = JSON.parse(route.request().postData() ?? '{}');
    const reply = (b: unknown) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
    if (fn.includes('giveaway')) sent.push({ fn, args });
    if (fn === 'giveaway_detail') {
      return reply({
        ok: true, can_manage: state.manage ?? false, me: null,
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
      ] });
    }
    if (fn.includes('giveaway')) return reply({ ok: true });
    return route.fallback();
  });
  return sent;
}

test('players see the trivia that counts, what a point is worth, and where to play it', async ({ page }) => {
  await server(page);
  await page.goto(`/giveaways/${G}`);
  const trivia = page.getByRole('region', { name: 'Trivia for extra chances' });
  await expect(trivia).toContainText('Each point you score adds an extra ticket: score 3 and your chance is 4×');
  await expect(trivia.getByRole('link', { name: 'Play' })).toHaveAttribute('href', '/live/s-1');
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
  await trivia.getByLabel('Extra tickets for each point').fill('2');
  await trivia.getByRole('button', { name: 'Save the trivia' }).click();
  await expect.poll(() => sent.find((s) => s.fn === 'set_giveaway_trivia')?.args).toEqual({
    p_id: G, p_sessions: ['s-2'], p_bonus: 2,
  });
});

test('a judged giveaway offers no trivia: it has no drawing to add chances in', async ({ page }) => {
  await server(page, { manage: true, giveaway: { mode: 'judged', sessions: [] } });
  await page.goto(`/giveaways/${G}`);
  await expect(page.getByRole('heading', { name: 'Brewers tickets' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Trivia for extra chances' })).toHaveCount(0);
});
