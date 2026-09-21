// A contest, in a browser.
//
// The rules are the database's (supabase/tests/contests.sql proves them); what
// the page owes is the part no SQL test can see. That the entries are drawn as
// a gallery rather than a table -- a pumpkin is a photograph and a list of
// titles hides the thing being judged. That a blind contest reads as blind
// here too, with numbers where the names would be. And that the form for
// entering only appears when the server says this person may enter, so the
// page never offers something that will come back refused.
import { expect, test } from './fixtures';

const easternToday = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
const plus = (date: string, n: number) =>
  new Date(new Date(`${date}T12:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);

const TODAY = easternToday();

const CONTEST = {
  id: 'c1',
  name: 'Pumpkin carving',
  blurb: 'Carve one, photograph it, tell us about it.',
  entries_open_on: plus(TODAY, -2),
  entries_close_on: plus(TODAY, 3),
  votes_open_on: plus(TODAY, 4),
  votes_close_on: plus(TODAY, 7),
  who_enters: 'players',
  entrants_shown: true,
  voters_shown: false,
  picks: 3,
  prize: 'A day off',
  phase: 'entries',
  may_enter: true,
};

const ENTRIES = [
  { id: 'e1', title: 'Jack the Ripper', blurb: 'A butter knife at eleven at night.', image_path: null, entrant: 'Ada Lovelace', mine: false },
  { id: 'e2', title: 'Gourdon', blurb: null, image_path: null, entrant: 'Bea Smith', mine: false },
];

/** The contest RPCs, answered from whatever this test wants them to say. */
async function stub(
  page: import('@playwright/test').Page,
  contest: Record<string, unknown>,
  entries = ENTRIES
) {
  await page.route('https://stub.supabase.co/rest/v1/rpc/contest_view', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, contest, entries }),
    })
  );
  await page.route('https://stub.supabase.co/rest/v1/rpc/contests_on', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: contest.id,
          name: contest.name,
          phase: contest.phase,
          entries_close_on: contest.entries_close_on,
          votes_open_on: contest.votes_open_on,
          votes_close_on: contest.votes_close_on,
          entries: entries.length,
        },
      ]),
    })
  );
}

test('a contest shows its entries and what it is for', async ({ page }) => {
  await stub(page, CONTEST);
  await page.goto('/contest/c1');

  await expect(page.getByRole('heading', { name: 'Pumpkin carving' })).toBeVisible();
  await expect(page.getByText('Carve one, photograph it, tell us about it.')).toBeVisible();
  // The prize is the reason anybody reads the rest of it.
  await expect(page.getByText('A day off')).toBeVisible();
  // The deadline, in words rather than as a date somebody has to count from.
  await expect(page.getByText(/Entries close/)).toBeVisible();

  await expect(page.getByText('Jack the Ripper')).toBeVisible();
  await expect(page.getByText('Ada Lovelace')).toBeVisible();
  await expect(page.getByText('2 entries')).toBeVisible();
});

test('the form is there while this person may enter', async ({ page }) => {
  await stub(page, CONTEST);
  await page.goto('/contest/c1');

  await expect(page.getByRole('heading', { name: 'Enter' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'What it is called' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add a photo' })).toBeVisible();
});

test('and is not offered when the server says they may not', async ({ page }) => {
  // Entries have closed. The page should say where the contest is up to and
  // offer nothing that would be refused.
  await stub(page, {
    ...CONTEST,
    phase: 'judging',
    may_enter: false,
    entries_close_on: plus(TODAY, -1),
    votes_open_on: plus(TODAY, 1),
  });
  await page.goto('/contest/c1');

  await expect(page.getByText('Entries closed')).toBeVisible();
  await expect(page.getByText(/Voting opens/)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Enter' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Add a photo' })).toHaveCount(0);
});

test('a blind contest names nobody', async ({ page }) => {
  await stub(
    page,
    { ...CONTEST, entrants_shown: false },
    ENTRIES.map((e) => ({ ...e, entrant: null }))
  );
  await page.goto('/contest/c1');

  await expect(page.getByText('Ada Lovelace')).toHaveCount(0);
  // Numbered instead, which is how somebody refers to one out loud when there
  // is nothing else to call it.
  await expect(page.getByText('Entry 1')).toBeVisible();
  await expect(page.getByText('Entry 2')).toBeVisible();
  await expect(page.getByText(/shown without names/)).toBeVisible();
});

test('the list is the way in when the address has no contest on it', async ({ page }) => {
  await stub(page, CONTEST);
  await page.goto('/contest');

  await expect(page.getByRole('heading', { name: 'Contests' })).toBeVisible();
  const link = page.getByRole('link', { name: /Pumpkin carving/ });
  await expect(link).toBeVisible();
  await link.click();
  await expect(page).toHaveURL(/\/contest\/c1$/);
  await expect(page.getByRole('heading', { name: 'Pumpkin carving' })).toBeVisible();
});
