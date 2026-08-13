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
import { PALETTES, PALETTE_SWATCHES } from '@/theme';

const css = readFileSync('src/index.css', 'utf8');

/** every `--c-…: r g b` value declared in the block for this selector */
function valuesIn(selector: string): Set<string> {
  const at = css.indexOf(selector + ' {');
  if (at < 0) throw new Error(`no block for ${selector}`);
  const body = css.slice(at, css.indexOf('}', at));
  const out = new Set<string>();
  for (const m of body.matchAll(/--[\w-]+:\s*([\d]{1,3} [\d]{1,3} [\d]{1,3})\s*;/g)) out.add(m[1]);
  return out;
}

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
