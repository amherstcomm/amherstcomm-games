// Setting up a tournament from the admin portal.
//
// The rules live in the database; what the page owes is sending what was
// chosen, in the shape the server keys boards by, and showing the server's
// answer when it refuses. And one thing it has to get right by itself: a round
// that is being played only offers its end date, because that is the only
// thing the server will let change.
import { expect, test } from './fixtures';

type Trivia = { session_id: string; title: string; mode: string; state: string; weight: number };
type Round = {
  id: string;
  starts_on: string;
  ends_on: string;
  games: string[];
  trivia?: Trivia[];
  started: boolean;
};
type Tournament = {
  id: string;
  name: string;
  difficulty: string;
  starts_on: string;
  ends_on: string;
  rounds: Round[];
};

/** A server the test owns: tournaments live here, and saves change them. */
/** The sessions the picker offers. Empty by default: most of these tests are
 *  about games, and a site with no sessions still sets rounds up. */
type Session = { id: string; title: string; mode: string; state: string; items: number };

async function portal(
  page: import('@playwright/test').Page,
  tournaments: Tournament[],
  { refuseRound = '', sessions = [] as Session[] } = {}
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
        trivia: ((args.p_sessions ?? []) as { id: string; weight: number }[]).map((x) => ({
          session_id: x.id,
          title: sessions.find((v) => v.id === x.id)?.title ?? x.id,
          mode: sessions.find((v) => v.id === x.id)?.mode ?? 'live',
          state: 'closed',
          weight: x.weight,
        })),
        started: false,
      });
      return reply({ ok: true, id: 'r' });
    }
    if (fn === 'tournaments_sheet') return reply({ ok: true, tournaments });
    if (fn === 'my_sessions') return reply(sessions);
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
  await expect(page.getByText(/its first day and its games\s+are fixed/)).toBeVisible();
  // and the one thing a running round may still gain
  await expect(page.getByText('Trivia in this round')).toBeVisible();
});


// ---------------------------------------------------------------------------
// Trivia in a round
// ---------------------------------------------------------------------------
const SESSIONS = [
  { id: 's1', title: 'Ownership Quiz Night', mode: 'live', state: 'closed', items: 12 },
  { id: 's2', title: 'ESOP Basics', mode: 'open', state: 'live', items: 8 },
];

test('a round sends the sessions it counts, with what each is worth', async ({ page }) => {
  const sent = await portal(
    page,
    [{ id: 't1', name: 'Ownership Cup', difficulty: 'hard', starts_on: '2026-10-01', ends_on: '2026-10-24', rounds: [] }],
    { sessions: SESSIONS }
  );
  await page.getByRole('button', { name: 'Add a round' }).click();
  await page.getByLabel('Round starts').fill('2026-10-01');
  await page.getByLabel('Round ends').fill('2026-10-07');
  const trivia = page.getByRole('list', { name: 'Trivia in this round' });
  await trivia.getByRole('checkbox').first().check();
  await page.getByLabel('What Ownership Quiz Night is worth').fill('3');
  await page.getByRole('button', { name: 'Save round' }).click();

  await expect.poll(() => sent.length).toBe(1);
  expect(sent[0].args.p_sessions).toEqual([{ id: 's1', weight: 3 }]);
  await expect(page.locator('[data-tournament="Ownership Cup"]')).toContainText(
    'Ownership Quiz Night (×3)'
  );
});

// The reason "both" is cheap: an open session is trivia on your own time, and
// the picker says which it is rather than making the admin remember.
test('the picker says which sessions are played live and which on your own time', async ({ page }) => {
  await portal(
    page,
    [{ id: 't1', name: 'Ownership Cup', difficulty: 'hard', starts_on: '2026-10-01', ends_on: '2026-10-24', rounds: [] }],
    { sessions: SESSIONS }
  );
  await page.getByRole('button', { name: 'Add a round' }).click();
  const trivia = page.getByRole('list', { name: 'Trivia in this round' });
  await expect(trivia.getByRole('listitem')).toHaveText([
    /Ownership Quiz Night.*Live/,
    /ESOP Basics.*On your own time/,
  ]);
});

// A round used to need a game. It no longer does, because a week whose event is
// the trivia night is a round.
test('a round of trivia and no games can be saved', async ({ page }) => {
  const sent = await portal(
    page,
    [{ id: 't1', name: 'Ownership Cup', difficulty: 'hard', starts_on: '2026-10-01', ends_on: '2026-10-24', rounds: [] }],
    { sessions: SESSIONS }
  );
  await page.getByRole('button', { name: 'Add a round' }).click();
  await page.getByLabel('Round starts').fill('2026-10-01');
  await page.getByLabel('Round ends').fill('2026-10-07');
  await expect(page.getByRole('button', { name: 'Save round' })).toBeDisabled();
  await page.getByRole('list', { name: 'Trivia in this round' }).getByRole('checkbox').first().check();
  await page.getByRole('button', { name: 'Save round' }).click();

  await expect.poll(() => sent.length).toBe(1);
  expect(sent[0].args.p_games).toEqual([]);
  expect(sent[0].args.p_sessions).toEqual([{ id: 's1', weight: 1 }]);
});


// The reason a finished round is still editable: a session is run first and
// attached afterwards, usually once the week it belonged to is over.
test('a finished round still takes its trivia, and nothing else', async ({ page }) => {
  const yesterday = new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10);
  const before = new Date(Date.now() - 8 * 86_400_000).toISOString().slice(0, 10);
  const sent = await portal(
    page,
    [
      {
        id: 't1',
        name: 'Ownership Cup',
        difficulty: 'hard',
        starts_on: before,
        ends_on: '2099-01-01',
        rounds: [
          { id: 'r1', starts_on: before, ends_on: yesterday, games: ['hive'], trivia: [], started: true },
        ],
      },
    ],
    { sessions: SESSIONS }
  );
  await expect(page.getByRole('list', { name: 'Rounds of Ownership Cup' })).toContainText('finished');
  await page.getByRole('button', { name: 'Edit trivia' }).click();

  await expect(page.getByLabel('Round starts')).toBeDisabled();
  await expect(page.getByLabel('Round ends')).toBeDisabled();
  await expect(page.getByRole('group', { name: 'Games in this round' })).toHaveCount(0);

  await page.getByRole('list', { name: 'Trivia in this round' }).getByRole('checkbox').first().check();
  await page.getByRole('button', { name: 'Save round' }).click();
  await expect.poll(() => sent.length).toBe(1);
  // The dates and games go back exactly as they were; only the trivia is new.
  expect(sent[0].args).toMatchObject({
    p_id: 'r1',
    p_starts: before,
    p_ends: yesterday,
    p_games: ['hive'],
    p_sessions: [{ id: 's1', weight: 1 }],
  });
});
