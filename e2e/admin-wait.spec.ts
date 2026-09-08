// What an admin panel says when the server does not answer.
//
// The morning a proxy in front of Supabase started dropping connections, the
// site read as "half of it loaded": the panels that had answered were fine and
// the rest spun, with nothing anywhere saying a request had failed. The first
// suspicion was the deploy, which is the expensive place to start looking.
//
// So the request is held open here rather than refused — a refusal has its own
// path in every panel and always did. This is the case that had none.
import { expect, test } from './fixtures';

/** Never answer the admin reads, the way a proxy holding a connection does. */
async function silent(page: import('@playwright/test').Page) {
  await page.route('**/rest/v1/rpc/**', async (route) => {
    const url = route.request().url();
    if (url.includes('word_lists_sheet')) {
      // Held, not aborted: an abort is an error the browser reports and this
      // is the failure that reports nothing.
      await new Promise(() => {});
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(url.includes('read_site_settings') ? {} : []),
    });
  });
}

test('a panel whose read never comes back says so, and offers to try again', async ({ page }) => {
  await silent(page);
  await page.goto('/admin/lists');

  // Before the wait is up it is still loading, because it still might be.
  await expect(page.getByText(/Could not load/)).toHaveCount(0);

  // And after it, a sentence rather than a spinner. The panel's own refusal
  // path says "not allowed"; this one is careful to say the opposite, because
  // a blank admin page invites exactly that suspicion.
  await expect(page.getByText('Could not load the word lists.')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/connection rather than your permissions/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
});

test('and trying again goes back to waiting rather than staying failed', async ({ page }) => {
  await silent(page);
  await page.goto('/admin/lists');
  await expect(page.getByText('Could not load the word lists.')).toBeVisible({ timeout: 20_000 });

  await page.getByRole('button', { name: 'Try again' }).click();
  // Back to the spinner: the read was asked for again, and it has not failed
  // again yet. A button that leaves the failure on screen looks like a button
  // that did nothing.
  await expect(page.getByText('Could not load the word lists.')).toHaveCount(0);
});
