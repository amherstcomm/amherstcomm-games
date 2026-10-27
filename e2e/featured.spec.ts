// Featured on the home page.
//
// The server holds the rules (featured.sql): who may feature what, the dates,
// and dropping a thing once it is over. What the pages owe: the home page
// draws a card per feature, worded for its kind, linking to it; trivia cards
// go with sessions switched off; and the admin tab lists what is featured and
// why anything is not showing, features a new thing, and stops featuring one.
import { expect, test } from './fixtures';

type Sent = { fn: string; args: Record<string, unknown> };

async function server(page: import('@playwright/test').Page, answers: Record<string, unknown>) {
  const sent: Sent[] = [];
  await page.route('**/rest/v1/rpc/**', (route) => {
    const fn = route.request().url().match(/\/rpc\/(\w+)/)?.[1] ?? '';
    const args = JSON.parse(route.request().postData() ?? '{}');
    sent.push({ fn, args });
    if (fn in answers) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(answers[fn]) });
    }
    return route.fallback();
  });
  return sent;
}

const soon = new Date(Date.now() + 2 * 86400_000).toISOString();
const FEATURES = {
  ok: true,
  features: [
    { id: 'f1', kind: 'session', ref: 's1', blurb: '', image: null,
      item: { title: 'Friday Trivia', state: 'live', mode: 'live' } },
    { id: 'f2', kind: 'giveaway', ref: 'g1', blurb: 'Win Bucks tickets: answer five questions', image: null,
      item: { title: 'Bucks tickets', status: 'open', entries_close_at: soon, entered: false } },
    { id: 'f3', kind: 'contest', ref: 'c1', blurb: '', image: null,
      item: { title: 'Desk Photos', phase: 'voting', votes_close_on: '2026-11-06' } },
    { id: 'f4', kind: 'tournament', ref: 't1', blurb: '', image: null,
      item: { title: 'Ownership Cup', on: true, ends_on: '2026-10-31' } },
  ],
};

test('the home page draws a card for each featured thing, linking to it', async ({ page }) => {
  await server(page, { home_features: FEATURES });
  await page.goto('/');
  const strip = page.getByRole('region', { name: 'Featured' });
  const cards = strip.getByRole('article');
  await expect(cards).toHaveCount(4);
  await expect(cards.nth(0)).toContainText('Trivia');
  await expect(cards.nth(0)).toContainText('Live now');
  await expect(cards.nth(0).getByRole('link', { name: 'Join' })).toHaveAttribute('href', '/live/s1');
  await expect(cards.nth(1)).toContainText('Win Bucks tickets: answer five questions');
  await expect(cards.nth(1)).toContainText('Entries close');
  await expect(cards.nth(1).getByRole('link', { name: 'Enter' })).toHaveAttribute('href', '/giveaways/g1');
  await expect(cards.nth(2).getByRole('link', { name: 'Vote' })).toHaveAttribute('href', '/contest/c1');
  await expect(cards.nth(3)).toContainText('On now');
  await expect(cards.nth(3).getByRole('link', { name: 'Play' })).toHaveAttribute('href', '/tournament');
});

test('with sessions switched off, the trivia card goes with them', async ({ page }) => {
  await server(page, { home_features: FEATURES, read_availability: ['site:sessions'] });
  await page.goto('/');
  const strip = page.getByRole('region', { name: 'Featured' });
  await expect(strip.getByRole('article')).toHaveCount(3);
  await expect(strip).not.toContainText('Friday Trivia');
});

test('nothing featured, no strip', async ({ page }) => {
  await server(page, { home_features: { ok: true, features: [] } });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 2 }).first()).toBeVisible();
  await expect(page.getByRole('region', { name: 'Featured' })).toHaveCount(0);
});

const SHEET = {
  ok: true,
  can: { session: true, giveaway: false, contest: true, tournament: true },
  features: [
    { id: 'f1', kind: 'session', ref: 's1', blurb: '', image: null, item: { title: 'Friday Trivia' },
      title: 'Friday Trivia', starts_at: null, ends_at: null, position: 0, showing: true, why_not: null },
    { id: 'f2', kind: 'giveaway', ref: 'g1', blurb: '', image: null, item: null,
      title: 'Bucks tickets', starts_at: null, ends_at: null, position: 1, showing: false, why_not: 'over, or not open yet' },
  ],
  choices: {
    session: [{ id: 's1', title: 'Friday Trivia', state: 'live' }],
    giveaway: [],
    contest: [{ id: 'c1', title: 'Desk Photos', state: 'entries' }],
    tournament: [{ id: 't1', title: 'Ownership Cup', state: 'on' }],
  },
};

test('the admin tab says what is showing and why anything is not', async ({ page }) => {
  await server(page, { home_features_sheet: SHEET });
  await page.goto('/admin/featured');
  const list = page.getByRole('list', { name: 'Featured' });
  await expect(list.getByRole('listitem').nth(0)).toContainText('On the home page');
  await expect(list.getByRole('listitem').nth(1)).toContainText('Not showing: over, or not open yet');
  // a giveaway is for the people who run giveaways
  await expect(list.getByRole('listitem').nth(1).getByRole('button', { name: /Stop featuring/ })).toHaveCount(0);
});

test('an organiser features a contest, with a line of their own and dates', async ({ page }) => {
  const sent = await server(page, { home_features_sheet: SHEET, save_home_feature: { ok: true, id: 'f9' } });
  await page.goto('/admin/featured');
  await page.getByRole('button', { name: 'Feature something' }).click();
  const form = page.getByRole('region', { name: 'Feature something' });
  // only the kinds this reader may feature are offered
  await expect(form.getByLabel('What kind').locator('option')).toHaveText(['Trivia', 'Contest', 'Tournament']);
  await form.getByLabel('What kind').selectOption('contest');
  await form.getByLabel('Which one').selectOption('c1');
  await form.getByLabel(/A line of your own/).fill('Show us your desk');
  await form.getByLabel(/^Until/).fill('2026-11-06T17:00');
  await form.getByRole('button', { name: 'Feature it' }).click();
  await expect.poll(() => sent.find((s) => s.fn === 'save_home_feature')?.args).toMatchObject({
    p_kind: 'contest', p_ref: 'c1', p_blurb: 'Show us your desk', p_image: null, p_starts_at: null,
    p_ends_at: new Date('2026-11-06T17:00').toISOString(),
  });
});

test('and stops featuring one', async ({ page }) => {
  const sent = await server(page, { home_features_sheet: SHEET, remove_home_feature: { ok: true } });
  await page.goto('/admin/featured');
  await page.getByRole('button', { name: 'Stop featuring Friday Trivia' }).click();
  await expect.poll(() => sent.find((s) => s.fn === 'remove_home_feature')?.args).toEqual({ p_id: 'f1' });
});
