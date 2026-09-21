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
  game_weights: { weave: 3 },
  trivia: [
    { session_id: 's2', title: 'ESOP Basics', mode: 'open', state: 'live', weight: 2 },
    { session_id: 's3', title: 'Next Week', mode: 'live', state: 'draft', weight: 1 },
  ],
  number: 2,
  of: 3,
  prize: 'Lunch on the company',
  tournament_prize: '$250 and the trophy',
};

const STANDINGS = {
  ok: true,
  tournament: { id: 't1', name: 'Ownership Cup', difficulty: 'hard', prize: '$250 and the trophy' },
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
      trivia: [],
    },
    {
      id: 'r2',
      number: 2,
      starts_on: START,
      ends_on: plus(START, 6),
      prize: 'Lunch on the company',
      weights: { weave: 3, hive: 1 },
      boards: {
        weave: [
          { name: 'Ada', value: 1, detail: 95000, hints: 0 },
          { name: 'Cy', value: 1, detail: 140000, hints: 2 },
        ],
      },
      trivia: [
        {
          session_id: 's2',
          title: 'ESOP Basics',
          mode: 'open',
          weight: 2,
          standings: [
            { place: 1, name: 'Bea', points: 7, seconds: 41 },
            { place: 2, name: 'Ada', points: 5, seconds: 60 },
          ],
        },
      ],
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
  // The third level is on the row too, because the board ranks on it.
  await expect(round).toContainText('no hints');
  await expect(round).toContainText('2 hints');
  await expect(round.getByRole('list', { name: /Weave/ }).getByRole('listitem').first()).toContainText(
    'Ada'
  );
});

test('and earlier rounds are there, folded away', async ({ page }) => {
  await tournament(page);
  await page.goto('/tournament');
  const earlier = page.locator('details', { hasText: 'Round 1' });
  await expect(earlier).toBeVisible();
  await earlier.locator('summary').click();
  await expect(earlier).toContainText('Bea');
});


// ---------------------------------------------------------------------------
// Trivia
// ---------------------------------------------------------------------------

// An open session is trivia on your own time, so it is offered the same way a
// game in the round is: something to go and do now.
test("the round's open trivia is offered beside its games", async ({ page }) => {
  await tournament(page);
  await page.goto('/tournament');
  const list = page.getByRole('list', { name: 'In this round' });
  const open = list.getByRole('listitem').filter({ hasText: 'ESOP Basics' });
  await expect(open).toContainText('Open now — play it on your own time');
  await expect(open.getByRole('link')).toHaveAttribute('href', '/live/s2');
});

// A session that has not been opened yet is listed but not a door. Linking it
// would take somebody to a session that refuses them, which reads as broken
// rather than as "not yet".
test('a session that has not opened is shown without a way in', async ({ page }) => {
  await tournament(page);
  await page.goto('/tournament');
  const list = page.getByRole('list', { name: 'In this round' });
  const soon = list.getByRole('listitem').filter({ hasText: 'Next Week' });
  await expect(soon).toContainText('Not open yet');
  await expect(soon.getByRole('link')).toHaveCount(0);
});

test("a round's trivia is ranked beside its boards, and says what it was worth", async ({ page }) => {
  await tournament(page);
  await page.goto('/tournament');
  const round = page.getByRole('region', { name: "This round's standings" });
  await expect(round).toContainText('worth 2×');
  const board = round.getByRole('list', { name: 'ESOP Basics standings' });
  await expect(board.getByRole('listitem')).toHaveText([/Bea.*7 pts/, /Ada.*5 pts/]);
});

// The table's own explanation has to admit the multiplier exists, or a round
// where the trivia was worth double is arithmetic nobody can check.
test('the table says placement points can be multiplied', async ({ page }) => {
  await tournament(page);
  await page.goto('/tournament');
  await expect(page.getByRole('region', { name: 'Tournament table' })).toContainText(
    'times what that round said the game was worth'
  );
});

// ---------------------------------------------------------------------------
// Prizes
// ---------------------------------------------------------------------------
// A prize nobody is told about is not a prize, so it is said where the
// standings are rather than only in the admin page that set it.
test('the round page says what this round and the tournament are worth', async ({ page }) => {
  await tournament(page);
  await page.goto('/tournament');
  // Exact, because getByRole matches a name by substring: "This round" also
  // matches the "This round's standings" section below it, and which of the
  // two the assertion saw came down to which had mounted first.
  const round = page.getByRole('region', { name: 'This round', exact: true });
  await expect(round).toContainText('This round: Lunch on the company');
  await expect(round).toContainText('Overall prize: $250 and the trophy');
});

test('and the tournament table says what winning it is worth', async ({ page }) => {
  await tournament(page);
  await page.goto('/tournament');
  await expect(page.getByRole('region', { name: 'Tournament table' })).toContainText(
    'Overall prize: $250 and the trophy'
  );
});

// Nothing said is nothing shown.
test('a tournament with no prize says nothing about one', async ({ page }) => {
  await page.route('**/rest/v1/rpc/**', (route) => {
    const fn = route.request().url().match(/\/rpc\/(\w+)/)?.[1] ?? '';
    const reply = (body: unknown) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (fn === 'current_round') return reply({ ...ROUND, prize: null, tournament_prize: null });
    if (fn === 'tournament_standings') {
      return reply({
        ...STANDINGS,
        tournament: { id: 't1', name: 'Ownership Cup', difficulty: 'hard', prize: null },
        rounds: STANDINGS.rounds.map((r) => ({ ...r, prize: null })),
      });
    }
    return route.fallback();
  });
  await page.goto('/tournament');
  await expect(page.getByRole('heading', { name: /Ownership Cup/ })).toBeVisible();
  await expect(page.getByText(/prize/i)).toHaveCount(0);
});

// ---------------------------------------------------------------------------
// What a board is worth
// ---------------------------------------------------------------------------
// A board paying triple and looking like the others is a table nobody can
// check, so it is said where the points are and again on the way in.
test('a weighted board says so on its standings', async ({ page }) => {
  await tournament(page);
  await page.goto('/tournament');
  const round = page.getByRole('region', { name: "This round's standings" });
  await expect(round).toContainText('worth 3×');
});

test('and again on the game before it is played', async ({ page }) => {
  await tournament(page);
  await page.goto('/tournament');
  const weave = page
    .getByRole('list', { name: 'In this round' })
    .getByRole('listitem')
    .filter({ hasText: 'Weave' });
  await expect(weave).toContainText('worth 3×');
});

// Parity is the ordinary case and says nothing: every board paid the same
// before a round could say otherwise.
test('a board at parity says nothing about what it is worth', async ({ page }) => {
  await tournament(page);
  await page.goto('/tournament');
  const hive = page
    .getByRole('list', { name: 'In this round' })
    .getByRole('listitem')
    .filter({ hasText: 'Hive' });
  await expect(hive).not.toContainText('worth');
});
