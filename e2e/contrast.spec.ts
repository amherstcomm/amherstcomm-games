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
  // A matching question, which draws a colour per pair at both ends of a line.
  // Those tiers are on nothing else, so nothing else would sweep them -- and
  // the answer to "is text-sky-200 readable on the light theme" is measured
  // here or not at all.
  ['matching', '/live/5f7c2a10-3b4d-4e8f-9a12-6c0d1e2f3a4b'],
  // A contest: a gallery of entries over a form, with the prize in the amber
  // it shares with nothing else on a page swept here. It is also the newest
  // page, which is the one most likely to have reached for a tier no theme
  // moves.
  ['contest', '/contest/c1'],
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
                : url.includes('current_item')
                  ? {
                      state: 'open',
                      id: 'q1',
                      position: 1,
                      opened_at: new Date().toISOString(),
                      seconds: null,
                      now: new Date().toISOString(),
                      // Six pairs, so every hue is on screen at once -- a
                      // question with three would never reach the later ones,
                      // which is where the colour with no theme behind it was.
                      mine: {
                        One: 'Alpha',
                        Two: 'Beta',
                        Three: 'Gamma',
                        Four: 'Delta',
                        Five: 'Epsilon',
                        Six: 'Zeta',
                      },
                      answer: null,
                      yours: false,
                      kind: 'match',
                      prompt: 'Match the year to the event',
                      payload: {
                        left: ['One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven'],
                        right: ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta', 'Eta'],
                      },
                    }
                  : url.includes('my_standing')
                    ? { ok: true, points: 0, scored: 0 }
                    : url.includes('contest_view')
                      ? {
                          ok: true,
                          contest: {
                            id: 'c1',
                            name: 'Pumpkin carving',
                            blurb: 'Carve one, photograph it, tell us about it.',
                            entries_open_on: '2026-01-01',
                            entries_close_on: '2027-12-30',
                            votes_open_on: '2027-12-31',
                            votes_close_on: '2027-12-31',
                            who_enters: 'players',
                            entrants_shown: true,
                            voters_shown: false,
                            picks: 3,
                            prize: 'A day off',
                            phase: 'entries',
                            // so the form and its controls are on screen too:
                            // a page swept without its inputs is the admin
                            // route's mistake repeated
                            may_enter: true,
                          },
                          entries: [
                            {
                              id: 'e1',
                              title: 'Jack the Ripper',
                              blurb: 'A butter knife at eleven at night.',
                              image_path: null,
                              entrant: 'Ada Lovelace',
                              mine: false,
                            },
                            {
                              id: 'e2',
                              title: 'Gourdon',
                              blurb: null,
                              image_path: null,
                              entrant: 'Bea Smith',
                              mine: false,
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

        // Two pairs are already made by `mine`; a third is made here so a
        // colour is on screen mid-pairing as well as settled.
        if (name === 'matching') {
          await page.getByRole('button', { name: /^Seven/ }).click();
        }

        // Measured here rather than left to axe, which answers "incomplete"
        // for text over a gradient and cannot resolve the page ground at all --
        // so a colour with no theme variable behind it came through as
        // Tailwind's own fixed hue, was invisible on the light theme, and this
        // sweep went green. Found on a screenshot, not by a test, which is the
        // reason this block exists.
        if (name === 'matching') {
          const worst = await page.evaluate(() => {
            const lum = (rgb: number[]) => {
              const [r, g, b] = rgb.map((v) => {
                const c = v / 255;
                return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
              });
              return 0.2126 * r + 0.7152 * g + 0.0722 * b;
            };
            const parse = (colour: string) =>
              (colour.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
            /** The first background this element actually sits on. */
            const groundOf = (el: Element): number[] => {
              let at: Element | null = el;
              while (at) {
                const bg = getComputedStyle(at).backgroundColor;
                const rgb = parse(bg);
                const alpha = Number((bg.match(/[\d.]+/g) ?? [])[3] ?? 1);
                if (rgb.length === 3 && alpha > 0.9) return rgb;
                at = at.parentElement;
              }
              return [255, 255, 255];
            };
            let worstSeen = 21;
            for (const el of document.querySelectorAll('[data-pair-label]')) {
              const colour = parse(getComputedStyle(el).color);
              const ground = groundOf(el);
              const a = lum(colour) + 0.05;
              const b = lum(ground) + 0.05;
              const ratio = a > b ? a / b : b / a;
              worstSeen = Math.min(worstSeen, ratio);
            }
            return worstSeen;
          });
          // AA for text this size. The teal that started this measured about
          // 1.6 against the light theme's ground.
          expect(worst, `${palette} on ${theme}: faintest pair label`).toBeGreaterThan(4.5);
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
