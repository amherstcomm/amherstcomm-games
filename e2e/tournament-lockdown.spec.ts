// A tournament that is the whole site.
//
// When a tournament locks the site, availability reports two absences --
// site:outside-tournament and, unless it keeps them open, site:other-sessions
// -- and the page has to act on them: the front page and every ordinary game
// show the tournament instead, the game menu goes, the round's own games still
// play, and a session that is not the round's trivia is refused at its address.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from './fixtures';
import { DATA_DIR } from './global-setup';

const easternToday = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
const plus = (date: string, n: number) =>
  new Date(new Date(`${date}T12:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);

const START = plus(easternToday(), -1);
const ENDS = plus(START, 30);
const ROUND = {
  tournament_id: 't1',
  tournament: 'Ownership Cup',
  difficulty: 'hard',
  tournament_starts_on: START,
  tournament_ends_on: ENDS,
  round_id: 'r1',
  starts_on: START,
  ends_on: plus(START, 6),
  games: ['hive'],
  trivia: [{ session_id: 's-round', title: 'Round Trivia', mode: 'open', state: 'live', weight: 1 }],
  number: 1,
  of: 4,
};
const TOURNAMENT = {
  id: 't1',
  name: 'Ownership Cup',
  difficulty: 'hard',
  starts_on: START,
  ends_on: ENDS,
  locks_site: true,
  next_round_starts_on: plus(START, 8),
};

function roundHive() {
  const daily = JSON.parse(readFileSync(join(DATA_DIR, 'dev-daily-hive.json'), 'utf8'));
  return { ...daily, date: START };
}

async function locked(
  page: import('@playwright/test').Page,
  { round = ROUND as unknown, off = ['site:other-sessions', 'site:outside-tournament'] } = {}
) {
  const hive = roundHive();
  await page.route('**/rest/v1/rpc/**', (route) => {
    const fn = route.request().url().match(/\/rpc\/(\w+)/)?.[1] ?? '';
    const reply = (body: unknown) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (fn === 'read_availability') return reply(off);
    if (fn === 'current_round') return reply(round);
    if (fn === 'current_tournament') return reply(TOURNAMENT);
    if (fn === 'round_puzzle') return reply(hive);
    if (fn === 'tournament_standings') {
      return reply({ ok: true, tournament: { id: 't1', name: 'Ownership Cup', difficulty: 'hard' }, table: [], rounds: [] });
    }
    return route.fallback();
  });
}

test('the front page is the tournament, and the game menu is gone', async ({ page }) => {
  await locked(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Ownership Cup/ })).toBeVisible();
  await expect(page.getByText(`Until ${ENDS}, the tournament is the only thing on the site.`)).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Game modes' })).toHaveCount(0);
});

// A bookmark to the daily is not a way round it.
test("an ordinary game's address shows the tournament instead", async ({ page }) => {
  await locked(page);
  await page.goto('/daily/hive');
  await expect(page.getByRole('heading', { name: /Ownership Cup/ })).toBeVisible();
  await expect(page.getByRole('list', { name: 'In this round' })).toBeVisible();
});

// The round is played in the games, so the lock must not take them with it.
test("the round's own games still play", async ({ page }) => {
  await locked(page);
  await page.goto('/tournament/hive');
  await expect(page.getByRole('region', { name: 'Tournament round' })).toContainText('One attempt');
});

test('between rounds it says when the next one starts, with the standings', async ({ page }) => {
  await locked(page, { round: null });
  await page.goto('/');
  const between = page.getByRole('region', { name: 'Between rounds' });
  await expect(between).toContainText(`The next one starts ${plus(START, 8)}.`);
  await expect(between.getByRole('region', { name: 'Tournament table' })).toBeVisible();
});

// The session screen asks for its session as soon as it is drawn, so whether
// that request is made says whether the session was let in -- which a missing
// refusal alone cannot, since the refusal waits for the round to be known.
const asksForSession = (url: string) => /\/rpc\/(session_door|current_item)/.test(url);

test("a session that is not the round's trivia is refused", async ({ page }) => {
  await locked(page);
  const asked: string[] = [];
  page.on('request', (r) => asksForSession(r.url()) && asked.push(r.url()));
  await page.goto('/live/s-other');
  await expect(page.getByText(/Ownership Cup is the only thing running just now/)).toBeVisible();
  expect(asked).toEqual([]);
});

test("the round's own trivia is let in", async ({ page }) => {
  await locked(page);
  const asked = page.waitForRequest((r) => asksForSession(r.url()));
  await page.goto('/live/s-round');
  await asked;
  await expect(page.getByText(/is the only thing running just now/)).toHaveCount(0);
});

// Kept open, any session runs: an all-hands in the middle of the month.
test('a tournament that keeps sessions open lets any session in', async ({ page }) => {
  await locked(page, { off: ['site:outside-tournament'] });
  const asked = page.waitForRequest((r) => asksForSession(r.url()));
  await page.goto('/live/s-other');
  await asked;
  await expect(page.getByText(/is the only thing running just now/)).toHaveCount(0);
});

// And when nothing is locked, nothing changes.
test('with no lock the front page is the front page', async ({ page }) => {
  await locked(page, { off: [] });
  await page.goto('/');
  await expect(page.getByRole('navigation', { name: 'Game modes' })).toBeVisible();
});
