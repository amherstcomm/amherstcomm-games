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
  // Which panel. The page is six jobs at one address now, one at a time, so a
  // test has to say which one it came for.
  { refuse = '', tab = 'site' } = {}
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
  await page.goto(`/admin/${tab}`);
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
  await admin(page, [], { tab: 'people' });
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
  await admin(page, [], { tab: 'people' });
  await expect(page.getByText('— you')).toBeVisible();
});

test('changing somebody sends the rung they were moved to', async ({ page }) => {
  const sent: Record<string, string>[] = [];
  await admin(page, sent, { tab: 'people' });
  await page
    .getByRole('combobox', { name: /What editor@amherstcomm.net may do/ })
    .selectOption('games.admin');
  await expect.poll(() => sent.length).toBe(1);
  expect(sent[0].p_user).toBe('b1');
  expect(sent[0].p_role).toBe('games.admin');
});

test('somebody who holds nothing can be found and given something', async ({ page }) => {
  const sent: Record<string, string>[] = [];
  await admin(page, sent, { tab: 'people' });
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
    tab: 'people',
    refuse: 'that is the last administrator — appoint another one first',
  });
  await page.getByRole('combobox', { name: /What Ray may do/ }).selectOption('games.edit');
  await expect(page.getByText(/last administrator/)).toBeVisible();
});

// ---------------------------------------------------------------------------
// Word lists
//
// A textarea, because that is what a list of words is. What is worth asserting
// is that whatever gets pasted goes to the server as typed — the splitting and
// dropping happen there, on purpose, so the page and the server cannot disagree
// about what counts as a word — and that the count that comes back is what gets
// shown, rather than the number of lines the person typed.
// ---------------------------------------------------------------------------

const LISTS = {
  ok: true,
  lists: [
    {
      id: 'l1',
      name: 'Employee ownership',
      words: 8,
      lengths: [4, 5, 6, 7, 8],
      created_at: '2026-09-01T00:00:00Z',
    },
  ],
};

test('a word list can be written by pasting whatever comes to hand', async ({ page }) => {
  const sent: Record<string, string>[] = [];
  await page.route('**/rest/v1/rpc/**', (route) => {
    const url = route.request().url();
    if (url.includes('save_word_list')) {
      sent.push(JSON.parse(route.request().postData() ?? '{}'));
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        // Six typed, five kept: "a" is too short to be a word.
        body: JSON.stringify({ ok: true, id: 'l2', words: 5 }),
      });
    }
    const body = url.includes('site_settings_sheet')
      ? SETTINGS
      : url.includes('word_lists_sheet')
        ? LISTS
        : url.includes('people_with_roles')
          ? PEOPLE
          : [];
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
  await page.goto('/admin/lists');

  await expect(page.getByText('Employee ownership')).toBeVisible();
  // The sizes it can fill a board with, because that is what picking one for a
  // round turns on.
  await expect(page.getByText(/8 words · 4, 5, 6, 7, 8 letters/)).toBeVisible();

  await page.getByRole('button', { name: 'New list' }).click();
  // Exact, because a settings field above has the word "name" in its own
  // description and so answers to the same label.
  await page.getByLabel('Name', { exact: true }).fill('Telecom');
  await page.getByLabel(/^Words/).fill('fibre, splice\nconduit\na\nrouter switch');

  await page.getByRole('button', { name: 'Save list' }).click();
  await expect.poll(() => sent.length).toBe(1);
  // Sent as typed. Splitting on anything that is not a letter is the server's
  // job, and doing it twice is how the two come to disagree.
  expect(sent[0].p_words).toBe('fibre, splice\nconduit\na\nrouter switch');
  expect(sent[0].p_name).toBe('Telecom');

  // What landed, not what was typed.
  await expect(page.getByText('Saved — 5 words.')).toBeVisible();
});

// ---------------------------------------------------------------------------
// Pasting a month at once
//
// The case: thirty-one themes written somewhere else. Typing them into a form
// one at a time is what stops it happening, so the page takes the blob — and
// what it must never do is report a count of the ones that worked without
// naming the ones that did not.
// ---------------------------------------------------------------------------

test('a month of Weave themes can be pasted in one go', async ({ page }) => {
  const saved: Record<string, unknown>[] = [];
  await page.route('**/rest/v1/rpc/**', (route) => {
    const url = route.request().url();
    if (url.includes('save_weave_theme')) {
      const body = JSON.parse(route.request().postData() ?? '{}');
      saved.push(body);
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, words: 6 }),
      });
    }
    const body = url.includes('weave_themes_sheet')
      ? { ok: true, themes: [] }
      : url.includes('site_settings_sheet')
        ? { ok: true, settings: [] }
        : url.includes('word_lists_sheet')
          ? { ok: true, lists: [] }
          : url.includes('feature_windows_sheet')
            ? { ok: true, features: [] }
            : url.includes('people_with_roles')
              ? { ok: true, people: [] }
              : [];
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
  await page.goto('/admin/weave');

  // Ray's own shape, three of them, one dated — plus one that cannot be used.
  const blob = JSON.stringify([
    {
      theme: 'Profit sharing',
      spangram: 'PROFITSHARING',
      spangram_length: 13,
      words: ['METRICS', 'PAYOUT', 'REWARD', 'TARGET', 'BONUS', 'SPLIT'],
      word_count: 6,
      total_letters: 48,
      starts_on: '2026-10-01',
      ends_on: '2026-10-01',
    },
    { theme: 'On the board', spangram: 'stakeholders', words: ['voting', 'shares', 'trustee'] },
    { theme: 'Broken', spangram: 'no', words: ['voting'] },
  ]);

  await page.getByRole('button', { name: 'Paste themes' }).click();
  // Exact: the file input beside it answers to 'Paste themes from a file',
  // which a substring match now finds as well.
  await page.getByLabel('Paste themes', { exact: true }).fill(blob);

  // Shown before it happens, with the fit — a theme that fills no board imports
  // perfectly and then never appears.
  await expect(page.getByText(/Profit sharing \(profitsharing, 6 words\).*fills easy/)).toBeVisible();
  // And the one that cannot be used is named, rather than silently dropped from
  // a count.
  await expect(page.getByText(/Entry 3 \(Broken\).*cannot be a spangram/)).toBeVisible();

  await page.getByRole('button', { name: /^Import 2$/ }).click();
  await expect(page.getByText('Imported 2 of 2.')).toBeVisible();

  expect(saved.map((s) => s.p_clue)).toEqual(['Profit sharing', 'On the board']);
  // The derived numbers are ignored and the words recomputed.
  expect(saved[0].p_words).toBe('metrics payout reward target bonus split');
  expect(saved[0].p_from).toBe('2026-10-01');
});

test('and several word lists at once, with a template to start from', async ({ page }) => {
  const saved: Record<string, unknown>[] = [];
  await page.route('**/rest/v1/rpc/**', (route) => {
    const url = route.request().url();
    if (url.includes('save_word_list')) {
      saved.push(JSON.parse(route.request().postData() ?? '{}'));
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, words: 5 }),
      });
    }
    const body = url.includes('word_lists_sheet')
      ? { ok: true, lists: [] }
      : url.includes('site_settings_sheet')
        ? { ok: true, settings: [] }
        : url.includes('weave_themes_sheet')
          ? { ok: true, themes: [] }
          : url.includes('feature_windows_sheet')
            ? { ok: true, features: [] }
            : url.includes('people_with_roles')
              ? { ok: true, people: [] }
              : [];
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
  await page.goto('/admin/lists');

  await page.getByRole('button', { name: 'Paste lists' }).click();

  // The blank, first: it is handed to whoever fills a month in elsewhere, so it
  // has to actually arrive.
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download template' }).first().click(),
  ]);
  expect(download.suggestedFilename()).toBe('word-lists-template.json');

  // Three lists in one paste, each with several words — which is the shape a
  // month arrives in.
  await page.getByLabel('Paste lists', { exact: true }).fill(
    JSON.stringify([
      { name: 'Employee ownership', words: ['shares', 'dividend', 'esop'] },
      { name: 'Around the office', words: ['fibre', 'splice', 'conduit', 'router'] },
      { name: 'The building', words: ['lobby', 'atrium'] },
    ])
  );

  await expect(page.getByText('Employee ownership (3 words)')).toBeVisible();
  await expect(page.getByText('Around the office (4 words)')).toBeVisible();

  await page.getByRole('button', { name: /^Import 3$/ }).click();
  await expect(page.getByText('Imported 3 of 3.')).toBeVisible();

  expect(saved.map((s) => s.p_name)).toEqual([
    'Employee ownership',
    'Around the office',
    'The building',
  ]);
  expect(saved[1].p_words).toBe('fibre splice conduit router');
});

// A file, not just a paste. The file fills the same box, so everything after
// that point is the path the other tests already cover — what this checks is
// that opening one actually gets there.
test('a month can be opened from a file rather than pasted', async ({ page }) => {
  const saved: Record<string, unknown>[] = [];
  await page.route('**/rest/v1/rpc/**', (route) => {
    const url = route.request().url();
    if (url.includes('save_weave_theme')) {
      saved.push(JSON.parse(route.request().postData() ?? '{}'));
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, words: 6 }),
      });
    }
    const body = url.includes('weave_themes_sheet')
      ? { ok: true, themes: [] }
      : url.includes('site_settings_sheet')
        ? { ok: true, settings: [] }
        : url.includes('word_lists_sheet')
          ? { ok: true, lists: [] }
          : url.includes('feature_windows_sheet')
            ? { ok: true, features: [] }
            : url.includes('people_with_roles')
              ? { ok: true, people: [] }
              : [];
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
  await page.goto('/admin/weave');
  await page.getByRole('button', { name: 'Paste themes' }).click();

  await page.getByLabel('Paste themes from a file').setInputFiles({
    name: 'october.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        _readme: 'ignored, because it is a sentence rather than an entry',
        themes: [
          {
            theme: 'Profit sharing',
            spangram: 'profitsharing',
            words: ['metrics', 'payout', 'reward', 'target', 'bonus', 'split'],
          },
          {
            theme: 'On the board',
            spangram: 'stakeholders',
            words: ['voting', 'shares', 'trustee'],
          },
        ],
      })
    ),
  });

  // It landed in the box, so the preview and the refusals work as they do for a
  // paste — including the `_readme` being a sentence rather than a broken entry.
  await expect(page.getByText(/Profit sharing \(profitsharing, 6 words\)/)).toBeVisible();
  await expect(page.getByText(/Entry \d/)).toHaveCount(0);

  await page.getByRole('button', { name: /^Import 2$/ }).click();
  await expect(page.getByText('Imported 2 of 2.')).toBeVisible();
  expect(saved.map((s) => s.p_clue)).toEqual(['Profit sharing', 'On the board']);
});

// The calculator, on the list while it is being written — which is the only
// time the answer is any use.
test('a word list says what it can make while you write it', async ({ page }) => {
  await page.route('**/rest/v1/rpc/**', (route) => {
    const url = route.request().url();
    const body = url.includes('word_lists_sheet')
      ? { ok: true, lists: [] }
      : url.includes('site_settings_sheet')
        ? { ok: true, settings: [] }
        : url.includes('weave_themes_sheet')
          ? { ok: true, themes: [] }
          : url.includes('feature_windows_sheet')
            ? { ok: true, features: [] }
            : url.includes('people_with_roles')
              ? { ok: true, people: [] }
              : [];
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
  await page.goto('/admin/lists');
  await page.getByRole('button', { name: 'New list' }).click();

  // payouts → sharing chains — payouts ends in s, sharing begins with one — and
  // covers exactly twelve distinct letters, which is what a box is. The words
  // it is built from are the words that solve it.
  await page
    .getByLabel(/^Words/)
    .fill('payouts\nsharing\nshared\nworker\nvoting\nvote\ngain\nearn\ndividend');
  // The search runs in a worker: milliseconds for a themed list, most of a
  // minute for a pasted document, and the page cannot tell which it has until
  // it looks — so it looks somewhere that cannot freeze the box being typed
  // into. Which is why this line arrives rather than being there.
  await expect(
    page.getByText(/Boxed — \d+ boards? whose letters these words chain through/)
  ).toBeVisible();
  // The board and the chain that solves it — there is nothing else on the line,
  // because the seed *is* the answer.
  await expect(page.getByText(/best:/).first()).toContainText('payouts → sharing');

  // The ladder search waits for a pause in typing rather than running per
  // keystroke — a walk per word over forty thousand rungs is a tenth of a
  // second — so this is the one line that is not there immediately.
  // Both of the expensive calculators run in the worker and say so while they
  // work, so the panel is honest about being behind rather than showing the
  // last answer as though it were current.
  await expect(page.getByText(/Ladder — \d+ pairs/)).toBeVisible();
  await expect(page.getByText('working…')).toHaveCount(0);

  // A list of plain nouns makes no bridge, which is the answer rather than a
  // fault in the list — so it says what one would need.
  await expect(page.getByText(/Bridge — 0 prompts/)).toBeVisible();
  await expect(page.getByText(/compounds sharing a stem/)).toBeVisible();

  // And two compounds that do share one.
  await page.getByLabel(/^Words/).fill('nonprofit\nprofitable');
  await expect(page.getByText('non · profit · able')).toBeVisible();
});

// The same question asked of a month rather than a list: lists overlap, so
// whether October is covered is a thing no single list knows.
test('coverage says which days of a month are themed, and with how much', async ({ page }) => {
  const days = Array.from({ length: 31 }, (_, i) => {
    const date = `2026-10-${String(i + 1).padStart(2, '0')}`;
    // Two days nothing covers, and Weave running out after the tenth: both are
    // ordinary states rather than failures, and both are the thing to know
    // about in the month an event is in.
    const gap = i === 4 || i === 5;
    return {
      date,
      theme: gap
        ? null
        : {
            name: 'October',
            // `trustee` is seven letters, so it can be shuffled into a rack;
            // `employer` is seven distinct letters with no s, so it can seed a
            // hive. Both are in here because a count of nought agrees with a
            // panel that is wired to nothing.
            words: [
              'esop',
              'shares',
              'equity',
              'voting',
              'shared',
              'dividend',
              'trustee',
              'employer',
              // payouts → sharing chains into twelve distinct letters, which is
              // what makes a box: the words it is built from are the words that
              // solve it.
              'payouts',
              'sharing',
            ],
          },
      // A passage of the deployment's own on the first five days, and one no
      // board can take on the sixth — the failure that reads as a covered day.
      passages:
        i < 5
          ? [
              {
                text: 'We own this place together, and every share of it was earned here.',
                author: 'The charter',
                letters: 52,
              },
            ]
          : i === 5
            ? [{ text: 'Far too short.', author: null, letters: 12 }]
            : [],
      weave:
        i < 10
          ? [
              {
                clue: 'Profit sharing',
                spangram: 'profitsharing',
                words: ['metrics', 'payout', 'reward', 'target', 'bonus', 'split'],
              },
            ]
          : [],
    };
  });

  await page.route('**/rest/v1/rpc/**', (route) => {
    const url = route.request().url();
    const body = url.includes('theme_coverage')
      ? { ok: true, days }
      : url.includes('word_lists_sheet')
        ? {
            ok: true,
            lists: [
              {
                id: 'l1',
                name: 'October',
                words: 6,
                clue: null,
                spangrams: [],
                daily_from: '2026-10-01',
                daily_until: '2026-10-31',
                lengths: [4, 6, 8],
                created_at: '2026-09-01',
              },
            ],
          }
        : url.includes('site_settings_sheet')
          ? { ok: true, settings: [] }
          : url.includes('weave_themes_sheet')
            ? { ok: true, themes: [] }
            : url.includes('feature_windows_sheet')
              ? { ok: true, features: [] }
              : url.includes('people_with_roles')
                ? { ok: true, people: [] }
                : [];
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });

  await page.goto('/admin/coverage');
  // The dates the lists already carry: checking October is one click, not two
  // date fields and a guess at which month somebody meant.
  await expect(page.getByLabel('Coverage from')).toHaveValue('2026-10-01');
  await expect(page.getByLabel('Coverage until')).toHaveValue('2026-10-31');
  await page.getByRole('button', { name: 'Check' }).click();

  await expect(page.getByText('The daily word — 29 of 31 days have a list')).toBeVisible();
  await expect(page.getByText(/unthemed, so an ordinary word: Oct 5.Oct 6/)).toBeVisible();

  // Per length, which is how the generator themes and the finding the panel
  // exists for: this list themes three boards in ten and leaves seven ordinary.
  await expect(page.getByText('6 letters — 29 of 31 days, drawing from 4')).toBeVisible();
  await expect(page.getByText('5 letters — no themed words, ordinary every day')).toBeVisible();
  // Fewer words than days, so the same answer comes round again.
  await expect(page.getByText(/4 letters — 29 of 31 days, drawing from 1/)).toBeVisible();
  await expect(page.getByText('will repeat').first()).toBeVisible();

  await expect(
    page.getByText('Weave — 10 of 31 days have a theme that tiles a board')
  ).toBeVisible();
  await expect(page.getByText(/curated: Oct 11.Oct 31/)).toBeVisible();

  // A chain of the day's own words covering twelve distinct letters, so every
  // themed day can build a box out of the theme.
  await expect(page.getByText(/Boxed — 29 days/)).toBeVisible();

  await expect(
    page.getByText('Cryptogram — 5 of 31 days play a passage of your own')
  ).toBeVisible();
  // Written for the day and unusable is its own line, because the day reads as
  // covered and is not.
  await expect(page.getByText(/1 days have a passage no board can take/)).toBeVisible();

  // The two boards the theme can be built *from* rather than merely scored in.
  await expect(page.getByText(/Scramble — 29 days can build the rack/)).toBeVisible();
  await expect(page.getByText(/Hive — 29 days have a theme word/)).toBeVisible();

  await page.getByRole('button', { name: 'Show every day' }).click();
  await expect(page.getByText('no list')).toHaveCount(2);
  await expect(page.getByText('no weave theme')).toHaveCount(21);
});

// ---------------------------------------------------------------------------
// Six jobs, one at a time
//
// It was one scroll, and the last panel on it was two thousand pixels down.
// What matters about the split is not that it looks tidier: the tab is in the
// address, so a month written over several sittings can be bookmarked and sent
// to the other administrator, and each panel fetches only when it is the one
// being looked at.
// ---------------------------------------------------------------------------

test('the admin page shows one panel at a time, and says which in the address', async ({
  page,
}) => {
  const asked: string[] = [];
  await page.route('**/rest/v1/rpc/**', (route) => {
    const url = route.request().url();
    asked.push(url.split('/rpc/')[1].split('?')[0]);
    const body = url.includes('site_settings_sheet')
      ? { ok: true, settings: [] }
      : url.includes('word_lists_sheet')
        ? { ok: true, lists: [] }
        : url.includes('weave_themes_sheet')
          ? { ok: true, themes: [] }
          : url.includes('feature_windows_sheet')
            ? { ok: true, features: [] }
            : url.includes('people_with_roles')
              ? { ok: true, people: [] }
              : [];
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });

  // The bare address settles on the first tab rather than meaning a second
  // thing, which is the rule the rest of the site's panels already follow.
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Site settings' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Word lists' })).toHaveCount(0);
  // And it asked for nothing else: opening this page to change the subtitle
  // used to read every word list, every theme and everybody's roles.
  expect(asked.some((rpc) => rpc.includes('word_lists_sheet'))).toBe(false);

  await page.getByRole('link', { name: 'Word lists' }).click();
  await expect(page).toHaveURL(/\/admin\/lists$/);
  await expect(page.getByRole('heading', { name: 'Word lists' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Site settings' })).toHaveCount(0);

  // Back walks the tabs, because they are addresses rather than state. It
  // lands on /admin/site rather than /admin: the address bar follows the state,
  // and the state is a named tab — the bare form is an accepted address, not a
  // second name the site keeps using.
  await page.goBack();
  await expect(page).toHaveURL(/\/admin\/site$/);
  await expect(page.getByRole('heading', { name: 'Site settings' })).toBeVisible();

  // And one typed straight in works, which is the half a bookmark needs.
  await page.goto('/admin/people');
  await expect(page.getByRole('heading', { name: 'Who may do what' })).toBeVisible();
});

// ---------------------------------------------------------------------------
// Cryptogram passages
//
// The length is the whole difficulty of writing one, and it is counted in
// letters rather than characters — so it is said while somebody types rather
// than after they press Save, and long before a nightly run quietly reaches for
// a curated quotation instead.
// ---------------------------------------------------------------------------

async function passagesPage(page: import('@playwright/test').Page, saved: Record<string, unknown>[]) {
  await page.route('**/rest/v1/rpc/**', (route) => {
    const url = route.request().url();
    if (url.includes('save_cryptogram_passage')) {
      saved.push(JSON.parse(route.request().postData() ?? '{}'));
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, letters: 52 }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        url.includes('cryptogram_passages_sheet') ? { ok: true, passages: [] } : []
      ),
    });
  });
  await page.goto('/admin/passages');
}

test('a passage says which boards it can go on while you write it', async ({ page }) => {
  await passagesPage(page, []);
  await page.getByRole('button', { name: 'New passage' }).click();

  // 52 letters: the standard band, which easy and hard play.
  await page
    .getByLabel(/^Passage/)
    .fill('We own this place together, and every share of it was earned here.');
  await expect(page.getByText('52 letters — plays at easy, hard')).toBeVisible();

  // 39: the short band, which only extreme plays — and which nothing checks
  // for a second reading, so it is said.
  await page.getByLabel(/^Passage/).fill('One share each, and the year we all earned it here.');
  await expect(page.getByText('39 letters — plays at extreme')).toBeVisible();
  await expect(page.getByText(/checked for that; this one is not/)).toBeVisible();

  // And one no board takes, said in the direction that fixes it.
  await page.getByLabel(/^Passage/).fill('Far too short for this.');
  await expect(page.getByText(/short of the smallest board/)).toBeVisible();
});

test('and a month of them can be pasted at once', async ({ page }) => {
  const saved: Record<string, unknown>[] = [];
  await passagesPage(page, saved);
  await page.getByRole('button', { name: 'Paste passages' }).click();

  await page.getByLabel('Paste passages from a file').setInputFiles({
    name: 'october.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        _readme: 'ignored, because it is a sentence rather than an entry',
        passages: [
          {
            text: 'We own this place together, and every share of it was earned here.',
            author: 'The charter',
            starts_on: '2026-10-01',
            ends_on: '2026-10-31',
          },
          // A bare string, which is the loosest shape the parser takes.
          'One share each, and the year we all earned it here.',
        ],
      })
    ),
  });

  // The preview says what each one can play, because a passage no board takes
  // imports and is then refused one at a time.
  await expect(page.getByText(/52 letters.*easy, hard/)).toBeVisible();
  await expect(page.getByText(/39 letters.*extreme/)).toBeVisible();

  await page.getByRole('button', { name: /^Import 2$/ }).click();
  await expect(page.getByText('Imported 2 of 2.')).toBeVisible();
  expect(saved.map((s) => s.p_author)).toEqual(['The charter', null]);
});

// What a themed day accepts as a word: per day and per game, because several
// lists can cover one day and "only our words" is a fine letter box and an
// unplayable hive.
test('a day can be told which words its games accept', async ({ page }) => {
  const saved: Record<string, unknown>[] = [];
  await page.route('**/rest/v1/rpc/**', (route) => {
    const url = route.request().url();
    if (url.includes('save_word_policy')) {
      saved.push(JSON.parse(route.request().postData() ?? '{}'));
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, id: 'p1' }),
      });
    }
    const body = url.includes('word_policies_sheet')
      ? { ok: true, policies: [] }
      : url.includes('word_lists_sheet')
        ? { ok: true, lists: [] }
        : [];
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });

  await page.goto('/admin/lists');
  await page.getByRole('button', { name: 'New rule' }).click();

  // The ladder is not on offer at all, rather than offered and refused: its par
  // is the shortest route through the words a player may use.
  const games = await page.getByLabel('Which game').locator('option').allTextContents();
  expect(games.some((name) => /ladder/i.test(name))).toBe(false);
  expect(games.some((name) => /^Boxed$/.test(name))).toBe(true);

  await page.getByLabel('Which game').selectOption('boxed');
  await page.getByRole('radio', { name: 'themed', exact: true }).check();
  await page.getByLabel('Rule from').fill('2026-10-05');
  await page.getByLabel('Rule until').fill('2026-10-09');
  await page.getByRole('button', { name: 'Save rule' }).click();

  await expect(page.getByText('Saved.')).toBeVisible();
  expect(saved).toHaveLength(1);
  expect(saved[0]).toMatchObject({
    p_game: 'boxed',
    p_policy: 'themed',
    p_from: '2026-10-05',
    p_until: '2026-10-09',
  });
});

// Choosing a day's puzzles rather than letting the day choose them. What is
// pinned is the seed, not the board — so what this asserts is the shortlist
// being real and the seed reaching the server in the shape the generator reads.
test('a day s puzzles can be picked from what its words can make', async ({ page }) => {
  const pinned: Record<string, unknown>[] = [];
  const day = {
    date: '2026-10-08',
    theme: {
      name: 'October',
      words: ['voting', 'shared', 'capital', 'employer', 'esop', 'meeting', 'vesting'],
    },
    weave: [
      {
        clue: 'Profit sharing',
        spangram: 'profitsharing',
        words: ['metrics', 'payout', 'reward', 'target', 'bonus', 'split'],
      },
    ],
    passages: [
      {
        text: 'We own this place together, and every share of it was earned here.',
        author: 'The charter',
        letters: 52,
      },
    ],
  };

  await page.route('**/rest/v1/rpc/**', (route) => {
    const url = route.request().url();
    if (url.includes('pin_puzzle')) {
      pinned.push(JSON.parse(route.request().postData() ?? '{}'));
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, id: 'pin1' }),
      });
    }
    const body = url.includes('theme_coverage')
      ? { ok: true, days: [day] }
      : url.includes('pins_sheet')
        ? { ok: true, pins: [] }
        : [];
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });

  await page.goto('/admin/pins');
  await page.getByLabel('Pin date').fill('2026-10-08');
  await page.getByRole('button', { name: 'Look' }).click();

  // Each game offers what that day's own words can make, worked out in the
  // browser with the same searches the generator runs.
  await expect(page.getByRole('button', { name: 'capital', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'employer', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /meeting → vesting in 4/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Profit sharing/ })).toBeVisible();

  // And the seed reaches the server in the shape the generator reads.
  await page.getByRole('button', { name: 'capital', exact: true }).click();
  await expect(page.getByText('Pinned.')).toBeVisible();
  expect(pinned).toHaveLength(1);
  expect(pinned[0]).toMatchObject({
    p_date: '2026-10-08',
    p_game: 'scramble',
    p_difficulty: null,
    p_choice: { word: 'capital' },
  });
});

// A day's boxes run to thousands and its pangrams to three, so each list gets
// its own filter and its own way to see the rest of itself. One filter for the
// page would mean typing to find a rack also hid every box.
test('and a long shortlist can be filtered and paged through', async ({ page }) => {
  const day = {
    date: '2026-10-08',
    theme: {
      name: 'October',
      // Chain-friendly on purpose: a box is two to four of these words chaining
      // into twelve distinct letters, and this list makes dozens — which is
      // what the `more` button is for.
      words: [
        'payouts', 'sharing', 'shares', 'shared', 'stock', 'stocks', 'service', 'esop',
        'dividends', 'dividend', 'owned', 'owner', 'ownership', 'policy', 'earned',
        'charter', 'reward', 'rewards', 'growth', 'trustee', 'equity', 'voting',
      ],
    },
    weave: [],
    passages: [],
  };
  await page.route('**/rest/v1/rpc/**', (route) => {
    const url = route.request().url();
    const body = url.includes('theme_coverage')
      ? { ok: true, days: [day] }
      : url.includes('pins_sheet')
        ? { ok: true, pins: [] }
        : [];
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });

  await page.goto('/admin/pins');
  await page.getByLabel('Pin date').fill('2026-10-08');
  await page.getByRole('button', { name: 'Look' }).click();

  // Scoped to the box list: three lists can show a `more` button at once, and
  // "the first one" is the daily word's.
  const boxList = page.locator('[data-shortlist="boxed"]');
  const boxes = boxList.getByRole('button', { name: /→/ });
  await expect(boxes.first()).toBeVisible();
  // A page of them, and the rest behind the button — not a capped search: the
  // filter has to be able to find a board that exists, which the cap made
  // impossible.
  const firstPage = await boxes.count();
  expect(firstPage).toBe(12);
  await boxList.getByRole('button', { name: /\d+ more/ }).click();
  expect(await boxes.count()).toBeGreaterThan(firstPage);

  // Every word of the filter has to appear somewhere in the label, in any
  // order, so nobody has to remember which way round the page prints a pair.
  // Taken out of a board that is actually on the page rather than written down
  // here: which pairs a list makes is a fact about the list, and the mechanism
  // is what is being tested.
  // The label names what the board is made of, the letters, and the chain that
  // solves it — the seed words never chain with each other, so a board saying
  // only "solvable in 2" beside them reads as broken.
  // The board and the chain that solves it. Nothing on the label reads as a
  // chain except the chain, because there is nothing else on it: the words the
  // board was built from *are* the answer.
  const label = (await boxes.first().textContent()) ?? '';
  // The board, the chain of the day's own words that solves it, and — where an
  // ordinary pair beats it — what the board will actually promise.
  expect(label).toMatch(/^\w+\/\w+\/\w+\/\w+ — \w+( → \w+)+$/);
  const [left, right] = label.split(' — ')[1].split(' → ');
  const before = await boxes.count();
  // Typing at the box list re-runs the search for those words rather than
  // trimming what is on screen: a long list makes more boards than any search
  // enumerates, so filtering the page can hide a board that exists — which is
  // what "charter isn't in the list" was.
  await page.getByLabel('Filter Letter box').fill(`${right} ${left}`);
  await expect.poll(async () => (await boxes.count()) < before).toBe(true);
  // Every one that survived carries both, which is the rule — not one, because
  // a seed of three or four words can carry the same two.
  for (const text of await boxes.allTextContents()) {
    expect(text).toContain(left);
    expect(text).toContain(right);
  }

  // And the filter belongs to its own list: the daily word's is untouched by
  // what was typed at the boxes, still showing its own first page.
  const wordList = page.locator('[data-shortlist="guess"]');
  await expect(wordList.getByRole('button', { name: /\(\d+\)$/ })).toHaveCount(12);
  await expect(wordList.getByLabel('Filter The daily word')).toHaveValue('');
});
