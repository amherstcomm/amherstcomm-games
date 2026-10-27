// Avatars, and avatars on a trivia's answers.
//
// The server holds the rules (avatars.sql): who may set what, blocking, the
// site switch, and when who-picked-what may be seen. What the pages owe:
// somebody picks a picture on a colour; somebody blocked is told so and
// offered nothing; an organiser takes one down from the people page; a host
// chooses when avatars show; and the answers carry the avatars of the people
// who picked them, named for anybody who cannot see them.
import { expect, test } from './fixtures';

const SESSION = '6a5b4c3d-2e1f-4a0b-9c8d-7e6f5a4b3c2d';
type Sent = { fn: string; args: Record<string, unknown> };

/** A signed-in browser: supabase-js reads its session from here and, while
 *  it has not expired, asks nobody. */
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

async function server(page: import('@playwright/test').Page, answers: Record<string, unknown>) {
  const sent: Sent[] = [];
  await page.route('**/rest/v1/rpc/**', (route) => {
    const fn = route.request().url().match(/\/rpc\/(\w+)/)?.[1] ?? '';
    const args = JSON.parse(route.request().postData() ?? '{}');
    sent.push({ fn, args });
    if (fn in answers) {
      const a = answers[fn];
      return route.fulfill({ status: 200, contentType: 'application/json',
                             body: JSON.stringify(typeof a === 'function' ? (a as (x: unknown) => unknown)(args) : a) });
    }
    return route.fallback();
  });
  return sent;
}

test('somebody picks a picture on a colour as their avatar', async ({ page }) => {
  await signedIn(page);
  const sent = await server(page, {
    my_avatar: { ok: true, avatar: null, blocked: false, off: false },
    set_my_avatar: { ok: true },
  });
  await page.goto('/account');
  const block = page.locator('[data-avatar]');
  await expect(block).toContainText('Without one, you are your initials');
  await block.getByRole('button', { name: 'Pick a picture' }).click();
  await block.getByRole('button', { name: 'Colour #059669' }).click();
  await block.getByRole('button', { name: 'Badger' }).click();
  await expect.poll(() => sent.find((s) => s.fn === 'set_my_avatar')?.args).toEqual({
    p_kind: 'preset', p_value: 'badger', p_color: '#059669',
  });
  await expect(block.getByRole('status')).toHaveText('Badger it is.');
});

test('any colour at all, from the full colour picker', async ({ page }) => {
  await signedIn(page);
  const sent = await server(page, {
    my_avatar: { ok: true, avatar: null, blocked: false, off: false },
    set_my_avatar: { ok: true },
  });
  await page.goto('/account');
  const block = page.locator('[data-avatar]');
  await block.getByRole('button', { name: 'Pick a picture' }).click();
  await block.getByLabel('Any colour').fill('#ff8800');
  await block.getByRole('button', { name: 'Llama' }).click();
  await expect.poll(() => sent.find((s) => s.fn === 'set_my_avatar')?.args).toEqual({
    p_kind: 'preset', p_value: 'llama', p_color: '#ff8800',
  });
});

test('a new colour for the picture you have, without picking it again', async ({ page }) => {
  await signedIn(page);
  const sent = await server(page, {
    my_avatar: { ok: true, avatar: { kind: 'preset', value: 'cow', color: '#2563eb' }, blocked: false, off: false },
    set_my_avatar: { ok: true },
  });
  await page.goto('/account');
  const block = page.locator('[data-avatar]');
  await block.getByRole('button', { name: 'Pick a picture' }).click();
  // nothing to save until the colour is different
  await expect(block.getByRole('button', { name: 'Use this colour' })).toHaveCount(0);
  await block.getByRole('button', { name: 'Colour #dc2626' }).click();
  await block.getByRole('button', { name: 'Use this colour' }).click();
  await expect.poll(() => sent.find((s) => s.fn === 'set_my_avatar')?.args).toEqual({
    p_kind: 'preset', p_value: 'cow', p_color: '#dc2626',
  });
});

test('somebody whose avatar was taken down is told so, and offered nothing to set', async ({ page }) => {
  await signedIn(page);
  await server(page, { my_avatar: { ok: true, avatar: null, blocked: true, off: false } });
  await page.goto('/account');
  const block = page.locator('[data-avatar]');
  await expect(block).toContainText('An organiser has turned off your avatar');
  await expect(block.getByRole('button', { name: /Upload a photo|Pick a picture/ })).toHaveCount(0);
});

const choice = (state: 'open' | 'revealed') => ({
  state, mode: 'live', yours: false, id: 'q1', kind: 'choice', prompt: 'Which came first?',
  payload: { options: ['Cheese curds', 'Brats'] }, position: 1, opened_at: new Date().toISOString(),
  seconds: null, now: new Date().toISOString(), mine: null,
  answer: state === 'revealed' ? { correct: ['Cheese curds'] } : null,
});
const PICKS = {
  ok: true, anonymous: 1,
  picks: [
    { option: 'Cheese curds', user: 'u-ada', name: 'Ada Lovelace', avatar: { kind: 'preset', value: 'badger', color: '#2563eb' } },
    { option: 'Cheese curds', user: 'u-bea', name: 'Bea Arthur', avatar: null },
    { option: 'Brats', user: 'u-cy', name: 'Cy Young', avatar: { kind: 'preset', value: 'baseball', color: '#dc2626' } },
  ],
};

test('at the reveal, the answers carry the avatars of who picked them', async ({ page }) => {
  await server(page, {
    current_item: choice('revealed'),
    item_avatars: PICKS,
    item_tally: { ok: true, total: 4, counts: { '"Cheese curds"': 2, '"Brats"': 1 } },
    my_standing: { ok: false },
  });
  await page.goto(`/live/${SESSION}`);
  const curds = page.getByRole('button', { name: /Cheese curds/ });
  await expect(curds.getByRole('img', { name: 'Picked by Ada Lovelace, Bea Arthur' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Brats/ }).getByRole('img', { name: 'Picked by Cy Young' })).toBeVisible();
  // a picture for Ada, initials for Bea
  await expect(curds).toContainText('🦡');
  await expect(curds).toContainText('BA');
});

test('and on the presenter screen, as people answer', async ({ page }) => {
  const sent = await server(page, {
    current_item: choice('open'),
    item_avatars: PICKS,
    session_door: { ok: true, title: 'Week one', code: 'K4TP', state: 'live', mode: 'live', total: 4, pending: 2,
                    position: 1, item_state: 'open' },
    presenter_view: { ok: true, answered: 4, responses: [] },
    session_leaderboard: { ok: true, rows: [] },
  });
  await page.goto(`/live/${SESSION}/host`);
  await expect(page.getByRole('img', { name: 'Picked by Ada Lovelace, Bea Arthur' })).toBeVisible();
  await expect.poll(() => sent.filter((s) => s.fn === 'item_avatars').length).toBeGreaterThan(0);
});

test('nothing is drawn when the session does not show them', async ({ page }) => {
  await server(page, {
    current_item: choice('revealed'),
    item_avatars: { ok: false, reason: 'off' },
    item_tally: { ok: true, total: 1, counts: { '"Brats"': 1 } },
    my_standing: { ok: false },
  });
  await page.goto(`/live/${SESSION}`);
  await expect(page.getByRole('button', { name: /Cheese curds/ })).toBeVisible();
  await expect(page.getByRole('img', { name: /Picked by/ })).toHaveCount(0);
});

test('an organiser takes somebody’s avatar down from the people page', async ({ page }) => {
  const sent = await server(page, {
    people_with_roles: { ok: true, people: [
      { user: 'u-pat', email: 'pat@example.net', name: 'Pat from HR', role: 'games.edit', grants: [],
        avatar: { kind: 'preset', value: 'owl', color: '#9333ea' }, avatar_blocked: false },
    ] },
    set_person_avatar: { ok: true },
  });
  page.once('dialog', (d) => void d.accept());
  await page.goto('/admin/people');
  const pat = page.locator('li', { hasText: 'Pat from HR' });
  await pat.getByRole('checkbox', { name: /Can have an avatar/ }).click();
  await expect.poll(() => sent.find((s) => s.fn === 'set_person_avatar')?.args).toEqual({
    p_user: 'u-pat', p_blocked: true,
  });
});
