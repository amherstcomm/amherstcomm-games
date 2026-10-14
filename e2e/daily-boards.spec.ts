// A new board each day, for chosen games in a round.
//
// A several-day Guess the Word round with a different word each day is one
// placing for the round, but a player needs to be told that coming back
// tomorrow means a new word -- not that they have had their one attempt. The
// server serves the right day's board (dailyboards.sql); what the page owes is
// saying which kind of board each game is, on the tournament page and on the
// game itself.
import { expect, test } from './fixtures';

const easternToday = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
const plus = (date: string, n: number) =>
  new Date(new Date(`${date}T12:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);

const TODAY = easternToday();
const START = plus(TODAY, -1);
const ENDS = plus(START, 30);

// Guess changes daily; Hive is one board for the round, as before.
const ROUND = {
  tournament_id: 't1',
  tournament: 'Ownership Cup',
  difficulty: 'hard',
  tournament_starts_on: START,
  tournament_ends_on: ENDS,
  round_id: 'r1', number: 1, of: 3,
  starts_on: START, ends_on: plus(START, 4),
  games: ['words', 'hive'],
  game_weights: {},
  daily_games: ['words'],
  trivia: [],
  contests: [],
};

const STANDINGS = {
  ok: true,
  tournament: { id: 't1', name: 'Ownership Cup', difficulty: 'hard' },
  table: [],
  rounds: [{ id: 'r1', number: 1, starts_on: START, ends_on: plus(START, 4), boards: {},
             trivia: [], contests: [], daily_games: ['words'] }],
};

async function on(page: import('@playwright/test').Page) {
  await page.route('**/rest/v1/rpc/**', (route) => {
    const fn = route.request().url().match(/\/rpc\/(\w+)/)?.[1] ?? '';
    const reply = (body: unknown) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (fn === 'current_rounds') return reply([ROUND]);
    if (fn === 'current_round') return reply(ROUND);
    if (fn === 'read_availability') return reply([]);
    if (fn === 'current_tournament') {
      return reply({ id: 't1', name: 'Ownership Cup', difficulty: 'hard', starts_on: START, ends_on: ENDS,
                     locks_site: false, next_round_starts_on: null });
    }
    if (fn === 'tournament_standings') return reply(STANDINGS);
    if (fn === 'round_puzzle') return reply(null);
    return route.fallback();
  });
}

test('the tournament page says which games have a new board each day', async ({ page }) => {
  await on(page);
  await page.goto('/tournament');

  await expect(page.getByText(/Those marked "new board each day" have a fresh one every day/)).toBeVisible();
  const games = page.getByLabel('In this round');
  await expect(games.getByRole('link', { name: /Guess the Word/ })).toContainText('New board each day');
  await expect(games.getByRole('link', { name: /Hive/ })).not.toContainText('New board each day');
});

test("a daily game's page says one attempt a day, a one-board game's says one attempt", async ({ page }) => {
  await on(page);
  await page.goto('/tournament/guess');
  const banner = page.getByRole('region', { name: 'Tournament round' });
  await expect(banner).toContainText('A new board each day: one attempt a day');

  await page.goto('/tournament/hive');
  await expect(page.getByRole('region', { name: 'Tournament round' })).toContainText(
    'One attempt: your first finish is the one that counts.'
  );
});
