// Reopening a closed session, and closing one only on purpose.
//
// A session counting in a running round was found closed, nobody remembered
// closing it, and a closed session could not be opened again from anywhere on
// the site. The server undoes the whole close (reopening.sql); what the page
// owes is a way to ask for it where a host looks -- the presenter screen and
// the session's own page -- and a Close that asks first, because on a session
// played on your own time it is the big button on the host screen.
import { expect, test } from './fixtures';

const SESSION = '5f7c2a10-3b4d-4e8f-9a12-6c0d1e2f3a4b';

const DOOR = {
  ok: true,
  title: 'About Us Trivia',
  code: 'K4TP',
  mode: 'open',
  total: 6,
  pending: 0,
  position: null,
  item_state: null,
  players: 7,
};

async function hosting(page: import('@playwright/test').Page, state: 'live' | 'closed') {
  const actions: string[] = [];
  const door = { ...DOOR, state };
  await page.route('**/rest/v1/rpc/**', (route) => {
    const fn = route.request().url().match(/\/rpc\/(\w+)/)?.[1] ?? '';
    const reply = (b: unknown) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
    if (fn === 'advance_session') {
      const action = JSON.parse(route.request().postData() ?? '{}').p_action as string;
      actions.push(action);
      if (action === 'reopen') door.state = 'live';
      if (action === 'close') door.state = 'closed';
      return reply({ ok: true, state: door.state, schedule_cleared: false, code: 'K4TP' });
    }
    if (fn === 'session_door') return reply(door);
    if (fn === 'session_leaderboard') return reply({ ok: true, scored: 4, standings: [] });
    if (fn === 'my_capabilities') return reply(['games.setup']);
    if (fn === 'session_sheet') {
      return reply({
        ok: true,
        session: { id: SESSION, title: 'About Us Trivia', code: 'K4TP', state: door.state, mode: 'open' },
        items: [],
        kinds: [],
      });
    }
    return reply({});
  });
  return actions;
}

test('a closed session can be reopened from the presenter screen', async ({ page }) => {
  const actions = await hosting(page, 'closed');
  await page.goto(`/live/${SESSION}/host`);
  await page.getByRole('button', { name: 'Reopen it' }).click();
  await expect(page.getByText('Reopened.')).toBeVisible();
  expect(actions).toEqual(['reopen']);
  // and once it is open again, the host's one move is closing it
  await expect(page.getByRole('button', { name: 'Close it' })).toBeVisible();
});

test('and from the session page, which used to say "Finished." and nothing else', async ({ page }) => {
  const actions = await hosting(page, 'closed');
  await page.goto(`/sessions/${SESSION}`);
  await expect(page.getByText('Finished.')).toBeVisible();
  await page.getByRole('button', { name: 'Reopen it' }).click();
  await expect(page.getByText('Open for playing.')).toBeVisible();
  expect(actions).toEqual(['reopen']);
});

test('closing asks first, by name, and saying no closes nothing', async ({ page }) => {
  const actions = await hosting(page, 'live');
  let asked = '';
  page.on('dialog', (d) => {
    asked = d.message();
    void d.dismiss();
  });
  await page.goto(`/live/${SESSION}/host`);
  await page.getByRole('button', { name: 'Close it' }).click();
  await expect.poll(() => asked).toContain('Close About Us Trivia?');
  await page.waitForTimeout(300);
  expect(actions).toEqual([]);
});

test('and saying yes closes it', async ({ page }) => {
  const actions = await hosting(page, 'live');
  page.on('dialog', (d) => void d.accept());
  await page.goto(`/live/${SESSION}/host`);
  await page.getByRole('button', { name: 'Close it' }).click();
  await expect.poll(() => actions).toEqual(['close']);
  await expect(page.getByRole('button', { name: 'Reopen it' })).toBeVisible();
});
