// Reporting, from the two places a player can do it, on the thing that makes
// a report worth acting on: what leaves the browser.
//
// The unit test asserts the same rule against the transport. This one asserts
// it against the actual button, because between the two there is a dialog, a
// difficulty, and a date — and the date in particular is the puzzle's own
// rather than today's, which is a distinction no amount of typechecking makes.
import { expect, test } from './fixtures';

/** Open the footer's report menu. */
async function openReportMenu(page: import('@playwright/test').Page) {
  const button = page.getByRole('button', { name: 'Report a problem' });
  await button.scrollIntoViewIfNeeded();
  await button.click();
  return button;
}

test('reporting a player sends the name and the reason, and nothing else', async ({
  page,
  rpcCalls,
}) => {
  await page.goto('/stats/boards');

  // One flag per row, and the fixture's player is on four boards — so this
  // takes the first rather than the only. A bare locator here failed on strict
  // mode, which is the assertion doing its job: the button is per row, not per
  // player, and a player on four boards is reportable from any of them.
  const flag = page.getByRole('button', { name: /^Report Anagrimoire$/ }).first();
  await expect(flag).toBeVisible();
  await flag.click();

  const dialog = page.getByRole('dialog', { name: /Report this player/i });
  await expect(dialog).toBeVisible();
  // two textboxes now, the reason and the optional address — named rather
  // than positional, or this passes by typing into the wrong one
  await dialog.getByRole('textbox', { name: /What.s wrong with it/i }).fill('the name is a slur');
  await dialog.getByRole('button', { name: 'Send report' }).click();

  await expect(dialog.getByText(/Thank you/)).toBeVisible();
  // the reference, which is the difference between a report and a thank-you
  await expect(dialog.getByText('4f2ba9c17d')).toBeVisible();

  const sent = rpcCalls.filter((c) => c.fn === 'report_player');
  expect(sent).toHaveLength(1);
  // exactly two fields: who, and why. No rank, no score, no board.
  expect(Object.keys(sent[0].args).sort()).toEqual(['p_email', 'p_name', 'p_reason']);
  expect(sent[0].args.p_name).toBe('Anagrimoire');
});

test('reporting a puzzle sends where it was, never what it said', async ({ page, rpcCalls }) => {
  await page.goto('/daily/bridge');

  await openReportMenu(page);
  await page.getByRole('button', { name: /^A puzzle/ }).click();

  const dialog = page.getByRole('dialog', { name: /Report a puzzle/i });
  await expect(dialog).toBeVisible();
  // the reason is optional, and a report with none is still a signal
  await dialog.getByRole('button', { name: 'Send report' }).click();
  await expect(dialog.getByText(/Thank you/)).toBeVisible();

  const sent = rpcCalls.filter((c) => c.fn === 'report_puzzle');
  expect(sent).toHaveLength(1);
  expect(Object.keys(sent[0].args).sort()).toEqual([
    'p_date',
    'p_difficulty',
    'p_email',
    'p_env',
    'p_game',
    'p_reason',
  ]);
  expect(sent[0].args.p_game).toBe('bridge');
  // a date, and the board's own — not a board, not a prompt, not an answer
  expect(String(sent[0].args.p_date)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  const located = { ...sent[0].args } as Record<string, unknown>;
  delete located.p_reason;
  expect(JSON.stringify(located)).not.toMatch(/board|prompt|answer|cells|letters/i);
});

test('the dialog closes on Escape and hands focus back', async ({ page }) => {
  await page.goto('/daily/bridge');
  const flag = await openReportMenu(page);
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(flag).toBeFocused();
});

test('a ticket looks itself up, and a wrong one says so plainly', async ({ page }) => {
  await page.goto('/report/4f2ba9c17d');
  await expect(page.getByText('Still open')).toBeVisible();

  await page.goto('/report/notaticket');
  // A wrong code and a real one read alike on the server; this is as much as
  // the page can honestly say, and it must not imply the code was malformed.
  await expect(page.getByText(/Nothing found under that reference/)).toBeVisible();
});

test('the owner action page refuses without an owner signed in', async ({ page }) => {
  await page.goto('/report/act/00000000-0000-0000-0000-000000000001/deadbeef/dismiss');
  await expect(page.getByText('Not allowed')).toBeVisible();
  // and it must not have shown the report on the way to refusing
  await expect(page.getByText(/The evidence/)).toHaveCount(0);
});

// The failure this replaced: the report link hung off a date the game had to
// volunteer through the daily bus, and six of the ten games keep their date
// somewhere the gate never saw — so it was quietly absent on Guess, Scramble,
// Hive, Grid, Boxed and Ladder. Nothing failed, because a control that isn't
// rendered doesn't throw. This walks all ten.
const GAMES = [
  'guess', 'scramble', 'hive', 'grid', 'boxed',
  'squares', 'weave', 'cryptogram', 'ladder', 'bridge',
];

test('every game can be reported from, and so can the front page', async ({ page }) => {
  test.slow();
  const missing: string[] = [];
  for (const slug of [...GAMES.map((g) => `/daily/${g}`), '/', '/stats/boards']) {
    await page.goto(slug);
    if (!(await page.getByRole('button', { name: 'Report a problem' }).isVisible())) {
      missing.push(slug);
    }
  }
  expect(missing, `no way to report from: ${missing.join(', ')}`).toEqual([]);
});

test('a site problem insists on words, because there is nothing to look up', async ({
  page,
  rpcCalls,
}) => {
  await page.goto('/');
  await openReportMenu(page);
  await page.getByRole('button', { name: /^A problem with the site/ }).click();

  const dialog = page.getByRole('dialog', { name: /Report a problem with the site/i });
  const send = dialog.getByRole('button', { name: 'Send report' });
  // empty is not a report here: a puzzle report with no words still points at
  // a board, and this points at nothing
  await expect(send).toBeDisabled();

  await dialog.getByRole('textbox', { name: /What.s wrong with it/i }).fill('the board is upside down');
  await expect(send).toBeEnabled();
  await send.click();
  await expect(dialog.getByText(/Thank you/)).toBeVisible();

  const sent = rpcCalls.filter((c) => c.fn === 'report_general');
  expect(sent).toHaveLength(1);
  expect(sent[0].args.p_kind).toBe('site');
});
