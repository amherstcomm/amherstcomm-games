// Giveaways: tickets drawn for staff.
//
// The server decides who may do what, freezes the odds and records the result
// (giveaways.sql). What the page owes: everybody sees everything -- entrants,
// odds and why, the record; staff can put themselves in; organisers can set
// one up and enter anybody, typed names included; a drawing counts down to
// its drand round, asks drand itself, records it and lands on who drand's
// round picks; a replay catches a record that does not match drand; the
// people page hands out the running of giveaways; and a tournament locking
// the site does not lock giveaways out.
import { createHash } from 'node:crypto';
import { expect, test } from './fixtures';

const G = '3c2b1a00-5b2d-4f81-a3c6-0d9e8f7a6b54';
const CHAIN = '52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971';
// quicknet round 1000, as published: randomness is sha256(signature)
const RANDOMNESS = 'fe290beca10872ef2fb164d2aa4442de4566183ec51c56ff3cd603d930e54fdd';
const SIGNATURE =
  'b44679b9a59af2ec876b1a6b1ad52ea9b1615fc3982b19576350f93447cb1125e342b73a8dd2bacbe47e4b6b63ed5e39';

const ENTRANTS = [
  { person: '00000000-0000-0000-0000-00000000000a', name: 'Ada Lovelace', weight: 1000000 },
  { person: '00000000-0000-0000-0000-00000000000b', name: 'Bea Arthur', weight: 514239 },
  { person: '00000000-0000-0000-0000-00000000000c', name: 'Cy Young', weight: 1000000 },
];

const sha = (s: string) => createHash('sha256').update(s).digest('hex');

/** The fingerprint and the pick, a third time, from the definitions in
 *  schema.sql -- so these tests know who should win without asking the page. */
function fingerprint(round: number, wanted: number) {
  return sha(
    [
      'amherstcomm-giveaway-v1', `giveaway ${G}`, 'draw 1', `winners ${wanted}`, `chain ${CHAIN}`, `round ${round}`,
      ...[...ENTRANTS].sort((a, b) => (a.person < b.person ? -1 : 1)).map((e) => `${e.person} ${e.weight}`),
    ].join('\n')
  );
}
function pick(hash: string, wanted: number) {
  const pool = [...ENTRANTS].sort((a, b) => (a.person < b.person ? -1 : 1));
  const out: (typeof ENTRANTS[number] & { pick: number; hash: string; target: number; total: number })[] = [];
  for (let k = 1; k <= wanted; k++) {
    const total = pool.reduce((s, e) => s + e.weight, 0);
    const h = sha(`${RANDOMNESS}:${hash}:${k}`);
    const target = parseInt(h.slice(0, 13), 16) % total;
    let acc = 0;
    const i = pool.findIndex((e) => target < (acc += e.weight));
    out.push({ ...pool[i], pick: k, hash: h, target, total });
    pool.splice(i, 1);
  }
  return out;
}

const giveaway = (over: Record<string, unknown> = {}) => ({
  id: G, title: 'Brewers vs Cubs', prize: '2 tickets, section 112', details: 'Saturday 1:10pm',
  winners: 1, event_on: '2026-10-24', self_entry: true, entries_close_at: null,
  strength: 1, half_life_days: 365, status: 'open', cancelled_reason: null,
  created_at: '2026-10-10T14:00:00Z', created_by: 'Ray', ...over,
});

const entrants = () =>
  ENTRANTS.map((e) => ({
    ...e, linked: e.name !== 'Cy Young', entered_at: '2026-10-11T14:00:00Z', entered_by: 'Ray', self: true,
    attended: e.name === 'Bea Arthur' ? [{ on: '2026-09-16', what: 'Bucks game' }] : [],
  }));

type Sent = { fn: string; args: Record<string, unknown> };

async function server(
  page: import('@playwright/test').Page,
  state: { manage?: boolean; detail?: Record<string, unknown>; list?: unknown[]; off?: string[] } = {}
) {
  const sent: Sent[] = [];
  const detail = {
    ok: true, can_manage: state.manage ?? false, me: null,
    chain: { hash: CHAIN, genesis: 1692803367, period: 3 },
    giveaway: giveaway(), entrants: entrants(), draws: [], winners: [], log: [],
    ...state.detail,
  };
  await page.route('**/rest/v1/rpc/**', (route) => {
    const fn = route.request().url().match(/\/rpc\/(\w+)/)?.[1] ?? '';
    const args = JSON.parse(route.request().postData() ?? '{}');
    const reply = (b: unknown) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
    if (fn.includes('giveaway') || fn === 'set_person_capability') sent.push({ fn, args });
    if (fn === 'read_availability') return reply(state.off ?? []);
    if (fn === 'current_tournament') {
      return reply(state.off?.length
        ? { id: 't1', name: 'Ownership Cup', difficulty: 'hard', starts_on: '2026-10-01', ends_on: '2026-10-31',
            locks_site: true, next_round_starts_on: null }
        : null);
    }
    if (fn === 'giveaways_list') {
      return reply({ ok: true, can_manage: state.manage ?? false, giveaways: state.list ?? [] });
    }
    if (fn === 'giveaway_detail') return reply(detail);
    if (fn === 'find_giveaway_people') {
      return reply({ ok: true, people: [{ person: null, user: 'u-dee', name: 'Dee Signedin', email: 'dee@example.net' }] });
    }
    if (fn === 'commit_giveaway_draw') {
      const roundAt = new Date(Date.now() + 2000);
      const round = Math.floor((roundAt.getTime() / 1000 - 1692803367) / 3) + 1;
      const hash = fingerprint(round, 1);
      Object.assign(detail, {
        giveaway: giveaway({ status: 'drawing' }),
        draws: [{
          id: 'd-1', seq: 1, reason: 'first drawing', wanted: 1, entrants: ENTRANTS, total: 2514239,
          snapshot_hash: hash, chain: CHAIN, round, round_at: roundAt.toISOString(),
          committed_at: new Date().toISOString(), committed_by: 'Ray', randomness: null, signature: null,
          winners: null, revealed_at: null, revealed_by: null,
        }],
      });
      return reply({ ok: true, draw: 'd-1', seq: 1, round, round_at: roundAt.toISOString(), snapshot_hash: hash });
    }
    if (fn === 'reveal_giveaway_draw') {
      const d = (detail.draws as Record<string, unknown>[])[0];
      const winners = pick(d.snapshot_hash as string, 1);
      Object.assign(d, { randomness: RANDOMNESS, signature: SIGNATURE, winners, revealed_at: new Date().toISOString() });
      Object.assign(detail, {
        giveaway: giveaway({ status: 'drawn' }),
        winners: winners.map((w) => ({ person: w.person, name: w.name, pick: 1, draw: 1, status: 'pending' })),
      });
      return reply({ ok: true, winners });
    }
    if (fn === 'my_capabilities') return reply(['users.manage']);
    if (fn === 'people_with_roles') {
      return reply({ ok: true, people: [
        { user: 'u-ray', email: 'ray@example.net', name: 'Ray', role: 'games.admin', grants: [], self: true },
        { user: 'u-pat', email: 'pat@example.net', name: 'Pat from HR', role: null, grants: [] },
      ] });
    }
    if (fn.includes('giveaway') || fn === 'set_person_capability') return reply({ ok: true, id: G, person: 'p-new' });
    return route.fallback();
  });
  // drand, answering whichever round is asked with round 1000's values: the
  // page checks the signature hashes to the randomness, and a real round's do.
  await page.route('https://api.drand.sh/**', (route) => {
    const round = Number(route.request().url().split('/').pop());
    return route.fulfill({
      status: 200, contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({ round, randomness: RANDOMNESS, signature: SIGNATURE }),
    });
  });
  return sent;
}

test('everybody sees who is in it, at what chance, and why', async ({ page }) => {
  await server(page);
  await page.goto(`/giveaways/${G}`);
  await expect(page.getByRole('heading', { name: 'Brewers vs Cubs' })).toBeVisible();
  const who = page.getByRole('region', { name: 'Who is in it' });
  await expect(who.getByText('Ada Lovelace')).toBeVisible();
  // 1,000,000 of 2,514,239, and the one who went last month at about half that
  await expect(who.locator('li', { hasText: 'Ada Lovelace' })).toContainText('40%');
  await expect(who.locator('li', { hasText: 'Bea Arthur' })).toContainText('20%');
  await expect(who.locator('li', { hasText: 'Bea Arthur' })).toContainText('Went to Bucks game');
  await expect(who.locator('li', { hasText: 'Cy Young' })).toContainText('no account');
  // and nothing for running it, to somebody who does not
  await expect(page.getByRole('button', { name: /Draw/ })).toHaveCount(0);
});

test('staff can put themselves in', async ({ page }) => {
  const sent = await server(page);
  await page.goto(`/giveaways/${G}`);
  await page.getByRole('button', { name: 'Put me in' }).click();
  await expect.poll(() => sent.find((s) => s.fn === 'enter_giveaway')?.args).toEqual({ p_id: G, p_in: true, p_terms: null });
});

test('an organiser sets one up and enters somebody who has never signed in, by name', async ({ page }) => {
  const sent = await server(page, { manage: true });
  await page.goto('/giveaways');
  await page.getByRole('button', { name: 'New giveaway' }).click();
  await page.getByLabel('What it is').fill('Bucks vs Bulls');
  await page.getByLabel('The prize, for each winner').fill('4 tickets');
  await page.getByLabel('How many winners').fill('2');
  await page.getByRole('button', { name: 'Create it' }).click();
  await expect.poll(() => sent.find((s) => s.fn === 'save_giveaway')?.args).toMatchObject({
    p_id: null, p_title: 'Bucks vs Bulls', p_prize: '4 tickets', p_winners: 2, p_strength: 1, p_half_life_days: 365,
  });

  await page.goto(`/giveaways/${G}`);
  await page.getByLabel('Enter somebody', { exact: true }).fill('Ed Nosignin');
  await page.getByRole('button', { name: 'Enter by name' }).click();
  await expect.poll(() => sent.find((s) => s.fn === 'add_giveaway_entrant')?.args).toEqual({
    p_id: G, p_person: null, p_user: null, p_name: 'Ed Nosignin',
  });
});

// Asked as chances, because "counts half as much after a year" read as 50%
// and meant 67%: the page fits the curve the server stores to the two figures.
test('the odds are set as chances: right after going, and a year after', async ({ page }) => {
  const sent = await server(page, { manage: true });
  await page.goto('/giveaways');
  await page.getByRole('button', { name: 'New giveaway' }).click();
  await expect(page.getByLabel('Right after going')).toHaveValue('50');
  await expect(page.getByLabel('A year after')).toHaveValue('67');
  await page.getByLabel('What it is').fill('Bucks vs Bulls');
  await page.getByLabel('A year after').fill('75');
  await expect(page.getByText(/50% right after, \d+% a month later, 75% a year later/)).toBeVisible();
  await page.getByRole('button', { name: 'Create it' }).click();
  // 1 / (1 + 1 x 0.5^(365/h)) = 0.75  =>  h = 365 ln 2 / ln 3 = 230 days
  await expect.poll(() => sent.find((s) => s.fn === 'save_giveaway')?.args).toMatchObject({
    p_strength: 1, p_half_life_days: 230,
  });
});

test('and a year after that is not higher than right after is refused before saving', async ({ page }) => {
  await server(page, { manage: true });
  await page.goto('/giveaways');
  await page.getByRole('button', { name: 'New giveaway' }).click();
  await page.getByLabel('A year after').fill('40');
  await expect(page.getByRole('status')).toContainText('has to be higher than right after');
  await expect(page.getByRole('button', { name: 'Create it' })).toBeDisabled();
});

test('a drawing counts down to its drand round, records it, and lands on who it picks', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const sent = await server(page, { manage: true });
  page.on('dialog', (d) => void d.accept());
  await page.goto(`/giveaways/${G}`);
  await page.getByRole('button', { name: 'Draw the winner' }).click();

  await expect(page).toHaveURL(new RegExp(`/giveaways/${G}/replay$`));
  await expect(page.getByText(/which nobody can know until it is published/)).toBeVisible();

  await expect.poll(() => sent.some((s) => s.fn === 'reveal_giveaway_draw'), { timeout: 15000 }).toBe(true);
  const args = sent.find((s) => s.fn === 'reveal_giveaway_draw')!.args;
  expect(args).toMatchObject({ p_draw: 'd-1', p_randomness: RANDOMNESS, p_signature: SIGNATURE });

  const expected = pick(fingerprint(args.p_round as number, 1), 1)[0].name;
  await expect(page.getByText('The winner', { exact: true }).first()).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole('status').filter({ hasText: expected })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('a replay plays the drawing from drand, and says so when the record disagrees', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const round = 22_000_000;
  const hash = fingerprint(round, 1);
  const honest = pick(hash, 1);
  const wrong = ENTRANTS.find((e) => e.person !== honest[0].person)!;
  await server(page, {
    detail: {
      giveaway: giveaway({ status: 'drawn' }),
      draws: [{
        id: 'd-1', seq: 1, reason: 'first drawing', wanted: 1, entrants: ENTRANTS, total: 2514239,
        snapshot_hash: hash, chain: CHAIN, round, round_at: '2026-01-01T00:00:00Z',
        committed_at: '2025-12-31T23:59:30Z', committed_by: 'Ray', randomness: RANDOMNESS, signature: SIGNATURE,
        // somebody drand's round does not pick
        winners: [{ ...wrong, pick: 1, hash: honest[0].hash, target: 0, total: 2514239 }],
        revealed_at: '2026-01-01T00:00:01Z', revealed_by: 'Ray',
      }],
      winners: [{ person: wrong.person, name: wrong.name, pick: 1, draw: 1, status: 'accepted' }],
    },
  });
  await page.goto(`/giveaways/${G}/replay`);
  await page.getByRole('button', { name: 'Play the drawing' }).click();
  await expect(page.getByRole('status').filter({ hasText: honest[0].name })).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole('alert')).toContainText('not the ones drand’s round picks');
});

test('the people page hands somebody the running of giveaways, without a role', async ({ page }) => {
  const sent = await server(page);
  await page.goto('/admin/people');
  const pat = page.locator('li', { hasText: 'Pat from HR' });
  // click, not check: the box shows what the server says, and this stub
  // does not change its answer
  await pat.getByRole('checkbox', { name: 'Runs giveaways' }).click();
  await expect.poll(() => sent.find((s) => s.fn === 'set_person_capability')?.args).toEqual({
    p_user: 'u-pat', p_capability: 'giveaways.manage', p_on: true,
  });
  // an administrator holds it already, and the box says so
  await expect(page.locator('li', { hasText: 'ray@example.net' }).getByRole('checkbox', { name: /Runs giveaways/ }))
    .toBeDisabled();
});

test('a tournament locking the site does not lock the giveaways out', async ({ page }) => {
  await server(page, {
    off: ['site:outside-tournament', 'site:other-sessions'],
    list: [{ id: G, title: 'Brewers vs Cubs', prize: '2 tickets', winners: 1, event_on: '2026-10-24',
             status: 'open', self_entry: true, entries_close_at: null, entrants: 3, entered: false, drawn: [] }],
  });
  await page.goto('/giveaways');
  await expect(page.getByRole('heading', { name: 'Giveaways' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Brewers vs Cubs/ })).toBeVisible();
});
