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
