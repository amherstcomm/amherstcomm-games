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

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------
// A button that awaits its request inside a click handler never renders a
// Waiting, so a held request left it spinning for ever -- Check on Coverage,
// Look on Choosing a Day. It gets the same wait now, and comes back.

/** Hold one RPC open; answer the rest the way an empty site would. */
async function holding(page: import('@playwright/test').Page, held: string) {
  await page.route('**/rest/v1/rpc/**', async (route) => {
    const url = route.request().url();
    if (url.includes(`/rpc/${held}`)) {
      await new Promise(() => {});
      return;
    }
    const body = url.includes('publish_requests_sheet')
      ? { ok: true, requests: [] }
      : url.includes('theme_coverage')
        ? { ok: true, days: [] }
        : url.includes('pins_sheet')
          ? { ok: true, pins: [] }
          : url.includes('read_site_settings')
            ? {}
            : [];
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
}

const day = () => new Date(Date.now() + 20 * 86_400_000).toISOString().slice(0, 10);

test('Check on Coverage comes back with a sentence when the server does not answer', async ({ page }) => {
  await holding(page, 'theme_coverage');
  await page.goto('/admin/coverage');
  await page.getByLabel('Coverage from').fill(day());
  await page.getByLabel('Coverage until').fill(day());
  await page.getByRole('button', { name: 'Check' }).click();

  await expect(page.getByText(/Could not load the coverage: the server did not answer/)).toBeVisible({
    timeout: 20_000,
  });
  // And the button is a button again, not a spinner.
  await expect(page.getByRole('button', { name: 'Check' })).toBeEnabled();
});

test('Look on Choosing a Day comes back too', async ({ page }) => {
  await holding(page, 'pins_sheet');
  await page.goto('/admin/pins');
  await page.getByLabel('Pin date').fill(day());
  await page.getByRole('button', { name: 'Look' }).click();

  await expect(page.getByText(/Could not load the day: the server did not answer/)).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByRole('button', { name: 'Look' })).toBeEnabled();
});

// A write is different: it may have landed. So the sentence does not say
// "nothing has been changed" -- it says how to find out.
test('a republish that gets no answer says it cannot tell, and how to find out', async ({ page }) => {
  await holding(page, 'request_publish');
  await page.goto('/admin/pins');
  await page.getByLabel('Pin date').fill(day());
  await page.getByRole('button', { name: 'Republish this day' }).click();

  const said = page.getByText(/this cannot tell whether .* was asked for/);
  await expect(said).toBeVisible({ timeout: 20_000 });
  await expect(said).toContainText('asking again is safe');
  await expect(said).not.toContainText('nothing has been changed');
});
