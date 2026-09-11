// The tournament's standings, on its page.
//
// The ranking and the points are the database's (supabase/tests/standings.sql
// proves them); what the page owes is showing them the way the site shows
// every leaderboard -- the same labels, so a round's times read as times -- and
// keeping the current round's boards apart from the rounds before it.
import { expect, test } from './fixtures';

const easternToday = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
const plus = (date: string, n: number) =>
  new Date(new Date(`${date}T12:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);

const START = plus(easternToday(), -1);
const ROUND = {
  tournament_id: 't1',
  tournament: 'Ownership Cup',
  difficulty: 'hard',
  tournament_starts_on: plus(START, -14),
  tournament_ends_on: plus(START, 14),
  round_id: 'r2',
  starts_on: START,
  ends_on: plus(START, 6),
  games: ['weave', 'hive'],
  number: 2,
  of: 3,
};

const STANDINGS = {
  ok: true,
  tournament: { id: 't1', name: 'Ownership Cup', difficulty: 'hard' },
  table: [
    { name: 'Ada', points: 19, wins: 1, placed: 2 },
    { name: 'Cy', points: 17, wins: 0, placed: 2 },
    { name: 'Bea', points: 10, wins: 1, placed: 1 },
  ],
  rounds: [
    {
      id: 'r1',
      number: 1,
      starts_on: plus(START, -14),
      ends_on: plus(START, -8),
      boards: { hive: [{ name: 'Bea', value: 88, detail: 1 }] },
    },
    {
      id: 'r2',
      number: 2,
      starts_on: START,
      ends_on: plus(START, 6),
      boards: {
        weave: [
          { name: 'Ada', value: 1, detail: 95000 },
          { name: 'Cy', value: 1, detail: 140000 },
        ],
      },
    },
  ],
};

async function tournament(page: import('@playwright/test').Page) {
  await page.route('**/rest/v1/rpc/**', (route) => {
    const fn = route.request().url().match(/\/rpc\/(\w+)/)?.[1] ?? '';
    const reply = (body: unknown) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (fn === 'current_round') return reply(ROUND);
    if (fn === 'tournament_standings') return reply(STANDINGS);
    return route.fallback();
  });
}

test('the tournament table ranks the players by placement points', async ({ page }) => {
  await tournament(page);
  await page.goto('/tournament');
  const table = page.getByRole('region', { name: 'Tournament table' });
  await expect(table.getByRole('listitem')).toHaveText([/Ada.*19 pts.*1 win/, /Cy.*17 pts.*0 wins/, /Bea.*10 pts.*1 win/]);
});

// The same labels as the everyday boards: a Weave round reads as times, which
// is what the round was ranked on.
test("this round's boards read the way the site's leaderboards do", async ({ page }) => {
  await tournament(page);
  await page.goto('/tournament');
  const round = page.getByRole('region', { name: "This round's standings" });
  await expect(round).toContainText('best 1:35');
  await expect(round.getByRole('listitem').first()).toContainText('Ada');
});

test('and earlier rounds are there, folded away', async ({ page }) => {
  await tournament(page);
  await page.goto('/tournament');
  const earlier = page.locator('details', { hasText: 'Round 1' });
  await expect(earlier).toBeVisible();
  await earlier.locator('summary').click();
  await expect(earlier).toContainText('Bea');
});
