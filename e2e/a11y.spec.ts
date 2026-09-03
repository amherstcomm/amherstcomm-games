// WCAG 2.1 A and AA, the half a machine can check: contrast, names, roles,
// labels, focus order. The judgment half — whether the reading order makes
// sense, whether alt text says anything — stays a human's job, and passing
// here is necessary rather than sufficient.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './fixtures';
import { ALL_SLUGS } from '../src/games';

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
// So the list is generated from the games rather than typed out. An eleventh
// game gets scanned on all four of its views the day it is added, without
// anyone remembering to add it here.
//
// That sentence was here before the list was actually generated, sitting above
// eight hand-typed slugs — so ladder and bridge were never scanned at all,
// under a comment promising they would be. A claim written when it was true of
// the intention rather than the code.
const VIEWS = ['daily', 'solve', 'play', 'learn'] as const;

const PAGES = [
  ['home', '/'],
  ...VIEWS.flatMap((view) => ALL_SLUGS.map((slug) => [`${view} ${slug}`, `/${view}/${slug}`] as const)),
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
  // A live session with no session behind it: the "not started" face, which is
  // what everybody sees before the presenter clicks Start and is therefore the
  // one nobody would think to check. Its presenter half shipped with
  // text-slate-100 — a tier the palette does not define, so it fell through to
  // Tailwind's near-white and was invisible on the light theme.
  ['live', '/live/00000000-0000-0000-0000-000000000000'],
  ['live host', '/live/00000000-0000-0000-0000-000000000000/host'],
  // Signed out, so this is the empty list rather than the editor — but it is
  // still a page with its own headings, inputs and labels, and the editor
  // reuses every one of those classes.
  ['sessions', '/sessions'],
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
