// A clue for a tournament round's Guess the Word.
//
// The organiser writes it on the round's pin; a player sees that there is one
// and decides whether to take it, because taking it counts against them. The
// server keeps the clue and the record of who took it (roundclues.sql); what
// the pages owe is the box to write it in, the button to ask for it -- with
// the cost said before anybody pays it -- and the clue shown once taken.
import { expect, test } from './fixtures';

const easternToday = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
const plus = (date: string, n: number) =>
  new Date(new Date(`${date}T12:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);
const TODAY = easternToday();
const b64 = (w: string) => Buffer.from(w).toString('base64');

const ROUND = {
  tournament_id: 't1', tournament: 'Ownership Cup', difficulty: 'hard',
  tournament_starts_on: plus(TODAY, -3), tournament_ends_on: plus(TODAY, 20),
  round_id: 'r1', number: 1, of: 3, starts_on: plus(TODAY, -1), ends_on: plus(TODAY, 1),
  games: ['words'], game_weights: {}, daily_games: ['words'], trivia: [], contests: [],
};
// The round's board: the pinned word, and only it.
const BOARD = {
  date: TODAY,
  // five letters: the length a new player's board starts at
  byDifficulty: { easy: { words: { 5: b64('share') } }, hard: { words: { 5: b64('share') } }, extreme: { words: { 5: b64('share') } } },
};

async function round(page: import('@playwright/test').Page, clue: { available: boolean; taken: boolean }) {
  const asked: Record<string, unknown>[] = [];
  const state = { ...clue };
  await page.route('**/rest/v1/rpc/**', (route) => {
    const fn = route.request().url().match(/\/rpc\/(\w+)/)?.[1] ?? '';
    const reply = (b: unknown) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
    if (fn === 'current_rounds') return reply([ROUND]);
    if (fn === 'current_round') return reply(ROUND);
    if (fn === 'read_availability') return reply([]);
    if (fn === 'current_tournament') return reply(null);
    if (fn === 'round_puzzle') return reply(BOARD);
    if (fn === 'round_clue') {
      const args = JSON.parse(route.request().postData() ?? '{}');
      asked.push(args);
      if (args.p_take) state.taken = true;
      return reply({
        ok: true, available: state.available, taken: state.taken,
        clue: state.taken ? 'What every employee-owner holds' : null,
      });
    }
    return route.fallback();
  });
  return asked;
}

test('a round with a clue offers it, says what it costs, and shows it once taken', async ({ page }) => {
  const asked = await round(page, { available: true, taken: false });
  await page.goto('/tournament/guess');
  const clue = page.getByRole('region', { name: 'Clue' });
  await expect(clue.getByRole('button', { name: 'Show the clue' })).toBeVisible();
  // not what it says, until asked
  await expect(page.getByText('What every employee-owner holds')).toHaveCount(0);

  let warned = '';
  page.once('dialog', (d) => {
    warned = d.message();
    void d.accept();
  });
  await clue.getByRole('button', { name: 'Show the clue' }).click();
  await expect(clue).toContainText('Clue: What every employee-owner holds');
  expect(warned).toContain('counts against you');
  // for the word at the length being played: an unpinned board has one at each
  expect(asked.some((a) => a.p_game === 'words' && a.p_take === true && a.p_length === 5)).toBe(true);
});

test('and changing your mind at the warning takes nothing', async ({ page }) => {
  const asked = await round(page, { available: true, taken: false });
  await page.goto('/tournament/guess');
  page.once('dialog', (d) => void d.dismiss());
  await page.getByRole('button', { name: 'Show the clue' }).click();
  await expect(page.getByRole('button', { name: 'Show the clue' })).toBeVisible();
  expect(asked.some((a) => a.p_take === true)).toBe(false);
});

test('a clue already taken is shown again on coming back', async ({ page }) => {
  await round(page, { available: true, taken: true });
  await page.goto('/tournament/guess');
  await expect(page.getByRole('region', { name: 'Clue' })).toContainText('Clue: What every employee-owner holds');
  await expect(page.getByRole('button', { name: 'Show the clue' })).toHaveCount(0);
});

test('a round without one shows nothing about clues', async ({ page }) => {
  await round(page, { available: false, taken: false });
  await page.goto('/tournament/guess');
  await expect(page.getByLabel('Tap the board and type your guess')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Clue' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Show the clue' })).toHaveCount(0);
});

test('the organiser writes the clue on the round s pinned word', async ({ page }) => {
  const sent: Record<string, unknown>[] = [];
  const day = { date: plus(TODAY, 1), theme: { name: 'October', words: ['owners', 'shared', 'voting'] } };
  await page.route('**/rest/v1/rpc/**', (route) => {
    const url = route.request().url();
    const reply = (body: unknown) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.includes('set_pin_clue')) {
      sent.push(JSON.parse(route.request().postData() ?? '{}'));
      return reply({ ok: true });
    }
    if (url.includes('round_boards_on')) {
      return reply({ ok: true, boards: [{
        game: 'guess', daily: true, round: 'r1', round_starts_on: ROUND.starts_on, round_ends_on: ROUND.ends_on,
        tournament: 'Ownership Cup', difficulty: 'hard',
      }] });
    }
    if (url.includes('theme_coverage')) return reply({ ok: true, days: [day] });
    if (url.includes('pins_sheet')) {
      return reply({ ok: true, pins: [
        { id: 'pin-r', on_date: day.date, env: 'round', game: 'guess', difficulty: null, choice: { word: 'owners' } },
        // the daily's pin for the same day, which gets no clue box
        { id: 'pin-d', on_date: day.date, env: 'daily', game: 'guess', difficulty: null, choice: { word: 'voting' } },
      ] });
    }
    return reply([]);
  });

  await page.goto('/admin/pins');
  await page.getByRole('group', { name: 'Pin for' }).getByRole('button', { name: 'Tournament rounds' }).click();
  await page.getByLabel('Pin date').fill(day.date);
  await page.getByRole('button', { name: 'Look' }).click();
  await page.getByLabel('Clue for OWNERS (optional)').fill('What every employee-owner holds');
  await page.getByRole('button', { name: 'Save the clue' }).click();
  await expect(page.getByText('Clue saved.')).toBeVisible();
  expect(sent).toEqual([{ p_pin: 'pin-r', p_clue: 'What every employee-owner holds' }]);
});

// A round whose word was chosen holds that word at its own length and no
// other. The page plays it there, whatever length the player usually plays,
// rather than telling them "today's word is 6 letters" and leaving them to
// find it -- and the length picker goes, because there is nothing to pick.
test("a round with a chosen word plays at that word's length", async ({ page }) => {
  const six = { date: TODAY, byDifficulty: Object.fromEntries(
    ['easy', 'hard', 'extreme'].map((d) => [d, { words: { 6: b64('owners') } }])) };
  await page.route('**/rest/v1/rpc/**', (route) => {
    const fn = route.request().url().match(/\/rpc\/(\w+)/)?.[1] ?? '';
    const reply = (b: unknown) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
    if (fn === 'current_rounds') return reply([ROUND]);
    if (fn === 'current_round') return reply(ROUND);
    if (fn === 'read_availability') return reply([]);
    if (fn === 'current_tournament') return reply(null);
    if (fn === 'round_puzzle') return reply(six);
    if (fn === 'round_clue') return reply({ ok: true, available: false });
    return route.fallback();
  });
  await page.goto('/tournament/guess');
  await expect(page.getByLabel('Tap the board and type your guess')).toBeVisible();
  await expect(page.getByText(/No daily puzzle at/)).toHaveCount(0);
  await expect(page.getByText('Word length')).toBeHidden();

  // and the daily still plays at the player's own length afterwards
  await page.goto('/daily/guess');
  await expect(page.getByText('Word length')).toBeVisible();
});
