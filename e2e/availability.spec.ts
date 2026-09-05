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

// The gap that let the last one through.
//
// Everything above stubs the availability feed with a key written by hand, and
// the unit tests filter with keys written by hand. Nothing checked that the key
// the *admin page* writes is the key the site *reads* — and it was not: the
// page keyed its switches by mode and the site filtered by slug, so the three
// games whose names differ (guess is `pattern`, scramble is `descramble`, hive
// is `bee`) could be switched off and stayed on screen.
//
// So this presses the switch and then looks at the menu, which is the only way
// to catch the two halves disagreeing.
test('switching a game off from the admin page actually removes it', async ({ page }) => {
  const written: string[] = [];
  let off: string[] = [];
  // The sheet has to reflect the write, as the real one does — a stub that
  // forgets makes the control spring back and says nothing about the bug.
  let rows: { feature: string; enabled: boolean; starts_at: null; ends_at: null }[] = [];
  await page.route('**/rest/v1/rpc/**', (route) => {
    const url = route.request().url();
    if (url.includes('set_feature_window')) {
      const body = JSON.parse(route.request().postData() ?? '{}');
      written.push(body.p_feature);
      // The server's rule: enabled with no window means no row at all.
      off = body.p_enabled ? off.filter((f) => f !== body.p_feature) : [...off, body.p_feature];
      rows = [
        ...rows.filter((r) => r.feature !== body.p_feature),
        ...(body.p_enabled
          ? []
          : [{ feature: body.p_feature, enabled: false, starts_at: null, ends_at: null }]),
      ];
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      });
    }
    const body = url.includes('read_availability')
      ? off
      : url.includes('feature_windows_sheet')
        ? { ok: true, features: [] }
        : url.includes('site_settings_sheet')
          ? { ok: true, settings: [] }
          : url.includes('word_lists_sheet')
            ? { ok: true, lists: [] }
            : url.includes('people_with_roles')
              ? { ok: true, people: [] }
              : [];
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });

  await page.goto('/admin');
  // Hive, deliberately: its mode is `bee`, so it is one of the three the bug
  // was invisible on.
  // click rather than uncheck: the control is driven by a round trip, and
  // uncheck() insists the state has flipped before it returns. What is being
  // tested is the key that went out and what the menu did about it.
  await page.getByRole('checkbox', { name: 'Offer Hive' }).click();
  await expect.poll(() => written).toEqual(['game:hive']);

  await page.goto('/');
  await expect(page.getByRole('link', { name: /Hive/ })).toHaveCount(0);
});
