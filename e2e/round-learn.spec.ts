// Learning a game from inside a tournament round.
//
// While a tournament locks the site, the round's game page is the only place a
// game can be opened at all -- /learn/guess is locked out with everything
// else -- so the round has to offer the tutorial itself. It does so in place:
// the address stays the round's, and the tutorial's demo boards never touch
// the round's board.
import { expect, test } from './fixtures';

const easternToday = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
const plus = (date: string, n: number) =>
  new Date(new Date(`${date}T12:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);
const TODAY = easternToday();
const b64 = (w: string) => Buffer.from(w).toString('base64');

const ROUND = {
  tournament_id: 't1', tournament: 'Ownership Cup', difficulty: 'easy',
  tournament_starts_on: plus(TODAY, -3), tournament_ends_on: plus(TODAY, 20),
  round_id: 'r1', number: 1, of: 3, starts_on: plus(TODAY, -1), ends_on: plus(TODAY, 1),
  games: ['words'], game_weights: {}, daily_games: ['words'], trivia: [], contests: [],
};
const BOARD = {
  date: TODAY,
  byDifficulty: Object.fromEntries(['easy', 'hard', 'extreme'].map((d) => [d, { words: { 5: b64('share') } }])),
};

async function round(page: import('@playwright/test').Page, locked: boolean) {
  await page.route('**/rest/v1/rpc/**', (route) => {
    const fn = route.request().url().match(/\/rpc\/(\w+)/)?.[1] ?? '';
    const reply = (b: unknown) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
    if (fn === 'current_rounds') return reply([ROUND]);
    if (fn === 'current_round') return reply(ROUND);
    if (fn === 'read_availability') return reply(locked ? ['site:outside-tournament', 'site:other-sessions'] : []);
    if (fn === 'current_tournament') {
      return reply({ id: 't1', name: 'Ownership Cup', difficulty: 'easy', starts_on: plus(TODAY, -3),
                     ends_on: plus(TODAY, 20), locks_site: locked, next_round_starts_on: null });
    }
    if (fn === 'round_puzzle') return reply(BOARD);
    if (fn === 'round_clue') return reply({ ok: true, available: false });
    return route.fallback();
  });
}

for (const locked of [false, true]) {
  test(`a round's game page teaches the game in place${locked ? ', while the tournament locks the site' : ''}`, async ({ page }) => {
    await round(page, locked);
    await page.goto('/tournament/guess');
    await expect(page.getByLabel('Tap the board and type your guess')).toBeVisible();

    await page.getByRole('button', { name: 'Learn' }).click();
    await expect(page.getByText(/Guess the secret word in six tries/)).toBeVisible();
    // still the round: same address, same banner, no board to play
    await expect(page).toHaveURL(/\/tournament\/guess$/);
    await expect(page.getByRole('region', { name: 'Tournament round' })).toBeVisible();
    await expect(page.getByLabel('Tap the board and type your guess')).toHaveCount(0);

    await page.getByRole('button', { name: 'Play' }).click();
    await expect(page.getByLabel('Tap the board and type your guess')).toBeVisible();
  });
}
