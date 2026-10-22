// Tidying up after trying giveaways out, and the way back from their trivia.
//
// The server holds the rules (giveawaysdelete.sql): only an organiser, a
// giveaway only by its typed name, a person not while they won a giveaway that
// still exists. What the pages owe: the buttons, the typed confirmation, and
// a way back to the giveaway from its trivia, during it and at the end.
import { expect, test } from './fixtures';

const G = '7a6f5e4d-5b2d-4f81-a3c6-0d9e8f7a6b54';

async function server(page: import('@playwright/test').Page, open = false) {
  const sent: { fn: string; args: Record<string, unknown> }[] = [];
  await page.route('**/rest/v1/rpc/**', (route) => {
    const fn = route.request().url().match(/\/rpc\/(\w+)/)?.[1] ?? '';
    const args = JSON.parse(route.request().postData() ?? '{}');
    const reply = (b: unknown) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
    if (/giveaway|entrant/.test(fn)) sent.push({ fn, args });
    if (fn === 'giveaways_list') return reply({ ok: true, can_manage: true, giveaways: [] });
    if (fn === 'giveaway_detail') {
      return reply({
        ok: true, can_manage: true, me: null, chain: { hash: 'x', genesis: 1692803367, period: 3 },
        giveaway: {
          id: G, title: 'Test Test Test', prize: '1 ticket', details: '', winners: 1, event_on: null,
          self_entry: true, entries_close_at: null, strength: 1, half_life_days: 365, status: open ? 'open' : 'drawn',
          cancelled_reason: null, created_at: '2026-10-21T14:00:00Z', created_by: 'Ray', mode: 'draw',
        },
        entrants: open
          ? [{ person: 'p-test', name: 'Ray Tetzloff 2', linked: true, entered_at: '2026-10-21T19:26:00Z',
               entered_by: 'Ray Tetzloff 2', self: true, weight: 1000000, attended: [] }]
          : [],
        draws: [], winners: [], log: [],
        private_log: open
          ? [{ at: '2026-10-21T20:00:00Z', actor: 'Ray Tetzloff', action: 'test entry removed', detail: { name: 'Test Person' } }]
          : [],
      });
    }
    if (fn === 'giveaway_history') {
      return reply({ ok: true, can_manage: true, log: [], people: [
        { person: 'p-test', name: 'Ray Tetzloff 2', linked: true, entries: 1, wins: 0, weight: 1000000, attended: [] },
      ] });
    }
    if (fn === 'session_giveaway') return reply({ id: G, title: 'Test Test Test' });
    if (fn === 'current_item') {
      return reply({ state: 'done', mode: 'open', now: new Date().toISOString(), yours: false, total: 13 });
    }
    if (/giveaway|entrant/.test(fn)) return reply({ ok: true });
    return route.fallback();
  });
  return sent;
}

test('an organiser deletes a test giveaway by typing its name', async ({ page }) => {
  const sent = await server(page);
  let asked = '';
  page.once('dialog', (d) => {
    asked = d.message();
    void d.accept('Test Test Test');
  });
  await page.goto(`/giveaways/${G}`);
  await page.getByRole('button', { name: 'Delete this giveaway' }).click();
  await expect.poll(() => sent.find((s) => s.fn === 'delete_giveaway')?.args).toEqual({ p_id: G, p_title: 'Test Test Test' });
  expect(asked).toContain('Type its name to confirm');
  // and goes back to the list, the giveaway being gone
  await expect(page).toHaveURL(/\/giveaways$/);
});

test('and a test person from the history', async ({ page }) => {
  const sent = await server(page);
  page.once('dialog', (d) => void d.accept());
  await page.goto('/giveaways/history');
  await page.getByRole('button', { name: 'Delete Ray Tetzloff 2' }).click();
  await expect.poll(() => sent.find((s) => s.fn === 'delete_giveaway_person')?.args).toEqual({ p_person: 'p-test' });
});

test("a giveaway's trivia leads back to the giveaway, during it and at the end", async ({ page }) => {
  await server(page);
  await page.goto('/live/s-1');
  await expect(page.getByRole('link', { name: '← Back to Test Test Test' })).toHaveAttribute('href', `/giveaways/${G}`);
  await expect(page.getByText('That is all of them.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Back to the giveaway' })).toHaveAttribute('href', `/giveaways/${G}`);
});

// A test entry, out of the public record before anything is drawn -- and the
// organisers' own note that it happened.
test('an organiser removes a test entry quietly, and sees that it was done', async ({ page }) => {
  const sent = await server(page, true);
  let asked = '';
  page.once('dialog', (d) => {
    asked = d.message();
    void d.accept();
  });
  await page.goto(`/giveaways/${G}`);
  await page.getByRole('button', { name: 'Remove Ray Tetzloff 2 as a test entry' }).click();
  await expect.poll(() => sent.find((s) => s.fn === 'remove_test_entrant')?.args).toEqual({ p_id: G, p_person: 'p-test' });
  expect(asked).toContain('as if they had never entered');
  await expect(page.getByRole('region', { name: 'Organisers only' })).toContainText(
    'Ray Tetzloff removed Test Person as a test entry'
  );
});
