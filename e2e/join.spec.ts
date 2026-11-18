// The way into a session: a code, or the list of what is running.
import { expect, test } from './fixtures';

test('a short code is answered, not ignored', async ({ page }) => {
  await page.goto('/join');
  const join = page.getByRole('button', { name: 'Join', exact: true });
  await join.click();
  await expect(page.getByRole('status')).toHaveText('Type the four-letter code first.');
  await page.getByRole('textbox').fill('AB');
  await join.click();
  await expect(page.getByRole('status')).toHaveText('The code is four letters long.');
});

test('what is running is marked live, with the way in', async ({ page }) => {
  await page.route('**/rest/v1/rpc/live_sessions', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json',
                    body: JSON.stringify([{ id: 's1', title: 'Friday trivia' }]) }));
  await page.goto('/join');
  const running = page.getByRole('region', { name: 'Running now' });
  await expect(running.getByRole('link', { name: /LIVE\s*Friday trivia\s*Join/ })).toHaveAttribute('href', '/live/s1');
});
