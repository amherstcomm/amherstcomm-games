// A giveaway for a prize to keep rather than an event.
//
// The server holds the rules (giveawaysprize.sql): a prize has no event day,
// and accepting one is a win, not an attendance. What the pages owe: the
// choice on the form, no event day asked for a prize, and a prize's winner
// accepting rather than going, in the winners and the record and the history.
import { expect, test } from './fixtures';

const G = '5b4a3c2d-1e0f-4a9b-8c7d-6e5f4a3b2c1d';

async function server(page: import('@playwright/test').Page) {
  const sent: { fn: string; args: Record<string, unknown> }[] = [];
  await page.route('**/rest/v1/rpc/**', (route) => {
    const fn = route.request().url().match(/\/rpc\/(\w+)/)?.[1] ?? '';
    const args = JSON.parse(route.request().postData() ?? '{}');
    const reply = (b: unknown) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
    if (/giveaway/.test(fn)) sent.push({ fn, args });
    if (fn === 'giveaways_list') return reply({ ok: true, can_manage: true, giveaways: [] });
    if (fn === 'giveaway_detail') {
      return reply({
        ok: true, can_manage: true, me: null, chain: { hash: 'x', genesis: 1692803367, period: 3 },
        giveaway: {
          id: G, title: 'Gift card', prize: 'a $50 gift card', details: '', winners: 1, event_on: null,
          self_entry: true, entries_close_at: null, strength: 1, half_life_days: 365, status: 'drawn',
          cancelled_reason: null, created_at: '2026-10-21T14:00:00Z', created_by: 'Ray', mode: 'draw', kind: 'prize',
        },
        entrants: [], draws: [],
        winners: [{ person: 'p1', name: 'Ada', pick: 1, draw: 1, status: 'accepted', decided_at: null, decided_by: 'Ray' }],
        log: [{ at: '2026-10-22T14:00:00Z', actor: 'Ray Tetzloff', action: 'accepted', detail: { name: 'Ada', kind: 'prize' } }],
      });
    }
    if (fn === 'giveaway_history') {
      return reply({ ok: true, can_manage: false, log: [], people: [
        { person: 'p1', name: 'Ada', linked: true, entries: 1, wins: 1, weight: 1000000, attended: [],
          won: [{ on: '2026-10-22', what: 'Gift card', giveaway: G }] },
      ] });
    }
    if (/giveaway/.test(fn)) return reply({ ok: true, id: G });
    return route.fallback();
  });
  return sent;
}

test('an organiser sets one up for a prize to keep, with no event day', async ({ page }) => {
  const sent = await server(page);
  await page.goto('/giveaways');
  await page.getByRole('button', { name: 'New giveaway' }).click();
  await expect(page.getByLabel('The day of the event')).toBeVisible();
  await page.getByLabel('A prize to keep: a gift card, swag').check();
  await expect(page.getByLabel('The day of the event')).toHaveCount(0);
  await expect(page.getByText('does not lower anybody’s chance next time')).toBeVisible();
  await page.getByLabel('What it is').fill('Gift card');
  await page.getByRole('button', { name: 'Create it' }).click();
  await expect.poll(() => sent.find((s) => s.fn === 'save_giveaway')?.args).toMatchObject({
    p_title: 'Gift card', p_kind: 'prize',
  });
});

test("a prize's winner has accepted it, not gone to it", async ({ page }) => {
  await server(page);
  await page.goto(`/giveaways/${G}`);
  const winners = page.getByRole('listitem').filter({ hasText: 'Ada' }).first();
  await expect(winners).toContainText('Accepted');
  await expect(page.getByRole('button', { name: 'Going' })).toHaveCount(0);
  await expect(page.getByText('Ray Tetzloff marked Ada as having accepted')).toBeVisible();
});

test('the history shows a prize won, apart from the events gone to', async ({ page }) => {
  await server(page);
  await page.goto('/giveaways/history');
  await expect(page.getByRole('heading', { name: 'Who has won what' })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Prizes Ada won' })).toContainText('Won Gift card');
  await expect(page.getByText('0 attendances · 1 prize · entered 1')).toBeVisible();
});
