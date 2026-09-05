// The knobs a deployment turns without rebuilding itself.
//
// The first test here is the least clever and the most important: the page
// renders at all. Two of the hooks that feed this feature were written at
// module scope during the change — valid TypeScript, and a white screen on
// load for every visitor, because a hook called outside a component throws
// before anything paints. Lint caught it; nothing else would have, and the
// suite that should have is this one.
import { expect, test } from './fixtures';

const SETTINGS = {
  ok: true,
  settings: [
    {
      key: 'subtitle',
      description: 'The line under the site name — the event this run is for',
      value: 'Employee Ownership Month',
      updated_at: '2026-09-01T12:00:00Z',
      updated_by: 'Ray',
    },
    {
      key: 'announcement',
      description: 'A short notice on the home page, or empty for none',
      value: '',
      updated_at: null,
      updated_by: null,
    },
    {
      key: 'office_zone',
      description: 'The company clock an open session’s opening hours are read in',
      value: '',
      updated_at: null,
      updated_by: null,
    },
  ],
};

const PEOPLE = {
  ok: true,
  people: [
    {
      user: 'a1',
      email: 'ray@amherstcomm.net',
      name: 'Ray',
      role: 'games.admin',
      granted_at: '2026-01-01T00:00:00Z',
      self: true,
    },
    {
      user: 'b1',
      email: 'editor@amherstcomm.net',
      name: null,
      role: 'games.edit',
      granted_at: '2026-02-01T00:00:00Z',
      self: false,
    },
  ],
};

const FOUND = [
  { user: 'c1', email: 'dave.jones@amherstcomm.net', name: 'Dave Jones', role: null },
];

/** Stand up the admin page, collecting whatever it tries to save. */
async function admin(
  page: import('@playwright/test').Page,
  sent: Record<string, string>[],
  { refuse = '' } = {}
) {
  await page.route('**/rest/v1/rpc/**', (route) => {
    const url = route.request().url();
    // Both writers, because both halves of the page save the same way and a
    // test that only collected one silently recorded nothing for the other.
    if (url.includes('set_site_setting') || url.includes('set_person_role')) {
      sent.push(JSON.parse(route.request().postData() ?? '{}'));
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(refuse ? { ok: false, reason: refuse } : { ok: true }),
      });
    }
    const body = url.includes('site_settings_sheet')
      ? SETTINGS
      : url.includes('people_with_roles')
        ? PEOPLE
        : url.includes('find_people')
          ? { ok: true, people: FOUND }
          : url.includes('read_site_settings')
            ? { subtitle: 'Employee Ownership Month' }
            : url.includes('my_capabilities')
              ? ['site.settings', 'users.manage']
              : [];
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
  await page.goto('/admin');
}

test('the settings page renders, which is not a given', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await admin(page, []);
  await expect(page.getByRole('heading', { name: 'Site settings' })).toBeVisible();
  // A hook called outside a component throws here rather than rendering wrong.
  expect(errors, 'the page threw while loading').toEqual([]);
});

test('it shows what is set, and who set it', async ({ page }) => {
  await admin(page, []);
  await expect(page.getByLabel(/Event subtitle/)).toHaveValue('Employee Ownership Month');
  await expect(page.getByText(/Set by Ray/)).toBeVisible();
});

// Every empty field means "nothing", and each is a different nothing. Saying
// which is the difference between a form you can reason about and one you have
// to test by emptying a box and reloading.
test('and says what an empty field will do', async ({ page }) => {
  await admin(page, []);
  await expect(page.getByText('No notice on the home page.')).toBeVisible();
  await expect(page.getByText('Falls back to what the site was built with.')).toBeVisible();
});

test('saving sends the value under its key', async ({ page }) => {
  const sent: Record<string, string>[] = [];
  await admin(page, sent);
  await page.getByLabel(/Notice on the home page/).fill('Round 3 opens Friday at noon');
  await page.getByLabel(/Notice on the home page/).press('Enter');
  await expect.poll(() => sent.length).toBe(1);
  expect(sent[0].p_key).toBe('announcement');
  expect(sent[0].p_value).toBe('Round 3 opens Friday at noon');
});

// The server knows things this form does not — which zone names the platform
// can resolve, for one — so its refusal is printed rather than pre-empted.
test('a refusal from the server is shown as the server worded it', async ({ page }) => {
  const sent: Record<string, string>[] = [];
  await admin(page, sent, {
    refuse: 'that is not a timezone name — try something like America/Chicago',
  });
  await page.getByLabel(/Company timezone/).fill('Central');
  await page.getByLabel(/Company timezone/).press('Enter');
  await expect(page.getByText(/not a timezone name/)).toBeVisible();
});

test('and somebody who may not is told so rather than shown an empty form', async ({
  page,
}) => {
  await page.route('**/rest/v1/rpc/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        route.request().url().includes('site_settings_sheet')
          ? { ok: false, reason: 'not allowed' }
          : []
      ),
    })
  );
  await page.goto('/admin');
  await expect(page.getByText('not allowed')).toBeVisible();
  await expect(page.getByLabel(/Event subtitle/)).toHaveCount(0);
});

// ---------------------------------------------------------------------------
// Who may do what
//
// The half that changes who can help during an event month. What is worth
// asserting from a browser is that the control says what somebody currently
// holds, that changing it sends the rung rather than an index, and that a
// refusal — including the one about the last administrator, which is about the
// whole database rather than the row being pressed — is shown against the
// person it concerns.
// ---------------------------------------------------------------------------

test('it lists who can do more than play', async ({ page }) => {
  await admin(page, []);
  await expect(page.getByRole('heading', { name: 'Who may do what' })).toBeVisible();
  await expect(page.getByRole('combobox', { name: /What Ray may do/ })).toHaveValue(
    'games.admin'
  );
  // No display name, so the address is what they are called.
  await expect(
    page.getByRole('combobox', { name: /What editor@amherstcomm.net may do/ })
  ).toHaveValue('games.edit');
});

test('and marks which one is you', async ({ page }) => {
  await admin(page, []);
  await expect(page.getByText('— you')).toBeVisible();
});

test('changing somebody sends the rung they were moved to', async ({ page }) => {
  const sent: Record<string, string>[] = [];
  await admin(page, sent);
  await page
    .getByRole('combobox', { name: /What editor@amherstcomm.net may do/ })
    .selectOption('games.admin');
  await expect.poll(() => sent.length).toBe(1);
  expect(sent[0].p_user).toBe('b1');
  expect(sent[0].p_role).toBe('games.admin');
});

test('somebody who holds nothing can be found and given something', async ({ page }) => {
  const sent: Record<string, string>[] = [];
  await admin(page, sent);
  await page.getByLabel('Search for somebody').fill('dave');
  // They hold nothing, so the control starts at the floor rather than empty.
  const control = page.getByRole('combobox', { name: /What Dave Jones may do/ });
  await expect(control).toHaveValue('games.view');
  await control.selectOption('games.edit');
  await expect.poll(() => sent.length).toBe(1);
  expect(sent[0].p_user).toBe('c1');
  expect(sent[0].p_role).toBe('games.edit');
});

test('and the last-administrator refusal is shown against the person it is about', async ({
  page,
}) => {
  await admin(page, [], {
    refuse: 'that is the last administrator — appoint another one first',
  });
  await page.getByRole('combobox', { name: /What Ray may do/ }).selectOption('games.edit');
  await expect(page.getByText(/last administrator/)).toBeVisible();
});
