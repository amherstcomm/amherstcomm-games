// Disqualifying entries, barring people, and winners accepting for themselves.
//
// The server holds the rules (giveawaysdisqualify.sql): who may, what a
// disqualified entry is out of, the window to accept. What the pages owe: an
// organiser disqualifies with a reason and can bar too, and reinstates; the
// entry shows as disqualified, with the reason for organisers only; a winner
// accepts, agreeing to the terms, or declines, until the window closes; and a
// bar shows on the history, with a way to lift it.
import { expect, test } from './fixtures';

const G = '7e6d5c4b-3a2f-4e1d-8c0b-9a8f7e6d5c4b';
const soon = new Date(Date.now() + 36 * 3600_000).toISOString();
const gone = new Date(Date.now() - 3600_000).toISOString();

type Over = {
  manage?: boolean;
  me?: string | null;
  entrants?: unknown[];
  winners?: unknown[];
  status?: string;
  terms?: boolean;
};

const entrant = (person: string, name: string, more: Record<string, unknown> = {}) => ({
  person, name, linked: true, entered_at: '2026-10-21T15:00:00Z', entered_by: name, self: true,
  weight: 1000000, attended: [], agreed: true, ...more,
});

async function server(page: import('@playwright/test').Page, over: Over = {}) {
  const sent: { fn: string; args: Record<string, unknown> }[] = [];
  await page.route('**/rest/v1/rpc/**', (route) => {
    const fn = route.request().url().match(/\/rpc\/(\w+)/)?.[1] ?? '';
    const args = JSON.parse(route.request().postData() ?? '{}');
    const reply = (b: unknown) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
    if (/giveaway|entry|bar|win/.test(fn)) sent.push({ fn, args });
    if (fn === 'giveaways_list') return reply({ ok: true, can_manage: true, giveaways: [], standard_terms: '' });
    if (fn === 'giveaway_detail') {
      return reply({
        ok: true, can_manage: over.manage ?? false, me: over.me ?? null,
        chain: { hash: 'x', genesis: 1692803367, period: 3 },
        giveaway: {
          id: G, title: 'Bucks tickets', prize: '2 tickets', details: '', winners: 1, event_on: null,
          self_entry: true, entries_close_at: null, strength: 1, half_life_days: 365, status: over.status ?? 'open',
          cancelled_reason: null, created_at: '2026-10-21T14:00:00Z', created_by: 'Ray', mode: 'draw', kind: 'event',
          accept_hours: 48, terms: '', standard_terms: '',
          terms_text: over.terms ? 'Staff only.' : '', terms_hash: over.terms ? 'h-terms' : null,
        },
        entrants: over.entrants ?? [], draws: [], winners: over.winners ?? [], log: [],
      });
    }
    if (fn === 'giveaway_history') {
      return reply({ ok: true, can_manage: true, log: [], people: [
        { person: 'p-bea', name: 'Bea', linked: true, entries: 2, wins: 0, weight: 1000000, attended: [],
          barred: true, barred_reason: 'Not staff' },
      ] });
    }
    if (/giveaway|entry|bar|win/.test(fn)) return reply({ ok: true, id: G });
    return route.fallback();
  });
  return sent;
}

test('an organiser disqualifies an entry with a reason, and bars them too', async ({ page }) => {
  const sent = await server(page, { manage: true, entrants: [entrant('p-bea', 'Bea')] });
  const answers = ['Entered twice under two names', true];
  page.on('dialog', (d) => {
    const a = answers.shift();
    void (typeof a === 'string' ? d.accept(a) : a ? d.accept() : d.dismiss());
  });
  await page.goto(`/giveaways/${G}`);
  await page.getByRole('button', { name: 'Disqualify Bea' }).click();
  await expect.poll(() => sent.find((s) => s.fn === 'disqualify_giveaway_entry')?.args).toEqual({
    p_id: G, p_person: 'p-bea', p_reason: 'Entered twice under two names', p_bar: true,
  });
});

test('a disqualified entry is marked, out of the odds, and an organiser sees why and can reinstate it', async ({ page }) => {
  const sent = await server(page, {
    manage: true,
    entrants: [entrant('p-ada', 'Ada'), entrant('p-bea', 'Bea', { disqualified: true, disqualified_reason: 'Not staff' })],
  });
  await page.goto(`/giveaways/${G}`);
  const who = page.getByRole('region', { name: 'Who is in it' });
  await expect(who).toContainText('Disqualified: Not staff');
  await expect(who).toContainText('Out');
  await expect(page.getByRole('button', { name: 'Take Bea out' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Reinstate Bea' }).click();
  await expect.poll(() => sent.find((s) => s.fn === 'reinstate_giveaway_entry')?.args).toEqual({ p_id: G, p_person: 'p-bea' });
});

test('everybody else sees it was disqualified, not why', async ({ page }) => {
  await server(page, {
    entrants: [entrant('p-bea', 'Bea', { disqualified: true, disqualified_reason: null })],
  });
  await page.goto(`/giveaways/${G}`);
  const who = page.getByRole('region', { name: 'Who is in it' });
  await expect(who).toContainText('Disqualified');
  await expect(who).not.toContainText('Not staff');
  await expect(page.getByRole('button', { name: /Reinstate|Disqualify/ })).toHaveCount(0);
});

test('a winner accepts for themselves, agreeing to the terms, before the time runs out', async ({ page }) => {
  const sent = await server(page, {
    me: 'p-ada', status: 'drawn', terms: true,
    entrants: [entrant('p-ada', 'Ada')],
    winners: [{ person: 'p-ada', name: 'Ada', pick: 1, draw: 1, status: 'pending', decided_at: null, decided_by: null,
                respond_by: soon }],
  });
  await page.goto(`/giveaways/${G}`);
  const won = page.getByRole('region', { name: 'You won' });
  await expect(won).toContainText('You won: 2 tickets');
  await expect(won).toContainText('Accept by');
  await expect(won.getByRole('button', { name: 'Accept' })).toBeDisabled();
  await won.getByLabel('I have read and agree to the terms and conditions').check();
  await won.getByRole('button', { name: 'Accept' }).click();
  await expect.poll(() => sent.find((s) => s.fn === 'respond_to_giveaway_win')?.args).toEqual({
    p_id: G, p_accept: true, p_terms: 'h-terms',
  });
  await expect(page.getByRole('region', { name: 'Who was drawn' })).toContainText('accept by');
});

test('or declines it, so somebody else can have it', async ({ page }) => {
  const sent = await server(page, {
    me: 'p-ada', status: 'drawn',
    entrants: [entrant('p-ada', 'Ada')],
    winners: [{ person: 'p-ada', name: 'Ada', pick: 1, draw: 1, status: 'pending', decided_at: null, decided_by: null,
                respond_by: soon }],
  });
  page.once('dialog', (d) => void d.accept());
  await page.goto(`/giveaways/${G}`);
  await page.getByRole('region', { name: 'You won' }).getByRole('button', { name: 'Decline' }).click();
  await expect.poll(() => sent.find((s) => s.fn === 'respond_to_giveaway_win')?.args).toEqual({
    p_id: G, p_accept: false, p_terms: null,
  });
});

test('past the window, the winner is told so and everybody sees it lapsed', async ({ page }) => {
  await server(page, {
    me: 'p-ada', status: 'drawn',
    entrants: [entrant('p-ada', 'Ada')],
    winners: [{ person: 'p-ada', name: 'Ada', pick: 1, draw: 1, status: 'pending', decided_at: null, decided_by: null,
                respond_by: gone }],
  });
  await page.goto(`/giveaways/${G}`);
  const won = page.getByRole('region', { name: 'You won' });
  await expect(won).toContainText('The time to accept ran out');
  await expect(won.getByRole('button', { name: 'Accept' })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Who was drawn' })).toContainText('Did not accept in time');
});

test('an organiser sets how long winners have to accept', async ({ page }) => {
  const sent = await server(page);
  await page.goto('/giveaways');
  await page.getByRole('button', { name: 'New giveaway' }).click();
  await page.getByLabel('What it is', { exact: true }).fill('Bucks tickets');
  await page.getByLabel('Hours a winner has to accept (empty for no limit)').fill('48');
  await page.getByRole('button', { name: 'Create it' }).click();
  await expect.poll(() => sent.find((s) => s.fn === 'save_giveaway')?.args).toMatchObject({ p_accept_hours: 48 });
});

test('a bar shows on the history, and an organiser can lift it', async ({ page }) => {
  const sent = await server(page);
  page.once('dialog', (d) => void d.accept());
  await page.goto('/giveaways/history');
  await expect(page.getByText('· barred from giveaways')).toBeVisible();
  await page.getByRole('button', { name: 'Lift the bar on Bea' }).click();
  await expect.poll(() => sent.find((s) => s.fn === 'lift_giveaway_bar')?.args).toEqual({ p_person: 'p-bea' });
});
