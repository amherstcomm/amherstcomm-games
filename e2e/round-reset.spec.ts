// Giving one player another go at one thing in a round.
//
// The server does the resetting (pausereset.sql). What the page owes: the
// button only on a round that is on, a search for the person, where they got
// to on each game and session, one reset per item -- asked for by name, since
// it deletes somebody's progress -- and the server's answer said back.
import { expect, test } from './fixtures';

const easternToday = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
const plus = (date: string, n: number) =>
  new Date(new Date(`${date}T12:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);
const TODAY = easternToday();

const TOURNAMENTS = [
  {
    id: 't1', name: 'Ownership Cup', difficulty: 'hard',
    starts_on: plus(TODAY, -10), ends_on: plus(TODAY, 20),
    rounds: [
      // over: nothing to give another go at
      { id: 'r1', starts_on: plus(TODAY, -8), ends_on: plus(TODAY, -6), games: ['hive'], started: true },
      // on
      { id: 'r2', starts_on: plus(TODAY, -1), ends_on: plus(TODAY, 3), games: ['weave', 'hive'],
        trivia: [{ session_id: 's1', title: 'ESOP Basics', mode: 'open', state: 'live', weight: 1 }],
        started: true },
      // not yet
      { id: 'r3', starts_on: plus(TODAY, 5), ends_on: plus(TODAY, 6), games: ['grid'], started: false },
    ],
  },
];

async function portal(page: import('@playwright/test').Page) {
  const resets: Record<string, unknown>[] = [];
  const player = {
    ok: true, name: 'Bea Smith', on: true,
    games: [
      { game: 'weave', name: 'Weave', status: 'finished', hints: 2, resets: 0 },
      { game: 'hive', name: 'Hive', status: 'not started', hints: 0, resets: 0 },
    ],
    sessions: [{ session_id: 's1', title: 'ESOP Basics', answered: 2, total: 6 }],
  };
  await page.route('**/rest/v1/rpc/**', (route) => {
    const fn = route.request().url().match(/\/rpc\/(\w+)/)?.[1] ?? '';
    const args = JSON.parse(route.request().postData() ?? '{}');
    const reply = (body: unknown) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (fn === 'tournaments_sheet') return reply({ ok: true, tournaments: TOURNAMENTS });
    if (fn === 'my_capabilities') return reply(['games.setup', 'site.settings', 'users.manage']);
    if (fn === 'my_sessions' || fn === 'contests_sheet') return reply(fn === 'my_sessions' ? [] : { ok: true, contests: [] });
    if (fn === 'find_entrants') {
      return reply({ ok: true, people: [{ user: 'u-bea', email: 'bea.smith@example.net', name: 'Bea Smith' }] });
    }
    if (fn === 'round_player') return reply(player);
    if (fn === 'reset_round_player') {
      resets.push(args);
      // what the server does: the board is gone and the reset is counted
      const g = player.games.find((x) => x.game === args.p_game);
      if (g) {
        g.status = 'not started';
        g.hints = 0;
        g.resets += 1;
      }
      const s = player.sessions.find((x) => x.session_id === args.p_session);
      if (s) s.answered = 0;
      return reply({ ok: true, attempt: g?.resets });
    }
    return route.fallback();
  });
  return resets;
}

test('a player is given another go at one game, and only that', async ({ page }) => {
  const resets = await portal(page);
  page.on('dialog', (d) => void d.accept());
  await page.goto('/admin/tournaments');

  const rounds = page.getByRole('list', { name: 'Rounds of Ownership Cup' });
  // Only on the round that is on.
  await expect(rounds.getByRole('button', { name: 'Reset a player' })).toHaveCount(1);
  await rounds.getByRole('button', { name: 'Reset a player' }).click();

  const panel = page.getByRole('region', { name: 'Reset a player in Round 2' });
  await panel.getByRole('textbox', { name: 'Who needs another go?' }).fill('Bea');
  await panel.getByRole('button', { name: /Bea Smith/ }).click();
  await expect(panel.getByText('Resetting Bea Smith')).toBeVisible();

  // Where they got to on each thing, before deciding.
  const has = panel.getByRole('list', { name: /What Bea Smith has in Round 2/ });
  await expect(has).toContainText('Finished · 2 hints');
  await expect(has).toContainText('Answered 2 of 6');
  // Nothing to reset on a game they have not started.
  await expect(has.getByRole('button', { name: 'Reset Hive' })).toBeDisabled();

  await has.getByRole('button', { name: 'Reset Weave' }).click();
  await expect(panel.getByText('Weave reset. Bea Smith can start it again.')).toBeVisible();
  expect(resets).toEqual([{ p_round: 'r2', p_user: 'u-bea', p_game: 'weave', p_session: null }]);
  // And the list says so, read back from the server.
  await expect(has).toContainText('reset once already');
});

test('a session is reset on its own, back to question one', async ({ page }) => {
  const resets = await portal(page);
  page.on('dialog', (d) => void d.accept());
  await page.goto('/admin/tournaments');
  await page.getByRole('list', { name: 'Rounds of Ownership Cup' })
    .getByRole('button', { name: 'Reset a player' }).click();
  const panel = page.getByRole('region', { name: 'Reset a player in Round 2' });
  await panel.getByRole('textbox', { name: 'Who needs another go?' }).fill('Bea');
  await panel.getByRole('button', { name: /Bea Smith/ }).click();

  await panel.getByRole('button', { name: 'Reset ESOP Basics' }).click();
  // The message first: it only appears once the server has answered, so the
  // request is certainly in by then.
  await expect(panel.getByText('ESOP Basics reset. Bea Smith can start it again.')).toBeVisible();
  expect(resets).toEqual([{ p_round: 'r2', p_user: 'u-bea', p_game: null, p_session: 's1' }]);
});

test('saying no to the question resets nothing', async ({ page }) => {
  const resets = await portal(page);
  page.on('dialog', (d) => void d.dismiss());
  await page.goto('/admin/tournaments');
  await page.getByRole('list', { name: 'Rounds of Ownership Cup' })
    .getByRole('button', { name: 'Reset a player' }).click();
  const panel = page.getByRole('region', { name: 'Reset a player in Round 2' });
  await panel.getByRole('textbox', { name: 'Who needs another go?' }).fill('Bea');
  await panel.getByRole('button', { name: /Bea Smith/ }).click();
  await panel.getByRole('button', { name: 'Reset Weave' }).click();
  // Something that did not happen cannot be waited for, so give a request
  // that should not exist the time a real one would take, then look.
  await page.waitForTimeout(500);
  expect(resets).toEqual([]);
});
