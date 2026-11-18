// The footer's badges for what waits -- nominations to review, suggestions to
// read -- and a reported picture in the report queue.
//
// The counts are the server's (recognition_waiting, suggestions_unread: zero
// for anybody who reviews or reads nothing). What the page owes: a badge only
// when there is something, read out with what it counts, and asked again as
// the reader moves around so it goes once dealt with.
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

test('badges show what waits, and go once it is dealt with', async ({ page }) => {
  await signedIn(page);
  let unread = 2;
  await server(page, {
    recognition_waiting: () => 3,
    suggestions_unread: () => unread,
    recognition_view: () => ({ ok: true, can_review: true, me: 'u-me', rounds: [], wall: [], mine: [],
                               review: { waiting: 3, nominations: [] } }),
  });
  await page.goto('/');
  const footer = page.locator('footer');
  await expect(footer.getByRole('link', { name: 'Recognition 3 waiting for review' })).toBeVisible();
  await expect(footer.getByRole('link', { name: 'Suggestion box 2 new' })).toBeVisible();

  // read elsewhere: the next page change asks again
  unread = 0;
  await footer.getByRole('link', { name: /Recognition/ }).click();
  await expect(footer.getByRole('link', { name: 'Suggestion box', exact: true })).toBeVisible();
});

test('nobody with nothing to review or read sees a badge', async ({ page }) => {
  await signedIn(page);
  await server(page, { recognition_waiting: () => 0, suggestions_unread: () => 0 });
  await page.goto('/');
  const footer = page.locator('footer');
  await expect(footer.getByRole('link', { name: 'Recognition', exact: true })).toBeVisible();
  await expect(footer.getByRole('link', { name: 'Suggestion box', exact: true })).toBeVisible();
});

test('a reported picture is shown in the queue, with the way to take it down', async ({ page }) => {
  await signedIn(page);
  const sent = await server(page, {
    owner_reports: () => [{
      id: 'r-1', kind: 'player', ticket: 'abc123', reason: 'not for work', action_token: 't', trust: 'verified',
      created_at: '2026-11-17T15:00:00Z', days_open: 0,
      evidence: { profile: 'u-bo', name: 'Bo Jensen', what: 'avatar', avatar: { kind: 'preset', value: 'cat', color: '#2563eb' } },
    }],
    set_person_avatar: () => ({ ok: true }),
  });
  await page.goto('/reports');
  await expect(page.getByText('Bo Jensen\'s picture')).toBeVisible();
  page.once('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: 'Take this picture down' }).click();
  await expect(page.getByText('Taken down. Now handle the report to close it.')).toBeVisible();
  expect(sent.find((s) => s.fn === 'set_person_avatar')?.args).toEqual({ p_user: 'u-bo', p_blocked: true });
});
