// Private comments: an open question only the host and site admins read. The
// server's side -- who may read, and what everybody else gets -- is
// supabase/tests/private.sql.
import { expect, test } from './fixtures';

const SESSION = '9d4e5f60-7182-4c9d-8e0f-2a3b4c5d6e7f';
type Call = { fn: string; args: Record<string, unknown> };

test('the person answering is told who reads it, and offered no "hide my name" that would mean nothing', async ({ page }) => {
  await page.route('**/rest/v1/rpc/**', (route) => {
    const fn = route.request().url().match(/\/rpc\/(\w+)/)?.[1] ?? '';
    const body = fn === 'current_item'
      ? { state: 'open', mode: 'open', yours: false, id: 'q1', position: 1, kind: 'open',
          prompt: 'Anything you would rather tell us privately?', payload: { private: true },
          seconds: null, opened_at: new Date().toISOString(), now: new Date().toISOString(),
          mine: null, answer: null, total: 1, done: 0 }
      : {};
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.goto(`/live/${SESSION}`);
  await expect(page.getByText(/Only the person running this and site admins read your answer\. They see your name with it/)).toBeVisible();
  await expect(page.getByRole('checkbox', { name: /Don.t show my name/ })).toHaveCount(0);
});

test('the author sets it on the open question, and a private one is never a word cloud', async ({ page }) => {
  const calls: Call[] = [];
  const sheet = {
    ok: true,
    session: { id: SESSION, title: 'Team feedback', state: 'draft', late_join: 'strict', current_item: null,
               code: null, mode: 'open', qa: false, shared: false, points: 'off' },
    kinds: [{ kind: 'open', description: 'x', scored: false }],
    items: [],
  };
  await page.route('**/rest/v1/rpc/**', (route) => {
    const fn = route.request().url().match(/\/rpc\/(\w+)/)?.[1] ?? '';
    calls.push({ fn, args: JSON.parse(route.request().postData() ?? '{}') });
    const body = fn === 'session_sheet' ? sheet : fn === 'save_item' ? { ok: true, id: 'i1' } : [];
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.goto(`/sessions/${SESSION}`);
  await page.getByRole('button', { name: 'Add a question' }).click();
  await page.getByRole('button', { name: 'Open question', exact: true }).click();
  await page.getByRole('textbox', { name: 'Question' }).fill('Anything you would rather tell us privately?');
  await expect(page.getByRole('checkbox', { name: /word cloud/ })).toBeVisible();
  await page.getByRole('checkbox', { name: /Only the host and site admins read the answers/ }).check();
  await expect(page.getByRole('checkbox', { name: /word cloud/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Add question' }).click();
  await expect.poll(() => calls.find((c) => c.fn === 'save_item')?.args.p_payload).toEqual({ private: true });
});

async function results(page: import('@playwright/test').Page, readable: boolean) {
  const calls: Call[] = [];
  await page.route('**/rest/v1/rpc/**', (route) => {
    const fn = route.request().url().match(/\/rpc\/(\w+)/)?.[1] ?? '';
    calls.push({ fn, args: JSON.parse(route.request().postData() ?? '{}') });
    const body =
      fn === 'session_results'
        ? { ok: true, title: 'Team feedback', state: 'closed', mode: 'open', shared: true, privacy: 'room', keeps_score: false,
            items: [{ id: 'q1', position: 1, kind: 'open', prompt: 'Anything you would rather tell us privately?',
                      chart: { type: 'private', total: 2, readable } }] }
        : fn === 'session_scores' ? { ok: true, title: 'Team feedback', standings: [], questions: [] }
        : fn === 'private_comments'
          ? { ok: true, privacy: 'room', comments: [
              { text: 'The on-call rota is wearing people out.', who: 'Ada Lovelace', at: '2026-11-18T15:00:00Z' },
              { text: 'More notice before schedule changes.', who: 'Bo Jensen', at: '2026-11-18T16:00:00Z' }] }
          : {};
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.goto(`/scores/${SESSION}`);
  return calls;
}

test('the projector-ready slides show only how many', async ({ page }) => {
  await results(page, true);
  await expect(page.getByText('2 answers. Only the host and site admins read these.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Read them' })).toHaveCount(0);
  await expect(page.getByText(/on-call rota/)).toHaveCount(0);
});

test('the host reads them on the results list, asked for rather than shown on arrival', async ({ page }) => {
  const calls = await results(page, true);
  await page.getByRole('button', { name: 'Leave' }).click();
  expect(calls.some((c) => c.fn === 'private_comments')).toBe(false);
  await page.getByRole('button', { name: 'Read them' }).click();
  const list = page.getByRole('region', { name: 'Private answers' });
  await expect(list).toContainText('The on-call rota is wearing people out.');
  await expect(list).toContainText('Ada Lovelace');
  await list.getByRole('button', { name: 'Hide them' }).click();
  await expect(list).toHaveCount(0);
});

test('anybody else with the shared results sees the count and no way in', async ({ page }) => {
  const calls = await results(page, false);
  await page.getByRole('button', { name: 'Leave' }).click();
  await expect(page.getByText('2 answers. Only the host and site admins read these.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Read them' })).toHaveCount(0);
  expect(calls.some((c) => c.fn === 'private_comments')).toBe(false);
});
