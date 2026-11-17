// Suggestion boxes, as a sender, a reader and the administrator.
//
// The server holds the rules (suggestions.sql). What the page owes: a way to
// pick whose box and leave one with or without a name; for an anonymous one,
// the key kept and the private link offered -- carried after a # and taken
// out of the address once read; a reader's answer to the sender or on the
// board; and an administrator setting boxes up without ever seeing contents.
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

const KEY = 'a'.repeat(64);
const BOXES = [
  { id: 'b-ceo', name: 'The CEO’s box', blurb: null, readers: [{ user: 'u-ray', name: 'Ray Tetzloff', avatar: null }] },
  { id: 'b-coo', name: 'The COO’s box', blurb: null, readers: [{ user: 'u-coo', name: 'Pat Olson', avatar: null }] },
];
const page0 = (extra: Record<string, unknown> = {}) => ({ ok: true, can_set_up: false, reads: false, boxes: BOXES, board: [], ...extra });

test('leaving one anonymously keeps its key and offers the private link', async ({ page }) => {
  await signedIn(page);
  const sent = await server(page, {
    suggestion_page: () => page0(),
    my_suggestions: () => ({ ok: true, suggestions: [] }),
    submit_suggestion: () => ({ ok: true, id: 's-1', key: KEY }),
  });
  await page.goto('/suggestions');
  const form = page.getByRole('form', { name: 'Leave a suggestion' });
  await form.getByRole('radio', { name: /The CEO’s box/ }).check();
  await form.getByLabel('Your suggestion').fill('The on-call rota is unfair to the night shift.');
  await form.getByLabel(/Leave my name off/).check();
  await form.getByRole('button', { name: 'Put it in the box' }).click();
  await expect(page.getByText('Thank you. It’s in the box.')).toBeVisible();
  await expect(page.getByLabel('Your private link')).toHaveValue(new RegExp(`/suggestions#key=${KEY}$`));
  expect(sent.find((s) => s.fn === 'submit_suggestion')?.args).toEqual({
    p_box: 'b-ceo', p_body: 'The on-call rota is unfair to the night shift.', p_anonymous: true,
  });
  // kept in this browser, and asked about next time
  expect(await page.evaluate(() => localStorage.getItem('anagrimoire:suggestion-keys:v1'))).toContain(KEY);
});

test('a private link is kept, used, and taken out of the address', async ({ page }) => {
  await signedIn(page);
  const sent = await server(page, {
    suggestion_page: () => page0(),
    my_suggestions: (args) => ({
      ok: true,
      suggestions: (args.p_keys as string[]).includes(KEY)
        ? [{ id: 's-1', box: 'The CEO’s box', body: 'The on-call rota is unfair to the night shift.', at: '2026-11-17T15:00:00Z',
             anonymous: true, key: KEY, read: true,
             thread: [{ id: 'm-1', author: 'reader', body: 'Moving to a four-week rota.', public: false, at: '2026-11-18T15:00:00Z', by: 'Ray Tetzloff' }] }]
        : [],
    }),
    suggestion_follow_up: () => ({ ok: true }),
  });
  await page.goto(`/suggestions#key=${KEY}`);
  const mine = page.getByRole('listitem', { name: 'Your suggestion to The CEO’s box' });
  await expect(mine).toContainText('Moving to a four-week rota.');
  await expect(mine).toContainText('Answered');
  await expect(page).toHaveURL(/\/suggestions$/);
  await mine.getByLabel('Write back').fill('Will weekends count?');
  await mine.getByRole('button', { name: 'Send' }).click();
  await expect.poll(() => sent.find((s) => s.fn === 'suggestion_follow_up')?.args).toEqual({
    p_id: 's-1', p_key: KEY, p_body: 'Will weekends count?',
  });
});

test('the board shows the suggestion and the answer, never a sender', async ({ page }) => {
  await signedIn(page);
  await server(page, {
    suggestion_page: () => page0({ board: [{
      id: 's-2', box: 'The COO’s box', body: 'A second microwave in the break room.', sent_at: '2026-11-10T15:00:00Z',
      at: '2026-11-12T15:00:00Z', replies: [{ body: 'Ordered; it arrives Monday.', at: '2026-11-12T15:00:00Z', by: 'Pat Olson' }] }] }),
    my_suggestions: () => ({ ok: true, suggestions: [] }),
  });
  await page.goto('/suggestions');
  const board = page.getByRole('region', { name: 'You said, we did' });
  await expect(board).toContainText('“A second microwave in the break room.”');
  await expect(board).toContainText('Pat Olson');
  await expect(board).toContainText('Ordered; it arrives Monday.');
});

const INBOX = { ok: true, boxes: [{ id: 'b-ceo', name: 'The CEO’s box', suggestions: [
  { id: 's-a', body: 'The on-call rota is unfair to the night shift.', at: '2026-11-17T15:00:00Z', from: null,
    anonymous: true, read: false, archived: false, thread: [] },
  { id: 's-n', body: 'Could the break room get a second microwave?', at: '2026-11-16T15:00:00Z', from: 'Ann Lee',
    anonymous: false, read: true, archived: false, thread: [] },
] }] };

test('a reader answers on the board, or to the sender alone', async ({ page }) => {
  await signedIn(page);
  const sent = await server(page, {
    suggestion_page: () => page0({ reads: true }),
    my_suggestions: () => ({ ok: true, suggestions: [] }),
    suggestion_inbox: () => INBOX,
    reply_to_suggestion: () => ({ ok: true }),
    mark_suggestion: () => ({ ok: true }),
  });
  await page.goto('/suggestions');
  const inbox = page.getByRole('region', { name: 'Your box' });
  await expect(inbox.getByText('The CEO’s box (1 new)')).toBeVisible();
  const anon = inbox.getByRole('listitem', { name: 'Suggestion from somebody anonymous' });
  await expect(anon).toContainText('Anonymous');
  await anon.getByLabel('Answer').fill('Moving to a four-week rota from January.');
  await anon.getByLabel(/On the board, for everybody/).check();
  await anon.getByRole('button', { name: 'Send the answer' }).click();
  await expect.poll(() => sent.find((s) => s.fn === 'reply_to_suggestion')?.args).toEqual({
    p_id: 's-a', p_body: 'Moving to a four-week rota from January.', p_public: true,
  });
  const named = inbox.getByRole('listitem', { name: 'Suggestion from Ann Lee' });
  await expect(named.getByLabel('Just to Ann Lee')).toBeChecked();
  await named.getByRole('button', { name: 'File away' }).click();
  await expect.poll(() => sent.find((s) => s.fn === 'mark_suggestion')?.args).toEqual({ p_id: 's-n', p_read: true, p_archived: true });
});

test('the administrator sets up a box, and sees counts, not contents', async ({ page }) => {
  await signedIn(page);
  const sent = await server(page, {
    suggestion_page: () => page0({ can_set_up: true, boxes: [] }),
    my_suggestions: () => ({ ok: true, suggestions: [] }),
    suggestion_boxes_sheet: () => ({ ok: true, boxes: [
      { id: 'b-ceo', name: 'The CEO’s box', blurb: null, active: true, position: 0, readers: [{ user: 'u-ray', name: 'Ray Tetzloff' }], count: 4 }] }),
    find_entrants: () => ({ ok: true, people: [{ user: 'u-coo', email: 'pat@example.net', name: 'Pat Olson' }] }),
    save_suggestion_box: () => ({ ok: true, id: 'b-coo' }),
  });
  await page.goto('/suggestions');
  await expect(page.getByText('There are no suggestion boxes up yet.')).toBeVisible();
  const setup = page.getByRole('region', { name: 'Setting up the boxes' });
  await expect(setup).toContainText('Read by Ray Tetzloff · 4 suggestions');
  await setup.getByRole('button', { name: 'New box' }).click();
  const form = page.getByRole('form', { name: 'New box' });
  await form.getByLabel('Name').fill('The COO’s box');
  await form.getByLabel('Add a reader').fill('Pat');
  await form.getByRole('button', { name: /Pat Olson/ }).click();
  await expect(form.getByRole('button', { name: 'Take Pat Olson off' })).toBeVisible();
  await form.getByRole('button', { name: 'Put the box up' }).click();
  await expect.poll(() => sent.find((s) => s.fn === 'save_suggestion_box')?.args).toEqual({
    p_id: null, p_name: 'The COO’s box', p_blurb: null, p_readers: ['u-coo'], p_active: true, p_position: 1,
  });
});

test('a reader’s page has no WCAG A/AA violations axe can see', async ({ page }) => {
  await signedIn(page);
  await server(page, {
    suggestion_page: () => page0({ reads: true }),
    my_suggestions: () => ({ ok: true, suggestions: [] }),
    suggestion_inbox: () => INBOX,
  });
  await page.goto('/suggestions');
  await expect(page.getByRole('region', { name: 'Your box' })).toBeVisible();
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const summary = results.violations.map((v) => ({ id: v.id, nodes: v.nodes.length, sample: v.nodes[0]?.html.slice(0, 300), why: v.nodes[0]?.failureSummary }));
  expect(summary, JSON.stringify(summary, null, 2)).toEqual([]);
});
