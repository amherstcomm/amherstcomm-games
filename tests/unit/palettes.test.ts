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
import { ACCESSIBLE_PALETTES, BRAND_PALETTES, PALETTES, PALETTE_SWATCHES } from '@/theme';

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
  // Brand palettes are excluded here and only here. They may move a
  // meaning-carrying hue, because dressing the site as its company is a reason
  // a mood is not — and they pay for it in 'a brand palette keeps its meanings
  // apart' below, which asserts the distinctions those hues carry still hold.
  const decorative = PALETTES.filter(
    (p) => !ACCESSIBLE_PALETTES.includes(p) && !BRAND_PALETTES.includes(p)
  );

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
  // and 40% over the page. Ten palettes tell those apart by hue; this one has
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

describe('the wrong answer stays findable', () => {
  // The rule above stops a decorative palette *editing* a meaning-carrying
  // hue. It cannot stop one moving the ground underneath it, and that is the
  // other half of the same failure: rose-400 is what marks a wrong answer, and
  // a palette free to repaint the page is free to paint it rose.
  //
  // Garnet is the case that asked the question — its page sits at hue 6 and
  // rose-400 at hue 16, which is as close as two hues get. It survives because
  // the ramp is deep and desaturated, so lightness does all the separating; a
  // shallower red would have looked fine in the picker and quietly swallowed
  // every wrong answer on the board.
  //
  // Nothing else catches this. Axe checks text against its own background, not
  // one element against the element beside it, so the sweep passes either way.
  // ΔE76 is crude — it is a regression floor, not a perception model — but it
  // sees the thing a contrast ratio cannot, which is two colours that differ
  // in lightness while sharing a hue.
  const rgb = (selectors: string[], name: string): [number, number, number] => {
    for (const s of selectors) {
      const m = blockFor(s).match(new RegExp(`${name}:\\s*(\\d+) (\\d+) (\\d+)`));
      if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
    }
    throw new Error(`${name} not declared in ${selectors.join(', ')}`);
  };
  const lab = ([r, g, b]: [number, number, number]) => {
    const f = (c: number) => (c / 255 <= 0.04045 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4);
    const [R, G, B] = [f(r), f(g), f(b)];
    const k = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
    const X = k((0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047);
    const Y = k(0.2126 * R + 0.7152 * G + 0.0722 * B);
    const Z = k((0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883);
    return [116 * Y - 16, 500 * (X - Y), 200 * (Y - Z)];
  };
  const dE = (a: [number, number, number], b: [number, number, number]) => {
    const [A, B] = [lab(a), lab(b)];
    return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]);
  };
  // Every palette that repaints the room, brand ones included — they move the
  // ground as much as a decorative one does, and a wrong answer has to stay
  // findable on it either way.
  const decorative = PALETTES.filter((p) => !ACCESSIBLE_PALETTES.includes(p));

  // Floors sit under the tightest shipping pair with room to spare, so this
  // fails on a new palette rather than on the ones already measured. The
  // ground pairs run 61–86 today; accent-vs-wrong is tighter everywhere,
  // because on several palettes the accent is deliberately a warm hue.
  it.each(decorative)('%s keeps rose clear of the ground it sits on', (palette) => {
    for (const [theme, selectors] of [
      ['dark', [`:root[data-palette='${palette}']`, ":root[data-theme='dark']"]],
      [
        'light',
        [
          `:root[data-theme='light'][data-palette='${palette}']`,
          `:root[data-palette='${palette}']`,
          ":root[data-theme='light']",
        ],
      ],
    ] as const) {
      const wrong = rgb([...selectors], '--c-rose-400');
      for (const [what, name, floor] of [
        ['the page', '--c-slate-950', 40],
        ['a panel', '--c-slate-800', 40],
        ['the accent', '--c-accent', 20],
      ] as const) {
        const d = dE(wrong, rgb([...selectors], name));
        expect(d, `${palette} on ${theme}: a wrong answer is ΔE ${d.toFixed(1)} from ${what}`).toBeGreaterThan(floor);
      }
    }
  });
});

describe('a brand palette keeps its meanings apart', () => {
  // The licence granted above, and its price. A brand palette may move the
  // hues that carry meaning — the site should look like its company, and mint
  // green on navy does not. What it may not do is collapse a distinction a
  // player reads, and nothing else in this file would notice if it did.
  //
  // Three of them. Found against present is read every turn on a Guess board.
  // The spangram against a theme word is the pair Ocean actually broke. And
  // the copies — success, span, the chords — repeat those hues by value rather
  // than by reference, so a palette that moves one ramp and forgets the copy
  // puts two different greens on the same page.
  const rgb = (selectors: string[], name: string): [number, number, number] => {
    for (const sel of selectors) {
      const m = blockFor(sel).match(new RegExp(`${name}:\\s*(\\d+) (\\d+) (\\d+)`));
      if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
    }
    throw new Error(`${name} not declared in ${selectors.join(', ')}`);
  };
  const lin = (c: number) => (c / 255 <= 0.04045 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4);
  const lum = ([r, g, b]: [number, number, number]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  const lab = ([r, g, b]: [number, number, number]) => {
    const [R, G, B] = [lin(r), lin(g), lin(b)];
    const k = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
    const X = k((0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047);
    const Y = k(0.2126 * R + 0.7152 * G + 0.0722 * B);
    const Z = k((0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883);
    return [116 * Y - 16, 500 * (X - Y), 200 * (Y - Z)];
  };
  const dE = (a: [number, number, number], b: [number, number, number]) => {
    const [A, B] = [lab(a), lab(b)];
    return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]);
  };
  const over = (fg: [number, number, number], a: number, bg: [number, number, number]) =>
    fg.map((c, i) => a * c + (1 - a) * bg[i]) as [number, number, number];

  const themes = (palette: string) =>
    [
      ['dark', [`:root[data-palette='${palette}']`, ":root[data-theme='dark']"]],
      [
        'light',
        [
          `:root[data-theme='light'][data-palette='${palette}']`,
          `:root[data-palette='${palette}']`,
          ":root[data-theme='light']",
        ],
      ],
    ] as const;

  it.each(BRAND_PALETTES)('%s tells a found word from a present one', (palette) => {
    for (const [theme, sel] of themes(palette)) {
      const d = dE(rgb([...sel], '--c-emerald-400'), rgb([...sel], '--c-amber-400'));
      expect(d, `${palette} on ${theme}: found and present are ΔE ${d.toFixed(1)} apart`).toBeGreaterThan(40);
    }
  });

  it.each(BRAND_PALETTES)('%s tells a spangram from a theme word', (palette) => {
    // The Ocean failure exactly: Weave paints the spangram amber-400 at 50%
    // and a theme word sky-400 at 40%, both over the page.
    for (const [theme, sel] of themes(palette)) {
      const page = rgb([...sel], '--c-slate-950');
      const span = over(rgb([...sel], '--c-amber-400'), 0.5, page);
      const word = over(rgb([...sel], '--c-sky-400'), 0.4, page);
      const [hi, lo] = [lum(span), lum(word)].sort((a, b) => b - a);
      const ratio = (hi + 0.05) / (lo + 0.05);
      const d = dE(span, word);
      expect(
        ratio > 1.4 || d > 25,
        `${palette} on ${theme}: spangram and theme word are ${ratio.toFixed(2)} apart in lightness and ΔE ${d.toFixed(1)} in colour`
      ).toBe(true);
    }
  });

  it.each(BRAND_PALETTES)('%s moves the copies with the hues they copy', (palette) => {
    // These repeat a ramp rather than referencing it, so a palette that moves
    // the ramp and forgets the copy puts two different greens on one board.
    //
    // Hue rather than ΔE, because the copies are not equal by design: this
    // file's header says 100-300 are text that darkens in light mode while
    // 400-500 stay saturated fills, so --c-success is emerald-400 on dark and
    // emerald-300's depth on light. Lightness is allowed to move; the hue
    // family is what must not.
    const hue = (c: [number, number, number]) => {
      const [, a, b] = lab(c);
      return (Math.atan2(b, a) * 180) / Math.PI;
    };
    const apart = (x: number, y: number) => {
      const d = Math.abs(x - y) % 360;
      return d > 180 ? 360 - d : d;
    };
    for (const [theme, sel] of themes(palette)) {
      for (const [copy, source] of [
        ['--c-success', '--c-emerald-400'],
        ['--chord-4', '--c-emerald-400'],
        ['--span', '--c-amber-400'],
        ['--chord-5', '--c-amber-400'],
      ] as const) {
        const d = apart(hue(rgb([...sel], copy)), hue(rgb([...sel], source)));
        expect(
          d,
          `${palette} on ${theme}: ${copy} is ${d.toFixed(0)}° of hue from ${source}`
        ).toBeLessThan(30);
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
