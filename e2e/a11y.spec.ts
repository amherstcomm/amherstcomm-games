// WCAG 2.1 A and AA, the half a machine can check: contrast, names, roles,
// labels, focus order. The judgment half — whether the reading order makes
// sense, whether alt text says anything — stays a human's job, and passing
// here is necessary rather than sufficient.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './fixtures';

// Every route, not every daily.
//
// This walked six fixed routes once, then grew to all eight dailies — and the
// comment it grew for said "every game's daily, not a sample of them", which
// was true and read as thoroughness. Underneath, three of the four views were
// still samples: two solvers of eight, two learn pages of eight, and not one
// of the eight practice routes had ever been scanned at all. Coverage that
// looks complete is worse than coverage that admits what it skips, because
// nobody goes back to check it.
//
// So the list is generated from the games rather than typed out. A ninth game
// gets scanned on all four of its views the day it is added, without anyone
// remembering to add it here.
const SLUGS = [
  'guess',
  'scramble',
  'hive',
  'grid',
  'boxed',
  'weave',
  'squares',
  'cryptogram',
] as const;
const VIEWS = ['daily', 'solve', 'play', 'learn'] as const;

const PAGES = [
  ['home', '/'],
  ...VIEWS.flatMap((view) => SLUGS.map((slug) => [`${view} ${slug}`, `/${view}/${slug}`] as const)),
  ['settings site', '/settings/site'],
  ['settings games', '/settings/games'],
  ['settings privacy', '/settings/privacy'],
  ['stats', '/stats'],
  ['keys', '/keys'],
  ['about', '/about'],
  ['legal notices', '/legal/notices'],
  ['legal privacy', '/legal/privacy'],
  ['legal terms', '/legal/terms'],
  // signed out, which is the face most visitors meet
  ['account', '/account'],
] as const;

for (const [name, path] of PAGES) {
  test(`${name} has no WCAG A/AA violations axe can see`, async ({ page }) => {
    await page.goto(path);
    // let the board or word list arrive so we scan the real page, not a shell
    await page.waitForLoadState('networkidle');

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    const summary = results.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      nodes: v.nodes.length,
      sample: v.nodes[0]?.html.slice(0, 120),
    }));
    expect(summary, JSON.stringify(summary, null, 2)).toEqual([]);
  });
}
