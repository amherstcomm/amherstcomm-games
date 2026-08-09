// WCAG 2.1 A and AA, the half a machine can check: contrast, names, roles,
// labels, focus order. The judgment half — whether the reading order makes
// sense, whether alt text says anything — stays a human's job, and passing
// here is necessary rather than sufficient.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './fixtures';

const PAGES = [
  ['home', '/'],
  ['daily guess', '/daily/guess'],
  ['daily weave', '/daily/weave'],
  ['descramble solver', '/solve/scramble'],
  ['settings', '/settings/site'],
  ['learn hive', '/learn/hive'],
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
