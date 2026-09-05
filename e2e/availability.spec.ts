// What this deployment is offering.
//
// Two halves, and the second is the one that makes switching a game off mean
// anything: it goes from the menu *and* from its own address. Hiding it from
// the menu alone leaves it playable to whoever bookmarked it, which during an
// event is exactly the person who was told it is not ready.
import { expect, test } from './fixtures';

/** Stand up the site with some things switched off. */
async function site(page: import('@playwright/test').Page, off: string[]) {
  await page.route('**/rest/v1/rpc/**', (route) => {
    const url = route.request().url();
    const body = url.includes('read_availability')
      ? off
      : url.includes('read_site_settings')
        ? {}
        : [];
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
}

test('a game that is on is in the menu', async ({ page }) => {
  await site(page, []);
  await page.goto('/');
  await expect(page.getByRole('link', { name: /Hive/ }).first()).toBeVisible();
});

test('and one that is switched off is not', async ({ page }) => {
  await site(page, ['game:hive']);
  await page.goto('/');
  await expect(page.getByRole('link', { name: /Hive/ })).toHaveCount(0);
  // Its neighbours are untouched — switching one off is not switching the site
  // off.
  await expect(page.getByRole('link', { name: /Guess/ }).first()).toBeVisible();
});

// The half that matters. A preference can be overruled by the interface; a
// deployment's decision cannot, or it means nothing to anybody with a bookmark.
test('and is refused at its own address, not merely hidden', async ({ page }) => {
  await site(page, ['game:hive']);
  await page.goto('/daily/hive');
  // Landed on something else that is still offered, rather than on the board.
  await expect(page).not.toHaveURL(/\/daily\/hive$/);
  await expect(page.getByText(/letters left|Spelling|pangram/i)).toHaveCount(0);
});

test('while an address that is still offered opens as usual', async ({ page }) => {
  await site(page, ['game:hive']);
  await page.goto('/daily/guess');
  await expect(page).toHaveURL(/\/daily\/guess$/);
});
