// The game bar has to hold every tab at every width, and it stopped doing that
// when the ninth game arrived — quietly, because nothing overflowed the page.
// The horizontal layout wanted 888px of tabs inside a 768px bar, so it never
// fit at any viewport; it just squeezed, and "Word Ladder" ran out of its
// column on a phone.
//
// Nothing else would catch it. axe does not measure layout, and the a11y sweep
// walks one width. This asserts the two things that are actually wrong when a
// tab bar is too full: a label wider than the column it sits in, and a page
// that scrolls sideways.
import { test, expect } from '@playwright/test';

// narrow phone, common phones, small tablet, the old breakpoint, and desktop
const WIDTHS = [320, 375, 414, 640, 768, 900, 1024, 1280, 1440];

test('the game bar stays one row and fits its labels at every width', async ({ page }) => {
  const bad: string[] = [];
  for (const w of WIDTHS) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.goto('/daily/ladder');
    const r = await page.evaluate(() => {
      const nav = document.querySelector('nav[aria-label="Game modes"]');
      if (!nav) return null;
      const navH = Math.round(nav.getBoundingClientRect().height);
      // whichever of the two layouts is showing
      const row = [...nav.querySelectorAll('div')].find(
        (d) => getComputedStyle(d).display === 'grid' && d.children.length > 1
      );
      const cells = row ? [...row.children] : [];
      return {
        navH,
        rows: new Set(cells.map((c) => Math.round(c.getBoundingClientRect().top))).size,
        over: cells
          .filter((c) => {
            const s = c.querySelector('span');
            return !!s && s.scrollWidth > Math.ceil(c.getBoundingClientRect().width) - 4;
          })
          .map((c) => c.querySelector('span')?.textContent ?? '?'),
        scrolls: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        visibleTabs: [...nav.querySelectorAll('a')].filter(
          (a) => a.getBoundingClientRect().width > 0
        ).length,
        // both layouts are always in the DOM; only one has a box
        menuButton: [...nav.querySelectorAll('button[aria-expanded]')].some(
          (b) => b.getBoundingClientRect().width > 0
        ),
      };
    });
    if (!r) throw new Error(`no game bar at ${w}px`);
    // Below lg the tab row is display:none, so the checks above have nothing
    // to look at and would pass on an empty bar. Assert which layout is
    // actually showing, or this test measures a hidden element.
    if (w >= 1024) {
      if (r.visibleTabs < 2) bad.push(`${w}px: expected a row of tabs, saw ${r.visibleTabs}`);
      if (r.menuButton) bad.push(`${w}px: the compact menu is showing on desktop`);
    } else {
      if (!r.menuButton) bad.push(`${w}px: no game menu`);
      if (r.visibleTabs > 1) bad.push(`${w}px: ${r.visibleTabs} tabs are showing instead of a menu`);
    }
    // sticky, so its height is a tax on every screen of every page
    if (r.navH > 64) bad.push(`${w}px: the bar is ${r.navH}px tall`);
    if (r.rows > 1) bad.push(`${w}px: tabs wrapped to ${r.rows} rows`);
    if (r.over.length) bad.push(`${w}px: ${r.over.join(', ')} overflow their columns`);
    if (r.scrolls) bad.push(`${w}px: the page scrolls sideways`);
  }
  expect(bad, bad.join(' | ')).toEqual([]);
});
