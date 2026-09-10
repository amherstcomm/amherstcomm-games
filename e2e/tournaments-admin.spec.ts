// Setting up a tournament from the admin portal.
//
// The rules live in the database; what the page owes is sending what was
// chosen, in the shape the server keys boards by, and showing the server's
// answer when it refuses. And one thing it has to get right by itself: a round
// that is being played only offers its end date, because that is the only
// thing the server will let change.
import { expect, test } from './fixtures';

type Round = { id: string; starts_on: string; ends_on: string; games: string[]; started: boolean };
type Tournament = {
  id: string;
  name: string;
  difficulty: string;
  starts_on: string;
  ends_on: string;
  rounds: Round[];
};

/** A server the test owns: tournaments live here, and saves change them. */
async function portal(
  page: import('@playwright/test').Page,
  tournaments: Tournament[],
  { refuseRound = '' } = {}
) {
  const sent: { fn: string; args: Record<string, unknown> }[] = [];
  await page.route('**/rest/v1/rpc/**', (route) => {
    const url = route.request().url();
    const fn = url.match(/\/rpc\/(\w+)/)?.[1] ?? '';
    const args = JSON.parse(route.request().postData() ?? '{}');
    const reply = (body: unknown) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

    if (fn === 'save_tournament') {
      sent.push({ fn, args });
      tournaments.push({
        id: `t${tournaments.length + 1}`,
        name: args.p_name,
        difficulty: args.p_difficulty,
        starts_on: args.p_starts,
        ends_on: args.p_ends,
        rounds: [],
      });
      return reply({ ok: true, id: `t${tournaments.length}` });
    }
    if (fn === 'save_round') {
      sent.push({ fn, args });
      if (refuseRound) return reply({ ok: false, reason: refuseRound });
      const t = tournaments.find((x) => x.id === args.p_tournament)!;
      t.rounds.push({
        id: `r${t.rounds.length + 1}`,
        starts_on: args.p_starts,
        ends_on: args.p_ends,
        games: args.p_games,
        started: false,
      });
      return reply({ ok: true, id: 'r' });
    }
    if (fn === 'tournaments_sheet') return reply({ ok: true, tournaments });
    if (fn === 'my_capabilities') return reply(['games.setup', 'site.settings', 'users.manage']);
    if (fn === 'read_site_settings') return reply({});
    return reply([]);
  });
  await page.goto('/admin/tournaments');
  return sent;
}

test('a tournament is created with its own dates and difficulty', async ({ page }) => {
  const sent = await portal(page, []);
  await page.getByRole('button', { name: 'New tournament' }).click();
  await page.getByLabel('Tournament name').fill('Ownership Cup');
  await page.getByLabel('Tournament difficulty').selectOption('extreme');
  await page.getByLabel('Starts').fill('2026-10-01');
  await page.getByLabel('Ends').fill('2026-10-24');
  await page.getByRole('button', { name: 'Save tournament' }).click();

  await expect.poll(() => sent.length).toBe(1);
  expect(sent[0].args).toMatchObject({
    p_id: null,
    p_name: 'Ownership Cup',
    p_difficulty: 'extreme',
    p_starts: '2026-10-01',
    p_ends: '2026-10-24',
  });
  await expect(page.locator('[data-tournament="Ownership Cup"]')).toContainText('2026-10-01 to 2026-10-24');
});

// Chosen by the name people know, sent by the name a board is published under
// -- "Hive" goes out as hive, and Boxed as box.
test('a round sends its games as the feeds its boards are published under', async ({ page }) => {
  const sent = await portal(page, [
    { id: 't1', name: 'Ownership Cup', difficulty: 'hard', starts_on: '2026-10-01', ends_on: '2026-10-24', rounds: [] },
  ]);
  await page.getByRole('button', { name: 'Add a round' }).click();
  await page.getByLabel('Round starts').fill('2026-10-01');
  await page.getByLabel('Round ends').fill('2026-10-03');
  const games = page.getByRole('group', { name: 'Games in this round' });
  await games.getByRole('button', { name: /Hive/ }).click();
  await games.getByRole('button', { name: /Box/ }).click();
  await page.getByRole('button', { name: 'Save round' }).click();

  await expect.poll(() => sent.filter((s) => s.fn === 'save_round').length).toBe(1);
  const round = sent.find((s) => s.fn === 'save_round')!.args;
  expect(round).toMatchObject({ p_tournament: 't1', p_starts: '2026-10-01', p_ends: '2026-10-03' });
  expect([...(round.p_games as string[])].sort()).toEqual(['box', 'hive']);
  await expect(page.getByRole('list', { name: 'Rounds of Ownership Cup' })).toContainText(
    'Round 1 · 2026-10-01 to 2026-10-03'
  );
});

test("and the server's refusal is shown, not swallowed", async ({ page }) => {
  await portal(
    page,
    [{ id: 't1', name: 'Ownership Cup', difficulty: 'hard', starts_on: '2026-10-01', ends_on: '2026-10-24', rounds: [] }],
    { refuseRound: 'another round already covers some of those days' }
  );
  await page.getByRole('button', { name: 'Add a round' }).click();
  await page.getByLabel('Round starts').fill('2026-10-01');
  await page.getByLabel('Round ends').fill('2026-10-02');
  await page.getByRole('group', { name: 'Games in this round' }).getByRole('button', { name: /Hive/ }).click();
  await page.getByRole('button', { name: 'Save round' }).click();
  await expect(page.getByText('another round already covers some of those days')).toBeVisible();
});

// A round being played: its board is out, so its first day and its games are
// fixed. The page offers what the server allows and says why, rather than
// offering the lot and relaying a refusal afterwards.
test('a round under way offers only its end date', async ({ page }) => {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
  const later = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);
  await portal(page, [
    {
      id: 't1',
      name: 'Ownership Cup',
      difficulty: 'hard',
      starts_on: '2026-01-01',
      ends_on: '2027-12-31',
      rounds: [{ id: 'r1', starts_on: today, ends_on: later, games: ['hive'], started: true }],
    },
  ]);
  await expect(page.getByRole('list', { name: 'Rounds of Ownership Cup' })).toContainText('under way');
  // Under way is not deletable: people have played it.
  await expect(page.getByRole('button', { name: 'Delete round' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Edit round' }).click();
  await expect(page.getByLabel('Round starts')).toBeDisabled();
  await expect(page.getByLabel('Round ends')).toBeEnabled();
  await expect(page.getByRole('group', { name: 'Games in this round' })).toHaveCount(0);
  await expect(page.getByText(/only its end date can change/)).toBeVisible();
});
