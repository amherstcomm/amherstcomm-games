// Judged giveaways: answer the questions, and judges choose.
//
// The server decides who may see and do what (giveawaysjudged.sql). What the
// pages owe: an organiser can set one up with its questions; staff enter by
// answering; a judge ranks blind -- labels, never names -- and cannot rank
// their own; an organiser settles a tie at the last winning place; and once
// the winners are out, every entry shows with its name, points and the judges'
// ranks.
import { expect, test } from './fixtures';

const G = '4d3c2b1a-5b2d-4f81-a3c6-0d9e8f7a6b54';
const Q1 = 'q-1';
const Q2 = 'q-2';

const giveaway = (over: Record<string, unknown> = {}) => ({
  id: G, title: 'Packers tickets', prize: '2 seats', details: '', winners: 1, event_on: '2026-11-02',
  self_entry: true, entries_close_at: null, strength: 1, half_life_days: 365, status: 'open',
  cancelled_reason: null, created_at: '2026-10-20T14:00:00Z', created_by: 'Ray', mode: 'judged', picks: 2, ...over,
});

const QUESTIONS = [
  { id: Q1, prompt: 'What does being an owner mean to you?' },
  { id: Q2, prompt: 'Who would you take?' },
];

const blindEntries = [
  { person: null, key: null, label: 'Entry 1', name: null, own: false, points: null, firsts: null, ranks: null,
    answers: [{ question: Q1, answer: 'A voice in what we build' }, { question: Q2, answer: 'My dad' }] },
  { person: null, key: null, label: 'Entry 2', name: null, own: true, points: null, firsts: null, ranks: null,
    answers: [{ question: Q1, answer: 'Owning the outcome' }, { question: Q2, answer: 'My crew' }] },
  { person: null, key: null, label: 'Entry 3', name: null, own: false, points: null, firsts: null, ranks: null,
    answers: [{ question: Q1, answer: 'Pride in the work' }, { question: Q2, answer: 'Nobody' }] },
];

const judging = (over: Record<string, unknown> = {}) => ({
  ok: true, is_judge: false, decided: false, picks: 2, questions: QUESTIONS,
  judges: [{ user: 'u-j1', name: 'Judge One', ranked: false }, { user: 'u-j2', name: 'Judge Two', ranked: true }],
  entries_count: 3, mine: null, entered: false, entries: [], my_ranking: null, ...over,
});

type Sent = { fn: string; args: Record<string, unknown> };

async function server(
  page: import('@playwright/test').Page,
  state: { manage?: boolean; giveaway?: Record<string, unknown>; judging?: Record<string, unknown>;
           winners?: unknown[]; announce?: (args: Record<string, unknown>) => unknown } = {}
) {
  const sent: Sent[] = [];
  await page.route('**/rest/v1/rpc/**', (route) => {
    const fn = route.request().url().match(/\/rpc\/(\w+)/)?.[1] ?? '';
    const args = JSON.parse(route.request().postData() ?? '{}');
    const reply = (b: unknown) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
    if (fn.includes('giveaway') || fn.includes('judg') || fn.includes('ranking')) sent.push({ fn, args });
    if (fn === 'giveaways_list') return reply({ ok: true, can_manage: state.manage ?? false, giveaways: [] });
    if (fn === 'giveaway_detail') {
      return reply({
        ok: true, can_manage: state.manage ?? false, me: null,
        chain: { hash: 'x', genesis: 1692803367, period: 3 },
        giveaway: giveaway(state.giveaway), entrants: [
          { person: 'p-ada', name: 'Ada', linked: true, entered_at: '2026-10-20T15:00:00Z', entered_by: 'Ada', self: true, weight: 1000000, attended: [] },
        ],
        draws: [], winners: state.winners ?? [], log: [],
      });
    }
    if (fn === 'giveaway_judging') return reply(judging(state.judging));
    if (fn === 'announce_giveaway_results' && state.announce) return reply(state.announce(args));
    if (fn === 'find_giveaway_people') {
      return reply({ ok: true, people: [
        { person: null, user: 'u-j3', name: 'Judge Three', email: 'j3@example.net' },
        { person: 'p-dee', user: null, name: 'Dee Paper', email: null },
      ] });
    }
    if (fn.includes('giveaway') || fn.includes('judg') || fn.includes('ranking')) return reply({ ok: true, id: G, person: 'p' });
    return route.fallback();
  });
  return sent;
}

test('an organiser sets one up: judged, with its questions and how many each judge ranks', async ({ page }) => {
  const sent = await server(page, { manage: true });
  await page.goto('/giveaways');
  await page.getByRole('button', { name: 'New giveaway' }).click();
  await page.getByLabel('Answer questions, judged').check();
  // the drawing's odds are nothing to do with it
  await expect(page.getByLabel('Right after going')).toHaveCount(0);
  await page.getByLabel('What it is').fill('Packers tickets');
  await page.getByLabel(/One per line/).fill('What does being an owner mean to you?\nWho would you take?\n');
  await page.getByLabel('Each judge ranks their top').fill('2');
  await page.getByRole('button', { name: 'Create it' }).click();
  await expect.poll(() => sent.find((s) => s.fn === 'save_giveaway')?.args).toMatchObject({
    p_title: 'Packers tickets', p_mode: 'judged', p_picks: 2,
    p_questions: ['What does being an owner mean to you?', 'Who would you take?'],
  });
});

test('staff enter by answering every question', async ({ page }) => {
  const sent = await server(page);
  await page.goto(`/giveaways/${G}`);
  const form = page.getByRole('region', { name: 'Enter by answering' });
  await expect(form.getByRole('button', { name: 'Enter' })).toBeDisabled();
  await form.getByLabel('What does being an owner mean to you?').fill('A voice in what we build');
  await form.getByLabel('Who would you take?').fill('My dad');
  await form.getByRole('button', { name: 'Enter' }).click();
  await expect.poll(() => sent.find((s) => s.fn === 'enter_judged_giveaway')?.args).toEqual({
    p_id: G, p_answers: { [Q1]: 'A voice in what we build', [Q2]: 'My dad' },
    p_person: null, p_user: null, p_name: null, p_terms: null,
  });
  // and there is no "put me in" for a judged one
  await expect(page.getByRole('button', { name: 'Put me in' })).toHaveCount(0);
});

test('a judge ranks blind, by label, and cannot rank their own entry', async ({ page }) => {
  const sent = await server(page, {
    giveaway: { status: 'judging' },
    judging: { is_judge: true, entries: blindEntries, my_ranking: [] },
  });
  await page.goto(`/giveaways/${G}`);
  const judging = page.getByRole('region', { name: 'Your judging' });
  await expect(judging.getByText('A voice in what we build')).toBeVisible();
  // no names anywhere in what the judge is shown
  await expect(judging.getByText('Ada')).toHaveCount(0);
  await expect(judging.getByText('Your own entry: you cannot rank it')).toBeVisible();
  await expect(judging.getByLabel('Your rank for Entry 2')).toHaveCount(0);

  await judging.getByLabel('Your rank for Entry 3').selectOption({ label: '1st' });
  await judging.getByLabel('Your rank for Entry 1').selectOption({ label: '2nd' });
  await judging.getByRole('button', { name: 'Save my ranking' }).click();
  await expect.poll(() => sent.find((s) => s.fn === 'save_giveaway_ranking')?.args).toEqual({
    p_id: G, p_labels: ['Entry 3', 'Entry 1'],
  });
});

test('an organiser announces, settling a tie at the last winning place', async ({ page }) => {
  const sent = await server(page, {
    manage: true,
    giveaway: { status: 'judging' },
    judging: { entries: blindEntries.map((e, i) => ({ ...e, own: false, key: `k-${i + 1}`, points: 2 })) },
    announce: (args) =>
      args.p_tiebreak
        ? { ok: true }
        : { ok: false, reason: 'tie', need: 1, points: 2,
            tied: [{ key: 'k-1', label: 'Entry 1' }, { key: 'k-3', label: 'Entry 3' }] },
  });
  page.on('dialog', (d) => void d.accept());
  await page.goto(`/giveaways/${G}`);
  const results = page.getByRole('region', { name: 'The results' });
  await expect(results).toContainText('1 of 2 judges have ranked.');
  await results.getByRole('button', { name: 'Announce the winners' }).click();
  const tie = results.getByRole('group', { name: 'Settle the tie' });
  await expect(tie).toContainText('A tie at 2 points for the last place. Choose 1');
  await tie.getByLabel('Entry 3').check();
  await tie.getByRole('button', { name: 'Announce with these' }).click();
  await expect.poll(() => sent.filter((s) => s.fn === 'announce_giveaway_results').map((s) => s.args.p_tiebreak))
    .toEqual([null, ['k-3']]);
});

test('once decided, every entry shows with its name, points and the judges’ ranks', async ({ page }) => {
  await server(page, {
    giveaway: { status: 'drawn' },
    winners: [{ person: 'p-ada', name: 'Ada', pick: 1, draw: null, status: 'pending', decided_at: null, decided_by: null }],
    judging: {
      decided: true,
      entries: [
        { person: 'p-ada', key: 'p-ada', label: 'Entry 1', name: 'Ada', own: false, points: 3, firsts: 1,
          ranks: [{ judge: 'Judge Two', rank: 1 }, { judge: 'Judge One', rank: 2 }],
          answers: [{ question: Q1, answer: 'A voice in what we build' }, { question: Q2, answer: 'My dad' }] },
        { person: 'p-cy', key: 'p-cy', label: 'Entry 3', name: 'Cy', own: false, points: 2, firsts: 1,
          ranks: [{ judge: 'Judge One', rank: 1 }],
          answers: [{ question: Q1, answer: 'Pride in the work' }, { question: Q2, answer: 'Nobody' }] },
      ],
    },
  });
  await page.goto(`/giveaways/${G}`);
  await expect(page.getByText('Decided')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Who won' })).toContainText('Ada');
  const all = page.getByRole('region', { name: 'Every entry' });
  await expect(all).toContainText('1. Ada');
  await expect(all).toContainText('1st from Judge Two · 2nd from Judge One');
  await expect(all).toContainText('Pride in the work');
});

test('with terms, answering waits on agreeing to them, and sends what was agreed to', async ({ page }) => {
  const sent = await server(page, { giveaway: { terms_text: 'Staff only.', terms_hash: 'h-terms' } });
  await page.goto(`/giveaways/${G}`);
  const form = page.getByRole('region', { name: 'Enter by answering' });
  await form.getByLabel('What does being an owner mean to you?').fill('A voice in what we build');
  await form.getByLabel('Who would you take?').fill('My dad');
  await expect(form.getByRole('button', { name: 'Enter' })).toBeDisabled();
  await form.getByLabel('I have read and agree to the terms and conditions').check();
  await form.getByRole('button', { name: 'Enter' }).click();
  await expect.poll(() => sent.find((s) => s.fn === 'enter_judged_giveaway')?.args).toMatchObject({ p_terms: 'h-terms' });
});
