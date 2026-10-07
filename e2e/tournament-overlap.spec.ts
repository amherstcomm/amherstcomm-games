// Rounds that overlap.
//
// A week-long pumpkin contest round running across daily game rounds means
// several rounds on at once. The database keeps them apart (overlap.sql: no
// game in two rounds on the same day); what the page owes is finding the right
// one of several everywhere it used to assume one -- the tournament page shows
// each round with its own games, trivia, contests and prize, a game's address
// plays the round that has that game, a locked site lets in the trivia of any
// round on, and the front page says how many are on.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from './fixtures';
import { DATA_DIR } from './global-setup';

const easternToday = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
const plus = (date: string, n: number) =>
  new Date(new Date(`${date}T12:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);

const TODAY = easternToday();
const START = plus(TODAY, -1);
const ENDS = plus(START, 30);

const TOURNAMENT_FIELDS = {
  tournament_id: 't1',
  tournament: 'Ownership Cup',
  difficulty: 'hard',
  tournament_starts_on: START,
  tournament_ends_on: ENDS,
  tournament_prize: '$100 Gift Card',
  game_weights: {},
  of: 5,
};

// Three rounds on today, as current_rounds returns them: in round order.
const GUESS_WEEK = {
  ...TOURNAMENT_FIELDS,
  round_id: 'r2', number: 2, starts_on: START, ends_on: plus(START, 6),
  games: ['words'],
  trivia: [{ session_id: 's-two', title: 'ESOP Basics', mode: 'open', state: 'live', weight: 1 }],
  contests: [],
  prize: 'Lunch on the company',
};
const PUMPKINS = {
  ...TOURNAMENT_FIELDS,
  round_id: 'r3', number: 3, starts_on: START, ends_on: plus(START, 10),
  games: [],
  trivia: [],
  contests: [{ contest_id: 'c1', name: 'Pumpkin carving', phase: 'voting', votes_close_on: plus(TODAY, 3), weight: 2 }],
  prize: 'A day off',
};
const HIVE_DAY = {
  ...TOURNAMENT_FIELDS,
  round_id: 'r4', number: 4, starts_on: TODAY, ends_on: TODAY,
  games: ['hive'],
  trivia: [],
  contests: [],
  prize: '$25 Gift Card',
};
const ROUNDS = [GUESS_WEEK, PUMPKINS, HIVE_DAY];

const STANDINGS = {
  ok: true,
  tournament: { id: 't1', name: 'Ownership Cup', difficulty: 'hard', prize: '$100 Gift Card' },
  table: [{ name: 'Ada', points: 10, wins: 1, placed: 1 }],
  rounds: [
    { id: 'r1', number: 1, starts_on: plus(START, -3), ends_on: plus(START, -2), boards: {}, trivia: [], contests: [] },
    { id: 'r2', number: 2, starts_on: START, ends_on: plus(START, 6), boards: { guess: [{ name: 'Ada', value: 1, detail: 3 }] }, trivia: [], contests: [] },
    { id: 'r3', number: 3, starts_on: START, ends_on: plus(START, 10), boards: {}, trivia: [],
      contests: [{ contest_id: 'c1', name: 'Pumpkin carving', phase: 'voting', weight: 2, standings: [] }] },
    { id: 'r4', number: 4, starts_on: TODAY, ends_on: TODAY, boards: {}, trivia: [], contests: [] },
  ],
};

/** The round's hive, with letters the daily does not have, so the board on
 *  screen says which one was dealt. */
function roundHive() {
  const daily = JSON.parse(readFileSync(join(DATA_DIR, 'dev-daily-hive.json'), 'utf8'));
  const hard = { ...daily.byDifficulty.hard, center: 'q', outers: ['u', 'i', 'c', 'k', 'e', 'r'] };
  return { ...daily, date: TODAY, byDifficulty: { ...daily.byDifficulty, hard } };
}

async function on(
  page: import('@playwright/test').Page,
  { rounds = ROUNDS as unknown[], off = [] as string[], missing = false } = {}
) {
  const hive = roundHive();
  await page.route('**/rest/v1/rpc/**', (route) => {
    const fn = route.request().url().match(/\/rpc\/(\w+)/)?.[1] ?? '';
    const reply = (body: unknown) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (fn === 'current_rounds') {
      // A database that has not had this release's schema applied yet.
      if (missing) {
        return route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ code: 'PGRST202', message: 'Could not find the function public.current_rounds' }),
        });
      }
      return reply(rounds);
    }
    if (fn === 'current_round') return reply(rounds[0] ?? null);
    if (fn === 'read_availability') return reply(off);
    if (fn === 'current_tournament') {
      return reply({ id: 't1', name: 'Ownership Cup', difficulty: 'hard', starts_on: START, ends_on: ENDS,
                     locks_site: off.length > 0, next_round_starts_on: null });
    }
    if (fn === 'tournament_standings') return reply(STANDINGS);
    if (fn === 'round_puzzle') {
      const game = JSON.parse(route.request().postData() ?? '{}').p_game;
      return reply(game === 'hive' ? hive : null);
    }
    return route.fallback();
  });
}

test('the tournament page shows each round on, with its own things in it', async ({ page }) => {
  await on(page);
  await page.goto('/tournament');

  await expect(page.getByRole('heading', { name: /Ownership Cup/ })).toBeVisible();
  await expect(page.getByText(/3 rounds are on/)).toBeVisible();
  // The tournament's prize once, at the top; each round's in its own block.
  await expect(page.getByText('Overall prize: $100 Gift Card').first()).toBeVisible();

  const two = page.getByRole('region', { name: 'Round 2', exact: true });
  await expect(two.getByRole('heading', { name: /Round 2 of 5/ })).toBeVisible();
  await expect(two.getByText('This round: Lunch on the company')).toBeVisible();
  await expect(two.getByRole('link', { name: /Guess the Word/ })).toBeVisible();
  await expect(two.getByRole('link', { name: /ESOP Basics/ })).toBeVisible();

  // A round that is nothing but a contest -- the case rounds overlap for --
  // still has something to open.
  const three = page.getByRole('region', { name: 'Round 3', exact: true });
  await expect(three.getByText('This round: A day off')).toBeVisible();
  const contest = three.getByRole('link', { name: /Pumpkin carving/ });
  await expect(contest).toContainText('worth 2×');
  await expect(contest).toHaveAttribute('href', '/contest/c1');

  const four = page.getByRole('region', { name: 'Round 4', exact: true });
  await expect(four.getByRole('link', { name: /Hive/ })).toBeVisible();
  // Nothing from one round leaks into another's block.
  await expect(four.getByRole('link', { name: /Guess the Word|Pumpkin/ })).toHaveCount(0);

  // And the standings give each round on its own boards.
  await expect(page.getByRole('region', { name: "Round 2's standings" })).toBeVisible();
  await expect(page.getByRole('region', { name: "Round 4's standings" })).toBeVisible();
  // Round 1 is over, so it is folded away with the earlier rounds.
  await expect(page.getByText(/Round 1 · /)).toBeVisible();
});

test("a game's address plays the round that has that game", async ({ page }) => {
  await on(page);
  await page.goto('/tournament/hive');
  const banner = page.getByRole('region', { name: 'Tournament round' });
  await expect(banner).toContainText('Round 4 of 5');
  // The round's own board, by its letters.
  await expect(page.getByText(/^q$/i).first()).toBeVisible();

  await page.goto('/tournament/guess');
  await expect(page.getByRole('region', { name: 'Tournament round' })).toContainText('Round 2 of 5');
});

test("a game in none of today's rounds says so", async ({ page }) => {
  await on(page);
  await page.goto('/tournament/grid');
  await expect(page.getByText("That game isn't in any of today's rounds.")).toBeVisible();
  await expect(page.getByRole('button', { name: /^Practice$/ })).toHaveCount(0);
});

test('the front page says how many rounds are on', async ({ page }) => {
  await on(page);
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Ownership Cup: rounds 2, 3 and 4 of 5 are on' })).toBeVisible();
});

// Locked to the tournament, a session is let in if it is the trivia of any
// round on -- not only the first one current_rounds happened to list.
test('a locked site lets in the trivia of any round on', async ({ page }) => {
  await on(page, {
    rounds: [PUMPKINS, GUESS_WEEK, HIVE_DAY],
    off: ['site:other-sessions', 'site:outside-tournament'],
  });
  const asked = page.waitForRequest((r) => /\/rpc\/(session_door|current_item)/.test(r.url()));
  await page.goto('/live/s-two');
  await asked;
  await expect(page.getByText(/is the only thing running just now/)).toHaveCount(0);
});

// The site deploys on merge and the schema is applied by hand afterwards. In
// that gap the live tournament must not read as having nothing on.
test('before the schema is applied, the page still shows the round on', async ({ page }) => {
  await on(page, { missing: true });
  await page.goto('/tournament');
  await expect(page.getByText(/Round 2 of 5/)).toBeVisible();
  await expect(page.getByText('No tournament round is on today.')).toHaveCount(0);
});
