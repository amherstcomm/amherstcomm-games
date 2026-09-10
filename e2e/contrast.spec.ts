// Contrast across every theme × palette, which is the half of accessibility a
// machine checks best and a person checks worst.
//
// The other axe sweep walks its routes on whatever palette happens to be
// default, so every palette but that one would go unchecked by anything but a
// hand audit. That is the real cost of a palette — not the CSS, which is
// one block, but the promise that every combination still clears AA. A palette
// shipped unaudited is worse than no palette, because the audited ones imply
// the rest were checked too.
//
// So: fewer routes, every combination. The routes are the ones carrying the
// most colour — a leaderboard, a board with SVG overlays, a board of marks
// with given letters, and a page that is mostly form controls.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './fixtures';
import { PALETTES } from '../src/theme';

const THEMES = ['light', 'dark'] as const;

const ROUTES = [
  ['home', '/'],
  ['hive', '/daily/hive'],
  ['cryptogram', '/daily/cryptogram'],
  ['settings', '/settings/site'],
  // The admin form, added after a text class fell through to Tailwind's own
  // palette and rendered an input at 1.05:1 in this very combination. It is
  // behind a capability, so the sweep would have skipped it and did.
  ['admin', '/admin/lists'],
  // Tournaments bring their own states -- a chosen game chip on the accent, a
  // round's "under way" in the accent on a tinted row -- that no other page
  // draws, so they are swept here rather than assumed from their neighbours.
  ['tournaments', '/admin/tournaments'],
] as const;

for (const palette of PALETTES) {
  for (const theme of THEMES) {
    test(`${palette} on ${theme} clears AA contrast everywhere it is used`, async ({ page }) => {
      // seed the stored settings before the app boots, so it renders in this
      // combination rather than rendering twice
      await page.addInitScript(
        ([t, p]) => {
          localStorage.setItem('anagrimoire:v1', JSON.stringify({ theme: t, palette: p }));
        },
        [theme, palette] as const
      );

      // The admin route draws nothing without these, and a page that renders
      // its refusal is a page with no colours to check.
      await page.route('**/rest/v1/rpc/**', (route) => {
        const url = route.request().url();
        const body = url.includes('my_capabilities')
          ? ['site.settings', 'users.manage', 'games.setup']
          : url.includes('word_lists_sheet')
            ? { ok: true, lists: [] }
            : url.includes('word_policies_sheet')
              ? { ok: true, policies: [] }
              : url.includes('tournaments_sheet')
                ? {
                    ok: true,
                    tournaments: [
                      {
                        id: 't1',
                        name: 'Ownership Cup',
                        difficulty: 'hard',
                        starts_on: '2026-01-01',
                        ends_on: '2027-12-31',
                        rounds: [
                          {
                            id: 'r1',
                            starts_on: '2026-01-01',
                            ends_on: '2027-12-30',
                            games: ['hive', 'box'],
                            started: true,
                          },
                        ],
                      },
                    ],
                  }
                : { ok: true };
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(body),
        });
      });

      const failures: unknown[] = [];
      for (const [name, path] of ROUTES) {
        await page.goto(path);
        await page.waitForLoadState('networkidle');

        // the attributes really landed — a silent fallback to default would
        // make this whole sweep a very slow way of testing one palette
        await expect(page.locator('html')).toHaveAttribute('data-palette', palette);
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);

        // The form is only on screen once somebody is writing a list, and the
        // field that was invisible is in it.
        if (name === 'admin') {
          await page.getByRole('button', { name: 'New list' }).click();
        }
        // A round form open with one game chosen, so the chip's selected state
        // is on screen beside the "under way" label on the round above it.
        if (name === 'tournaments') {
          await page.getByRole('button', { name: 'Add a round' }).click();
          await page
            .getByRole('group', { name: 'Games in this round' })
            .getByRole('button')
            .first()
            .click();
        }

        const results = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze();
        for (const v of results.violations) {
          for (const node of v.nodes) {
            failures.push({ route: name, impact: v.impact, detail: node.failureSummary, html: node.html.slice(0, 120) });
          }
        }
      }
      expect(failures, JSON.stringify(failures, null, 2)).toEqual([]);
    });
  }
}
