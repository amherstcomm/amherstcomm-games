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

/** A contest in its voting window, which is a different four dates. */
const VOTING = {
  ...CONTEST,
  phase: 'voting',
  may_enter: false,
  may_vote: true,
  entries_close_on: plus(TODAY, -2),
  votes_open_on: plus(TODAY, -1),
  votes_close_on: plus(TODAY, 2),
};

/** The contest RPCs, answered from whatever this test wants them to say. */
async function stub(
  page: import('@playwright/test').Page,
  contest: Record<string, unknown>,
  entries = ENTRIES,
  myVotes: string[] = []
) {
  await page.route('https://stub.supabase.co/rest/v1/rpc/contest_view', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, contest, entries, my_votes: myVotes }),
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

test('photos are drawn from signed storage links', async ({ page }) => {
  // An entry that has a photograph, which is the state every entry reaches
  // once somebody has uploaded one. What is asserted is where the <img> gets
  // its src: a signed link from storage, asked for in one round trip for the
  // whole page. It used to be possible for the form to draw a `blob:` handle
  // on the file in this tab instead -- a second source of truth that showed
  // something whether or not the upload had worked.
  // The signing call is a POST to the bucket; the signed links it hands back
  // are GETs with the object path on the end. Matching both with one glob
  // counted three image fetches as three signings.
  let calls = 0;
  await page.route('**/storage/v1/object/sign/contest-entries', async (route) => {
    calls += 1;
    const paths = (JSON.parse(route.request().postData() ?? '{}').paths ?? []) as string[];
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        paths.map((path) => ({
          path,
          signedURL: `/object/sign/contest-entries/${path}?token=t`,
          error: null,
        }))
      ),
    });
  });

  // A real one-pixel PNG behind each signed link, so a visible <img> means an
  // image that decoded rather than an element that exists.
  const PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64'
  );
  await page.route('**/storage/v1/object/sign/contest-entries/**', (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: PNG })
  );

  await stub(page, CONTEST, [
    { ...ENTRIES[0], image_path: 'me/one.jpg', mine: true },
    { ...ENTRIES[1], image_path: 'them/two.jpg', mine: false },
  ]);
  await page.goto('/contest/c1');

  // Both entries' photographs, signed together rather than one call each.
  await expect(page.getByRole('img', { name: 'Jack the Ripper' })).toHaveAttribute(
    'src',
    /\/storage\/v1\/object\/sign\/contest-entries\/me\/one\.jpg/
  );
  await expect(page.getByRole('img', { name: 'Gourdon' })).toHaveAttribute(
    'src',
    /\/storage\/v1\/object\/sign\/contest-entries\/them\/two\.jpg/
  );
  // One round trip for the gallery, not one per entry: with thirty pumpkins
  // on the page that difference is the page.
  expect(calls).toBe(1);

  // And the form shows the one that is theirs, from the same signed link --
  // never from a local handle.
  const own = page.getByRole('img', { name: 'Your entry' });
  await expect(own).toBeVisible();
  await expect(own).toHaveAttribute('src', /^https:\/\//);
});

test('an entry whose photo cannot be signed keeps its tile', async ({ page }) => {
  // One missing photograph costs its own tile and nothing else. The gallery is
  // the page, so a single broken path must not empty it.
  await page.route('**/storage/v1/object/sign/contest-entries', (route) =>
    route.fulfill({ status: 400, contentType: 'application/json', body: '{"error":"nope"}' })
  );
  await stub(page, CONTEST, [{ ...ENTRIES[0], image_path: 'me/gone.jpg', mine: false }]);
  await page.goto('/contest/c1');

  const tile = page.getByRole('listitem').filter({ hasText: 'Jack the Ripper' });
  await expect(tile).toBeVisible();
  await expect(tile.getByText('No photo yet')).toBeVisible();
  await expect(page.getByRole('img', { name: 'Jack the Ripper' })).toHaveCount(0);
});

// ---------------------------------------------------------------------------
// Voting
// ---------------------------------------------------------------------------

test('the ballot offers everything but your own', async ({ page }) => {
  await stub(page, VOTING, [
    { ...ENTRIES[0], mine: true },
    { ...ENTRIES[1], mine: false },
  ]);
  await page.route('**/rest/v1/rpc/contest_results', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: false, reason: 'the results are in when voting closes' }),
    })
  );
  await page.goto('/contest/c1');

  const rank = page.getByRole('list', { name: 'The entries you can rank' });
  await expect(rank.getByRole('button', { name: 'Gourdon' })).toBeVisible();
  // Your own is not on the ballot at all rather than on it and refused: the
  // server turns it away either way, and offering it is offering a mistake.
  await expect(rank.getByRole('button', { name: 'Jack the Ripper' })).toHaveCount(0);
  // And nothing about how the room has voted so far is on the page.
  await expect(page.getByText(/How it stands|Result/)).toHaveCount(0);
});

test('picks are numbered in the order they are tapped, and untap', async ({ page }) => {
  await stub(page, VOTING, [
    { id: 'e1', title: 'Alpha', blurb: null, image_path: null, entrant: 'Ada', mine: false },
    { id: 'e2', title: 'Beta', blurb: null, image_path: null, entrant: 'Bea', mine: false },
    { id: 'e3', title: 'Gamma', blurb: null, image_path: null, entrant: 'Cal', mine: false },
  ]);
  await page.goto('/contest/c1');

  const rank = page.getByRole('list', { name: 'The entries you can rank' });
  await rank.getByRole('button', { name: 'Beta' }).click();
  await rank.getByRole('button', { name: 'Gamma' }).click();
  await expect(rank.getByRole('button', { name: '1st Beta' })).toBeVisible();
  await expect(rank.getByRole('button', { name: '2nd Gamma' })).toBeVisible();

  // Tapping a pick again takes it out and closes the gap behind it, so the
  // remaining pick is promoted rather than left as somebody's second choice
  // with no first.
  await rank.getByRole('button', { name: '1st Beta' }).click();
  await expect(rank.getByRole('button', { name: '1st Gamma' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Beta/ })).toHaveAttribute(
    'aria-pressed',
    'false'
  );
});

test('a ballot is only sent when it is cast', async ({ page }) => {
  const sent: string[][] = [];
  await stub(page, VOTING, [
    { id: 'e1', title: 'Alpha', blurb: null, image_path: null, entrant: 'Ada', mine: false },
    { id: 'e2', title: 'Beta', blurb: null, image_path: null, entrant: 'Bea', mine: false },
  ]);
  await page.route('**/rest/v1/rpc/cast_contest_votes', (route) => {
    sent.push(JSON.parse(route.request().postData() ?? '{}').p_entries ?? []);
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, counted: 2 }),
    });
  });
  await page.goto('/contest/c1');

  const rank = page.getByRole('list', { name: 'The entries you can rank' });
  await rank.getByRole('button', { name: 'Beta' }).click();
  await rank.getByRole('button', { name: 'Alpha' }).click();
  // Nothing has gone yet: a ballot that saved on every tap would make each
  // half-finished ordering on the way to the real one somebody's vote.
  expect(sent).toEqual([]);

  await page.getByRole('button', { name: 'Cast my ballot' }).click();
  await expect(page.getByText('Your ballot is in.')).toBeVisible();
  expect(sent).toEqual([['e2', 'e1']]);
});

test('too many picks is refused before it is sent', async ({ page }) => {
  await stub(page, { ...VOTING, picks: 2 }, [
    { id: 'e1', title: 'Alpha', blurb: null, image_path: null, entrant: 'Ada', mine: false },
    { id: 'e2', title: 'Beta', blurb: null, image_path: null, entrant: 'Bea', mine: false },
    { id: 'e3', title: 'Gamma', blurb: null, image_path: null, entrant: 'Cal', mine: false },
  ]);
  await page.goto('/contest/c1');

  const rank = page.getByRole('list', { name: 'The entries you can rank' });
  await rank.getByRole('button', { name: 'Alpha' }).click();
  await rank.getByRole('button', { name: 'Beta' }).click();
  await rank.getByRole('button', { name: 'Gamma' }).click();

  await expect(page.getByText('This one ranks 2. Take one out to add another.')).toBeVisible();
  await expect(rank.getByRole('button', { name: /Gamma/ })).toHaveAttribute(
    'aria-pressed',
    'false'
  );
});

test('a ballot already cast comes back on the page', async ({ page }) => {
  await stub(
    page,
    VOTING,
    [
      { id: 'e1', title: 'Alpha', blurb: null, image_path: null, entrant: 'Ada', mine: false },
      { id: 'e2', title: 'Beta', blurb: null, image_path: null, entrant: 'Bea', mine: false },
    ],
    ['e2', 'e1']
  );
  await page.goto('/contest/c1');

  const rank = page.getByRole('list', { name: 'The entries you can rank' });
  await expect(rank.getByRole('button', { name: '1st Beta' })).toBeVisible();
  await expect(rank.getByRole('button', { name: '2nd Alpha' })).toBeVisible();
  // The ordering is also said in words: the chips stay in entry order so they
  // do not move under a thumb, which leaves the ranking hard to read off them.
  await expect(page.getByText('Your picks: 1st Beta, 2nd Alpha')).toBeVisible();
  // And the gallery says so too, so the three parts of the page agree.
  await expect(page.getByText('your 1st pick')).toBeVisible();
});

test('the result is shown once voting has closed', async ({ page }) => {
  await stub(page, {
    ...VOTING,
    phase: 'over',
    may_vote: false,
    votes_close_on: plus(TODAY, -1),
  });
  await page.route('**/rest/v1/rpc/contest_results', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        final: true,
        voters: 12,
        table: [
          { place: 1, entry_id: 'e2', title: 'Gourdon', points: 9, firsts: 3, entrant: 'Bea Smith' },
          { place: 2, entry_id: 'e1', title: 'Jack the Ripper', points: 4, firsts: 0, entrant: 'Ada Lovelace' },
        ],
        ballots: null,
      }),
    })
  );
  await page.goto('/contest/c1');

  await expect(page.getByRole('heading', { name: 'Result' })).toBeVisible();
  await expect(page.getByText('12 people have voted.')).toBeVisible();
  await expect(page.getByText('9 points')).toBeVisible();
  await expect(page.getByText('3 firsts')).toBeVisible();
  // A secret ballot says nothing about who voted for what.
  await expect(page.getByText('Who voted for what')).toHaveCount(0);
  // And there is no way to vote any more.
  await expect(page.getByRole('button', { name: 'Cast my ballot' })).toHaveCount(0);
});

test('an organiser looking early is told it is not the result', async ({ page }) => {
  await stub(page, { ...VOTING, may_vote: false });
  await page.route('**/rest/v1/rpc/contest_results', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        final: false,
        voters: 4,
        table: [
          { place: 1, entry_id: 'e2', title: 'Gourdon', points: 6, firsts: 2, entrant: 'Bea Smith' },
        ],
        ballots: null,
      }),
    })
  );
  await page.goto('/contest/c1');

  await expect(page.getByRole('heading', { name: 'How it stands' })).toBeVisible();
  await expect(page.getByText(/this is not the result yet/)).toBeVisible();
});

test('an open ballot says who voted for what', async ({ page }) => {
  await stub(page, { ...VOTING, phase: 'over', may_vote: false, voters_shown: true });
  await page.route('**/rest/v1/rpc/contest_results', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        final: true,
        voters: 2,
        table: [
          { place: 1, entry_id: 'e2', title: 'Gourdon', points: 5, firsts: 1, entrant: 'Bea Smith' },
        ],
        ballots: [
          { voter: 'Ada Lovelace', picks: ['Gourdon', 'Jack the Ripper'] },
          { voter: 'Cal Turner', picks: ['Gourdon'] },
        ],
      }),
    })
  );
  await page.goto('/contest/c1');

  await expect(page.getByText('Who voted for what')).toBeVisible();
  await expect(page.getByText('Ada Lovelace: Gourdon, Jack the Ripper')).toBeVisible();
});
