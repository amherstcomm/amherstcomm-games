// "Republish this day", on Choosing a Day.
//
// The page can only ask -- the generator runs on the VM -- so what the page
// owes is: the request it sends, a confirmation before it touches a day people
// have already played, and an honest account of what became of it.
import { expect, test } from './fixtures';

const easternToday = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
const plus = (date: string, n: number) =>
  new Date(new Date(`${date}T12:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);

/** Stand up the page with a request queue the test controls. */
async function portal(page: import('@playwright/test').Page) {
  const asked: Record<string, unknown>[] = [];
  const requests: Record<string, unknown>[] = [];
  await page.route('**/rest/v1/rpc/**', (route) => {
    const url = route.request().url();
    if (url.includes('request_publish')) {
      const args = JSON.parse(route.request().postData() ?? '{}');
      asked.push(args);
      requests.unshift({
        id: `r${asked.length}`,
        on_date: args.p_date,
        force: args.p_force,
        state: 'waiting',
        note: null,
        requested_at: new Date().toISOString(),
        finished_at: null,
      });
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, id: `r${asked.length}`, again: false }),
      });
    }
    const body = url.includes('publish_requests_sheet')
      ? { ok: true, requests }
      : url.includes('theme_coverage')
        ? { ok: true, days: [] }
        : url.includes('pins_sheet')
          ? { ok: true, pins: [] }
          : [];
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  return { asked, requests };
}

test('a future day is asked for, and the page says it is waiting', async ({ page }) => {
  const { asked } = await portal(page);
  const day = plus(easternToday(), 12);
  await page.goto('/admin/pins');
  await page.getByLabel('Pin date').fill(day);
  await page.getByRole('button', { name: 'Republish this day' }).click();

  await expect.poll(() => asked.length).toBe(1);
  expect(asked[0]).toEqual({ p_date: day, p_force: false });
  // And what became of it, in words: the host looks once a minute, which is
  // how somebody watching knows "waiting" is not "stuck".
  await expect(
    page.getByRole('list', { name: 'Republish requests' }).getByText(`${day} — waiting`)
  ).toBeVisible();
});

// The case this has to get right. A day that has started is a day people have
// played; the button does not refuse it, but it does not do it by accident.
test('today asks first, and only goes with force once confirmed', async ({ page }) => {
  const { asked } = await portal(page);
  const today = easternToday();
  await page.goto('/admin/pins');
  await page.getByLabel('Pin date').fill(today);
  await page.getByRole('button', { name: 'Republish this day' }).click();

  const warning = page.getByRole('alert').filter({ hasText: 'has already started' });
  await expect(warning).toBeVisible();
  // Nothing has been sent yet: the first press only asked.
  expect(asked).toEqual([]);

  await warning.getByRole('button', { name: 'Republish anyway' }).click();
  await expect.poll(() => asked.length).toBe(1);
  expect(asked[0]).toEqual({ p_date: today, p_force: true });
});

test('and a confirmation does not carry over to a different day', async ({ page }) => {
  await portal(page);
  await page.goto('/admin/pins');
  await page.getByLabel('Pin date').fill(easternToday());
  await page.getByRole('button', { name: 'Republish this day' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'has already started' })).toBeVisible();

  await page.getByLabel('Pin date').fill(plus(easternToday(), 3));
  await expect(page.getByRole('alert').filter({ hasText: 'has already started' })).toHaveCount(0);
});
