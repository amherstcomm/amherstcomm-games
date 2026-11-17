// Recognition, as somebody nominating and as a reviewer.
//
// The server holds the rules (recognition.sql). What the page owes: a way to
// find the person and say what they did, the choice of being named, the wall
// with the name only where it was chosen, and -- for reviewers -- the queue,
// posting and declining, and picking a round's winner from its candidates.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './fixtures';

type Sent = { fn: string; args: Record<string, unknown> };

async function signedIn(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    localStorage.setItem('sb-stub-auth-token', JSON.stringify({
      access_token: 'test', refresh_token: 'test', token_type: 'bearer', expires_in: 3600, expires_at: exp,
      user: { id: 'u-me', aud: 'authenticated', role: 'authenticated', email: 'me@example.net',
              app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' },
    }));
  });
}

async function server(page: import('@playwright/test').Page, answers: Record<string, (args: Record<string, unknown>) => unknown>) {
  const sent: Sent[] = [];
  await page.route('**/rest/v1/rpc/**', (route) => {
    const fn = route.request().url().match(/\/rpc\/(\w+)/)?.[1] ?? '';
    const args = JSON.parse(route.request().postData() ?? '{}');
    sent.push({ fn, args });
    if (fn in answers) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(answers[fn](args)) });
    }
    return route.fallback();
  });
  return sent;
}

const ANN = { user: 'u-ann', name: 'Ann Lee', avatar: null };
const BO = { user: 'u-bo', name: 'Bo Jensen', avatar: null };
const CY = { user: 'u-cy', name: 'Cy Ortiz', avatar: null };
const STORY_BO = 'Bo stayed late on a Friday to get a farm customer back online after the storm.';
const STORY_CY = 'Cy rewrote the outage call script so customers hear an estimate, not a shrug.';
const ROUND = { id: 'r-1', title: 'Employee Ownership Month', blurb: null, starts_on: '2026-10-01', ends_on: '2026-10-31',
                state: 'open', winner: null };
const WALL = [
  { id: 'n-bo', who: BO, story: STORY_BO, from: null, at: '2026-10-12T15:00:00Z', awards: [] },
  { id: 'n-cy', who: CY, story: STORY_CY, from: ANN, at: '2026-10-10T15:00:00Z', awards: [] },
];
const view = (extra: Record<string, unknown> = {}) => ({
  ok: true, can_review: false, me: 'u-me', rounds: [ROUND], wall: WALL, mine: [], review: null, ...extra,
});

test('the wall names a nominator only where they chose to be', async ({ page }) => {
  await signedIn(page);
  await server(page, { recognition_view: () => view() });
  await page.goto('/recognition');
  await expect(page.getByText('Employee Ownership Month: nominations made October 1 – October 31')).toBeVisible();
  const wall = page.getByRole('region', { name: 'The wall' });
  await expect(wall.getByRole('listitem', { name: 'Bo Jensen, nominated' })).toContainText('Nominated by a colleague');
  await expect(wall.getByRole('listitem', { name: 'Cy Ortiz, nominated' })).toContainText('Nominated by Ann Lee');
  // a reader who does not review sees no queue
  await expect(page.getByRole('region', { name: 'Reviewing' })).toHaveCount(0);
});

test('nominating: find them, say what they did, choose whether to be named', async ({ page }) => {
  await signedIn(page);
  const sent = await server(page, {
    recognition_view: () => view(),
    find_entrants: () => ({ ok: true, people: [{ user: 'u-dana', email: 'dana@example.net', name: 'Dana Kowalski' }] }),
    nominate: () => ({ ok: true, id: 'n-new' }),
  });
  await page.goto('/recognition');
  await page.getByRole('button', { name: 'Nominate somebody' }).click();
  const form = page.getByRole('form', { name: 'Nominate somebody' });
  await form.getByLabel('Who are you nominating?').fill('Dana');
  await form.getByRole('button', { name: /Dana Kowalski/ }).click();
  await expect(form.getByText('Nominating')).toBeVisible();
  await expect(form.getByRole('button', { name: 'Send it' })).toBeDisabled();
  await form.getByLabel('What did they do?').fill('Dana drove two hours to swap a failed ONT before a funeral home opened.');
  await form.getByLabel(/Show my name on the wall/).uncheck();
  await form.getByRole('button', { name: 'Send it' }).click();
  await expect(page.getByText('Thank you. Your nomination is waiting for review.')).toBeVisible();
  expect(sent.find((s) => s.fn === 'nominate')?.args).toEqual({
    p_nominee: 'u-dana',
    p_story: 'Dana drove two hours to swap a failed ONT before a funeral home opened.',
    p_show_name: false,
  });
});

test('your own nominations say where they stand, and one waiting can be taken back', async ({ page }) => {
  await signedIn(page);
  const sent = await server(page, {
    recognition_view: () => view({ mine: [
      { id: 'm-1', who: BO, story: STORY_BO, show_name: true, status: 'waiting', at: '2026-10-20T15:00:00Z' },
      { id: 'm-2', who: CY, story: STORY_CY, show_name: true, status: 'posted', at: '2026-10-10T15:00:00Z' },
    ] }),
    withdraw_nomination: () => ({ ok: true }),
  });
  await page.goto('/recognition');
  const mine = page.getByRole('region', { name: 'Your nominations' });
  await expect(mine.getByText('Waiting for review')).toBeVisible();
  await expect(mine.getByText('On the wall')).toBeVisible();
  await expect(mine.getByRole('button', { name: 'Take it back' })).toHaveCount(1);
  page.once('dialog', (d) => void d.accept());
  await mine.getByRole('button', { name: 'Take it back' }).click();
  await expect.poll(() => sent.find((s) => s.fn === 'withdraw_nomination')?.args).toEqual({ p_id: 'm-1' });
});

const REVIEW = {
  waiting: 1,
  nominations: [
    { id: 'w-1', who: { user: 'u-dana', name: 'Dana Kowalski', avatar: null }, from: ANN,
      story: 'Dana drove two hours to swap a failed ONT before a funeral home opened.', show_name: false,
      status: 'waiting', note: null, at: '2026-10-25T15:00:00Z', day: '2026-10-25', reviewed_by: null, about_me: false },
    { id: 'w-me', who: { user: 'u-me', name: 'Me Myself', avatar: null }, from: BO,
      story: 'Covered every on-call shift over Thanksgiving week without being asked.', show_name: true,
      status: 'waiting', note: null, at: '2026-10-26T15:00:00Z', day: '2026-10-26', reviewed_by: null, about_me: true },
    { id: 'n-bo', who: BO, from: ANN, story: STORY_BO, show_name: false, status: 'posted', note: null,
      at: '2026-10-12T15:00:00Z', day: '2026-10-12', reviewed_by: 'Ray', about_me: false },
    { id: 'n-cy', who: CY, from: ANN, story: STORY_CY, show_name: true, status: 'posted', note: null,
      at: '2026-10-10T15:00:00Z', day: '2026-10-10', reviewed_by: 'Ray', about_me: false },
    { id: 'n-old', who: CY, from: ANN, story: 'Something from September that is not in this round at all.', show_name: true,
      status: 'posted', note: null, at: '2026-09-10T15:00:00Z', day: '2026-09-10', reviewed_by: 'Ray', about_me: false },
  ],
};

test('a reviewer posts one, and cannot review one about themselves', async ({ page }) => {
  await signedIn(page);
  const sent = await server(page, {
    recognition_view: () => view({ can_review: true, review: REVIEW }),
    review_nomination: () => ({ ok: true }),
  });
  await page.goto('/recognition');
  const review = page.getByRole('region', { name: 'Reviewing' });
  const dana = review.getByRole('listitem', { name: 'Nomination of Dana Kowalski' });
  await expect(dana).toContainText('From Ann Lee (not named on the wall)');
  await dana.getByLabel(/Note for the reviewers/).fill('checked with ops');
  await dana.getByRole('button', { name: 'Post to the wall' }).click();
  await expect.poll(() => sent.find((s) => s.fn === 'review_nomination')?.args).toEqual({
    p_id: 'w-1', p_post: true, p_note: 'checked with ops',
  });
  const mine = review.getByRole('listitem', { name: 'Nomination of Me Myself' });
  await expect(mine).toContainText('This one is about you, so somebody else reviews it.');
  await expect(mine.getByRole('button')).toHaveCount(0);
});

test('a round’s candidates are its dates’ posted nominations, and a reviewer picks one', async ({ page }) => {
  await signedIn(page);
  const sent = await server(page, {
    recognition_view: () => view({ can_review: true, review: REVIEW }),
    pick_round_winner: () => ({ ok: true }),
  });
  await page.goto('/recognition');
  const round = page.getByRole('listitem', { name: 'Employee Ownership Month' });
  await expect(round.getByText('Pick the winner from the 2 on the wall')).toBeVisible();
  await expect(round.getByText('Something from September')).toHaveCount(0);
  await round.getByRole('radio', { name: /Bo Jensen/ }).check();
  await round.getByLabel(/A line for the winner/).fill('For keeping a farm running.');
  await round.getByRole('button', { name: 'Announce the winner' }).click();
  await expect.poll(() => sent.find((s) => s.fn === 'pick_round_winner')?.args).toEqual({
    p_round: 'r-1', p_nomination: 'n-bo', p_note: 'For keeping a farm running.',
  });
});

test('a winner is shown to everybody, with the award on their card', async ({ page }) => {
  await signedIn(page);
  await server(page, {
    recognition_view: () => view({
      rounds: [{ ...ROUND, state: 'closed',
                 winner: { nomination: 'n-bo', who: BO, story: STORY_BO, note: 'For keeping a farm running.',
                           announced_at: '2026-11-01T15:00:00Z' } }],
      wall: [{ ...WALL[0], awards: ['Employee Ownership Month'] }, WALL[1]],
    }),
  });
  await page.goto('/recognition');
  const winners = page.getByRole('region', { name: 'Award winners' });
  await expect(winners).toContainText('Employee Ownership Month');
  await expect(winners).toContainText('Bo Jensen');
  await expect(winners).toContainText('For keeping a farm running.');
  await expect(page.getByRole('listitem', { name: 'Bo Jensen, nominated' })).toContainText('Employee Ownership Month');
});

test('the reviewer’s page has no WCAG A/AA violations axe can see', async ({ page }) => {
  await signedIn(page);
  await server(page, { recognition_view: () => view({ can_review: true, review: REVIEW, mine: [] }) });
  await page.goto('/recognition');
  await page.getByRole('button', { name: 'Nominate somebody' }).click();
  await expect(page.getByRole('form', { name: 'Nominate somebody' })).toBeVisible();
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const summary = results.violations.map((v) => ({ id: v.id, nodes: v.nodes.length, sample: v.nodes[0]?.html.slice(0, 300), why: v.nodes[0]?.failureSummary }));
  expect(summary, JSON.stringify(summary, null, 2)).toEqual([]);
});
