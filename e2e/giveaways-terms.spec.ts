// Terms and conditions on giveaways.
//
// The server holds the rules (giveawaysterms.sql): agreeing is by the terms'
// fingerprint, terms do not change once people are in, a winner accepts only
// having agreed. What the pages owe: organisers set the standard terms; the
// terms are there to read; entering waits on a tick and sends what was
// agreed to; somebody put in by an organiser can agree afterwards; and an
// organiser sees who has not agreed and can record that they did.
import { expect, test } from './fixtures';

const G = '6c5b4a3d-2e1f-4a0b-9c8d-7e6f5a4b3c2d';

type Over = { me?: string | null; manage?: boolean; entrants?: unknown[] };

async function server(page: import('@playwright/test').Page, over: Over = {}) {
  const sent: { fn: string; args: Record<string, unknown> }[] = [];
  await page.route('**/rest/v1/rpc/**', (route) => {
    const fn = route.request().url().match(/\/rpc\/(\w+)/)?.[1] ?? '';
    const args = JSON.parse(route.request().postData() ?? '{}');
    const reply = (b: unknown) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
    if (/giveaway|terms/.test(fn)) sent.push({ fn, args });
    if (fn === 'giveaways_list') {
      return reply({ ok: true, can_manage: true, giveaways: [], standard_terms: 'Staff only.' });
    }
    if (fn === 'giveaway_detail') {
      return reply({
        ok: true, can_manage: over.manage ?? false, me: over.me ?? null,
        chain: { hash: 'x', genesis: 1692803367, period: 3 },
        giveaway: {
          id: G, title: 'Bucks tickets', prize: '2 tickets', details: '', winners: 1, event_on: null,
          self_entry: true, entries_close_at: null, strength: 1, half_life_days: 365, status: 'open',
          cancelled_reason: null, created_at: '2026-10-21T14:00:00Z', created_by: 'Ray', mode: 'draw', kind: 'event',
          terms: 'You must be able to go on the 30th.', standard_terms: 'Staff only.',
          terms_text: 'Staff only.\n\nYou must be able to go on the 30th.', terms_hash: 'h-terms',
        },
        entrants: over.entrants ?? [], draws: [], winners: [], log: [],
      });
    }
    if (/giveaway|terms/.test(fn)) return reply({ ok: true, applied: 2 });
    return route.fallback();
  });
  return sent;
}

const bea = { person: 'p-bea', name: 'Bea', linked: true, entered_at: '2026-10-21T15:00:00Z', entered_by: 'Ray',
              self: false, weight: 1000000, attended: [], agreed: false };

test('an organiser sets the standard terms every giveaway carries', async ({ page }) => {
  const sent = await server(page);
  await page.goto('/giveaways');
  const terms = page.getByRole('region', { name: 'Standard terms' });
  await terms.getByRole('button', { name: 'Change' }).click();
  await terms.getByLabel('The terms').fill('Staff only. No cash in place of a prize.');
  await terms.getByRole('button', { name: 'Save the standard terms' }).click();
  await expect.poll(() => sent.find((s) => s.fn === 'set_giveaway_standard_terms')?.args).toEqual({
    p_body: 'Staff only. No cash in place of a prize.',
  });
  await expect(terms.getByRole('status')).toHaveText('Saved. 2 giveaways not yet entered took them.');
});

test('entering waits on agreeing to the terms, and sends what was agreed to', async ({ page }) => {
  const sent = await server(page);
  await page.goto(`/giveaways/${G}`);
  await page.getByText('Terms and conditions', { exact: true }).click();
  await expect(page.getByText('You must be able to go on the 30th.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Put me in' })).toBeDisabled();
  await page.getByLabel('I have read and agree to the terms and conditions').check();
  await page.getByRole('button', { name: 'Put me in' }).click();
  await expect.poll(() => sent.find((s) => s.fn === 'enter_giveaway')?.args).toEqual({
    p_id: G, p_in: true, p_terms: 'h-terms',
  });
});

test('somebody an organiser put in agrees afterwards', async ({ page }) => {
  const sent = await server(page, { me: 'p-bea', entrants: [bea] });
  await page.goto(`/giveaways/${G}`);
  await page.getByRole('region', { name: 'Agree to the terms' }).getByRole('button', { name: 'I agree to the terms' }).click();
  await expect.poll(() => sent.find((s) => s.fn === 'agree_giveaway_terms')?.args).toEqual({
    p_id: G, p_terms: 'h-terms', p_person: null,
  });
});

test('an organiser sees who has not agreed, and records that they did', async ({ page }) => {
  const sent = await server(page, { manage: true, entrants: [bea] });
  page.once('dialog', (d) => void d.accept());
  await page.goto(`/giveaways/${G}`);
  await expect(page.getByRole('region', { name: 'Who is in it' })).toContainText('Has not agreed to the terms');
  await page.getByRole('button', { name: 'Record that Bea agreed to the terms' }).click();
  await expect.poll(() => sent.find((s) => s.fn === 'agree_giveaway_terms')?.args).toEqual({
    p_id: G, p_terms: 'h-terms', p_person: 'p-bea',
  });
});

test("once people are in, the giveaway's own terms cannot be changed", async ({ page }) => {
  await server(page, { manage: true, entrants: [bea] });
  await page.goto(`/giveaways/${G}`);
  await page.getByRole('region', { name: 'Running it' }).getByRole('button', { name: /Change/ }).first().click();
  await expect(page.getByLabel('Terms for this giveaway, on top of the standard terms')).toBeDisabled();
  await expect(page.getByText('People have entered, so the terms they agreed to cannot change.')).toBeVisible();
});
