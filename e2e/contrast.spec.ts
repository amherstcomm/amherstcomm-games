// Contrast across every theme × palette, which is the half of accessibility a
// machine checks best and a person checks worst.
//
// The other axe sweep walks fourteen routes on whatever palette happens to be
// default, so three of the four palettes have never been checked by anything
// but a hand audit. That is the real cost of a palette — not the CSS, which is
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

      const failures: unknown[] = [];
      for (const [name, path] of ROUTES) {
        await page.goto(path);
        await page.waitForLoadState('networkidle');

        // the attributes really landed — a silent fallback to default would
        // make this whole sweep a very slow way of testing one palette
        await expect(page.locator('html')).toHaveAttribute('data-palette', palette);
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);

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
