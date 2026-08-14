// The colours are defined once, in src/index.css, and Tailwind resolves every
// class through those variables — there is not a hex code anywhere in a
// component. The swatches in Settings are the one exception, and they have to
// be: a swatch shows a palette you are *not* using, and the CSS scopes each
// palette to :root, so the picker cannot read the variables for a palette that
// is not currently applied.
//
// So the values are repeated there, and this is what stops them drifting. A
// swatch that no longer matches its palette is a quiet kind of wrong — it
// still looks like a colour, so nothing about it invites a second look.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ACCESSIBLE_PALETTES, PALETTES, PALETTE_SWATCHES } from '@/theme';

const css = readFileSync('src/index.css', 'utf8');

function blockFor(selector: string): string {
  const at = css.indexOf(selector + ' {');
  if (at < 0) throw new Error(`no block for ${selector}`);
  return css.slice(at, css.indexOf('}', at));
}

/** every `--c-…: r g b` value declared in the block for this selector */
function valuesIn(selector: string): Set<string> {
  const out = new Set<string>();
  for (const m of blockFor(selector).matchAll(/--[\w-]+:\s*([\d]{1,3} [\d]{1,3} [\d]{1,3})\s*;/g))
    out.add(m[1]);
  return out;
}

/** every variable the block declares, by name */
function namesIn(selector: string): string[] {
  return [...blockFor(selector).matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]);
}

describe('decorative palettes', () => {
  // The ground and the two colours that are only ever decoration. Everything
  // else — the hue families, the SVG board overlays, success and danger — says
  // something about the game, and a palette that exists because someone likes
  // it has no business editing that.
  //
  // Written after Ocean did exactly that. It set --c-amber-400 to a teal so
  // the accent matched the mood, and Weave paints its spangram amber-400 and
  // its theme words sky-400: on a pale blue page the two became the same
  // colour, and the board stopped saying which word you had found. The prose
  // claim that decorative palettes leave meaning alone was not enough; this is.
  const MAY_CHANGE = /^--c-(slate-\d+|white|black|ink|accent|focus)$/;
  const decorative = PALETTES.filter((p) => !ACCESSIBLE_PALETTES.includes(p));

  it('are stocked', () => {
    expect(decorative.length).toBeGreaterThan(0);
  });

  it('change the room and nothing that carries meaning', () => {
    for (const palette of decorative) {
      for (const selector of [
        `:root[data-palette='${palette}']`,
        `:root[data-theme='light'][data-palette='${palette}']`,
      ]) {
        for (const name of namesIn(selector)) {
          expect(
            MAY_CHANGE.test(name),
            `${palette} sets ${name}, which carries meaning — see ${selector}`
          ).toBe(true);
        }
      }
    }
  });
});

describe('monochrome', () => {
  // Weave paints its spangram amber-400 and its theme words sky-400, at 50%
  // and 40% over the page. Nine palettes tell those apart by hue; this one has
  // none to spend, so the entire distinction is lightness — and light mode had
  // amber at 124 against sky at 136, which composited to a difference of
  // seventeen out of 255. On the palette that exists for people who cannot use
  // hue, the two states of the board looked identical.
  //
  // Amber is pinned: 124 is the floor at which a full-opacity fill still
  // carries dark ink at 4.5:1. So the separation has to come from sky.
  const val = (selector: string, name: string) => {
    const m = blockFor(selector).match(new RegExp(`${name}:\\s*(\\d+) (\\d+) (\\d+)`));
    if (!m) return null;
    return [Number(m[1]), Number(m[2]), Number(m[3])] as [number, number, number];
  };
  const lum = ([r, g, b]: [number, number, number]) => {
    const f = (c: number) => (c / 255 <= 0.03928 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4);
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const over = (fg: [number, number, number], a: number, bg: [number, number, number]) =>
    fg.map((c, i) => a * c + (1 - a) * bg[i]) as [number, number, number];

  it('keeps the spangram and a theme word apart by lightness in both themes', () => {
    for (const [theme, selectors] of [
      ['dark', [":root[data-palette='mono']", ":root[data-theme='dark']"]],
      [
        'light',
        [
          ":root[data-theme='light'][data-palette='mono']",
          ":root[data-palette='mono']",
          ":root[data-theme='light']",
        ],
      ],
    ] as const) {
      // first block that declares it wins, most specific first
      const pick = (name: string) => {
        for (const s of selectors) {
          const v = val(s, name);
          if (v) return v;
        }
        throw new Error(`${name} not found for ${theme}`);
      };
      const page = pick('--c-slate-950');
      const span = over(pick('--c-amber-400'), 0.5, page);
      const word = over(pick('--c-sky-400'), 0.4, page);
      const [hi, lo] = [lum(span), lum(word)].sort((a, b) => b - a);
      const ratio = (hi + 0.05) / (lo + 0.05);
      expect(ratio, `mono on ${theme}: spangram and theme word are ${ratio.toFixed(2)} apart`).toBeGreaterThan(1.4);
    }
  });
});

describe('palette swatches', () => {
  it('offers a swatch for every palette, and no others', () => {
    expect(Object.keys(PALETTE_SWATCHES).sort()).toEqual([...PALETTES].sort());
  });

  it('shows colours the palette actually uses', () => {
    // the dark blocks, since that is what a swatch depicts: the base theme for
    // default, and the palette's own block for the rest
    for (const palette of PALETTES) {
      const declared =
        palette === 'default'
          ? valuesIn(":root[data-theme='dark']")
          : new Set([
              ...valuesIn(`:root[data-palette='${palette}']`),
              ...valuesIn(":root[data-theme='dark']"),
            ]);
      for (const tone of PALETTE_SWATCHES[palette]) {
        expect(declared.has(tone), `${palette} swatch ${tone} is not a colour that palette uses`).toBe(
          true
        );
      }
    }
  });
});
