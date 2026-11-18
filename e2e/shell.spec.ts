// The shell from the layout spec: the bar on a desktop, the bar and tabs on a
// phone, and the big name on Home alone.
//
// What has to hold: every game is one menu away with today's state beside it,
// and opens on its daily; a section with nothing in it is not drawn; a phone
// reaches the same lists through its tabs, and its title switches game; and
// the page starts at its own content everywhere but Home.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './fixtures';

test('the Games menu lists every game and opens one on its daily', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await page.getByRole('navigation', { name: 'Site' }).getByRole('button', { name: /^Games/ }).click();
  const list = page.getByRole('list', { name: 'Games' });
  expect(await list.getByRole('link').count()).toBeGreaterThanOrEqual(4);
  await expect(page.getByRole('link', { name: 'All the boards' })).toBeVisible();
  await list.getByRole('link', { name: /Word Ladder/ }).click();
  await expect(page).toHaveURL(/\/daily\/ladder$/);
  await expect(list).toHaveCount(0);
});

test('a section with nothing in it is not drawn', async ({ page }) => {
  // the stub has nothing running: no contest, giveaway, auction or session
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await expect(page.getByRole('button', { name: /^Events/ })).toHaveCount(0);
});

test('each page is headed by what it is: Home by today, a game by its name', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/^Good (morning|afternoon|evening)/);
  await page.goto('/daily/ladder');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Word Ladder');
  // the bar's logo is still the way home
  await page.getByRole('link', { name: /, home$/ }).first().click();
  await expect(page).toHaveURL(/\/$/);
});

test('on a phone, the tabs open the same lists, and the title switches game', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/daily/ladder');
  await page.getByRole('button', { name: /: switch game$/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Games' });
  await expect(sheet).toBeVisible();
  await sheet.getByRole('link', { name: /Guess the Word/ }).click();
  await expect(page).toHaveURL(/\/daily\/guess$/);
  await expect(sheet).toHaveCount(0);

  const tabs = page.getByRole('navigation', { name: 'Site' });
  await tabs.getByRole('button', { name: 'Me', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('link', { name: 'Settings' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('the bar with a menu open has no WCAG A/AA violations axe can see', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await page.getByRole('navigation', { name: 'Site' }).getByRole('button', { name: /^Games/ }).click();
  const results = await new AxeBuilder({ page }).include('header').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const summary = results.violations.map((v) => ({ id: v.id, sample: v.nodes[0]?.html.slice(0, 200), why: v.nodes[0]?.failureSummary }));
  expect(summary, JSON.stringify(summary, null, 2)).toEqual([]);
});

test('a game sits between its rails: the day’s games, and its own board', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/daily/hive');
  const rail = page.getByRole('navigation', { name: 'Today' });
  await expect(rail.getByRole('link', { name: /Hive/ })).toHaveAttribute('class', /text-accent/);
  await rail.getByRole('link', { name: /Word Ladder/ }).click();
  await expect(page).toHaveURL(/\/daily\/ladder$/);
  await expect(page.getByRole('heading', { name: /Word Ladder board/ })).toBeVisible();
  // narrower, the rail gives way and the board drops below the game
  await page.setViewportSize({ width: 1100, height: 900 });
  await expect(rail).toBeHidden();
  const w = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  expect(w[0]).toBeLessThanOrEqual(w[1]);
});
