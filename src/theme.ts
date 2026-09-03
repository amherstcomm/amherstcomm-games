// Appearance settings. The actual colors live in index.css as CSS variables;
// this just decides which set is active by stamping attributes on <html>.
import { createContext, useContext, useEffect } from 'react';

export type ThemeMode = 'system' | 'light' | 'dark';
// Four, and every one earns its place on a staff tool. deuter covers
// deuteranopia/protanopia (red-green, by far the most common), tritan covers
// tritanopia (blue-yellow), and mono covers achromatopsia and any case where
// hue cannot be relied on at all — it is also the high-contrast option, since
// it separates every state by lightness. amherst is the company's own.
//
// Seven palettes that existed for taste — sepia, ocean, forest, plum,
// graphite, ember, garnet — and the original green-and-amber default were
// dropped when this became one company's site rather than a public product.
// Nobody here was going to pick Garnet, and each one cost two axe runs in
// every CI build. The classes and their tests remain, so adding one back is
// a block of CSS and a list entry.
export type Palette = 'deuter' | 'tritan' | 'mono' | 'amherst';
// every size in the app is in rem, so scaling the root scales all of it
export type TextScale = 'normal' | 'large' | 'larger';

export const THEME_MODES: ThemeMode[] = ['system', 'light', 'dark'];
export const PALETTES: Palette[] = ['deuter', 'tritan', 'mono', 'amherst'];
/** the ones that exist for colour vision, as opposed to for looks */
export const ACCESSIBLE_PALETTES: Palette[] = ['deuter', 'tritan', 'mono'];

/** The palette that dresses this deployment as its company, and the one class
 *  allowed to move the hues that carry meaning.
 *
 *  Decorative palettes may not, and the reason is in tests/unit/palettes.test.ts:
 *  Ocean set amber to a teal because it suited the mood, and Weave paints its
 *  spangram amber and its theme words sky — so on a pale blue page the two
 *  became one colour and the board stopped saying which words had been found.
 *
 *  A brand palette has a reason a mood does not: this is the whole site's
 *  identity, not one of eleven looks, and green-and-yellow on navy is not what
 *  the company looks like. The licence is narrow, and it is paid for — the
 *  distinctions those hues carry are asserted separately, because "may change
 *  them" must not become "may collapse them". */
export const BRAND_PALETTES: Palette[] = ['amherst'];

/** What to call a colour in copy, per palette — and, for one of them, per
 *  theme as well.
 *
 *  "Must use the amber center letter" is true of no palette here at all. Under
 *  Red-green friendly that letter is orange; under Monochrome it is a grey,
 *  and the whole point of that palette is that there is no hue to name. Prose
 *  that hardcodes a colour is wrong for everyone not using the default, and
 *  silently — the sentence still reads perfectly well.
 *
 *  Monochrome needs the theme too, which the first version of this missed. A
 *  hue survives the light switch: amber is amber on either page. A *lightness*
 *  does not. Every mono tile that reads as the light one on a dark page reads
 *  as the dark one on a light page, so "the spangram locks in white" was
 *  describing, to someone on a light page, the tile that is nearly black.
 *
 *  `key` is the amber-400 family: the letter a word must use, the cell that is
 *  selected. `right` and `wrong` are the found/rejected pair, `span` and
 *  `theme` are Weave's two kinds of line. */
export type ColorWords = {
  right: string;
  wrong: string;
  span: string;
  theme: string;
  key: string;
};

const BASE_WORDS: Record<Palette, ColorWords> = {
  deuter: { right: 'blue', wrong: 'orange', span: 'orange', theme: 'light blue', key: 'orange' },
  tritan: {
    right: 'green',
    wrong: 'vermilion',
    span: 'vermilion',
    theme: 'pale cyan',
    key: 'orange',
  },
  mono: {
    right: 'the light tile',
    wrong: 'the mid-grey tile',
    span: 'white',
    theme: 'grey',
    // no article: this one slots into "the ___ center letter"
    key: 'pale grey',
  },
  // The brand palette moves emerald to teal
  // and amber to orange, so the words have to move with them. Learn mode says
  // "green is the right letter, amber is a letter placed wrong" in prose, and
  // that sentence reads perfectly well while describing tiles of a different
  // colour — which is the entire reason this table exists.
  amherst: { right: 'teal', wrong: 'orange', span: 'orange', theme: 'blue', key: 'orange' },
};

/** Monochrome on a light page, where every lightness above is upside down. */
const MONO_LIGHT: ColorWords = {
  right: 'the dark tile',
  wrong: 'the mid-grey tile',
  span: 'the darkest tile',
  theme: 'a paler grey',
  key: 'mid grey',
};

/** The words for a palette as it is actually being shown. */
export function colorWords(palette: Palette, theme: 'light' | 'dark'): ColorWords {
  return palette === 'mono' && theme === 'light' ? MONO_LIGHT : BASE_WORDS[palette];
}

/** The four colours each palette shows in its row in Settings.
 *
 *  These repeat values index.css already declares, which is a duplication
 *  worth naming rather than hiding. It exists because a swatch depicts a
 *  palette the page is *not* wearing, and the palettes are scoped to :root —
 *  so the picker cannot read the variables of anything but the active one.
 *  Lowering that scope so a subtree could preview a palette would change which
 *  block wins for every colour in light mode: a re-audit of the whole grid for
 *  the sake of four rows.
 *
 *  A unit test holds these to the stylesheet instead — every value here has to
 *  be one that palette actually declares. It caught the mono row inventing a
 *  grey ramp (180/130/90) that the palette never used, which is the failure
 *  this duplication invites: a wrong swatch still looks like a colour, so
 *  nothing about it asks to be checked. */
export const PALETTE_SWATCHES: Record<Palette, string[]> = {
  deuter: ['59 130 246', '230 159 0', '236 72 153', '86 180 233'],
  tritan: ['45 190 125', '232 106 58', '236 88 150', '165 228 240'],
  // the real fills: this palette separates states by lightness, so a swatch
  // showing lightnesses it does not use gets the one thing that matters wrong
  mono: ['235 235 235', '210 210 210', '165 165 165', '150 150 150'],
  // accent, found, present, and the navy the room is made of
  amherst: ['156 195 223', '45 212 191', '251 146 60', '20 26 62'],
};
export const TEXT_SCALES: TextScale[] = ['normal', 'large', 'larger'];
export const TEXT_SCALE_PCT: Record<TextScale, string> = {
  normal: '100%',
  large: '112.5%',
  larger: '125%',
};

const LIGHT_QUERY = '(prefers-color-scheme: light)';

// the games read this so shared results use emoji matching the palette on
// screen, rather than every game taking a prop for it
export const PaletteContext = createContext<Palette>('amherst');
export const usePalette = () => useContext(PaletteContext);

export function resolveTheme(mode: ThemeMode): 'light' | 'dark' {
  if (mode !== 'system') return mode;
  return typeof window !== 'undefined' && window.matchMedia(LIGHT_QUERY).matches
    ? 'light'
    : 'dark';
}

export function applyTheme(mode: ThemeMode, palette: Palette, textScale: TextScale): void {
  const root = document.documentElement;
  const resolved = resolveTheme(mode);
  root.setAttribute('data-theme', resolved);
  root.setAttribute('data-palette', palette);
  // relative units, so a browser font-size preference still compounds
  root.style.fontSize = TEXT_SCALE_PCT[textScale];
  // keeps scrollbars, form controls, and the URL bar in step with the theme
  root.style.colorScheme = resolved;
}

// apply on change, and follow the OS while the mode is "system"
export function useTheme(mode: ThemeMode, palette: Palette, textScale: TextScale): void {
  useEffect(() => {
    applyTheme(mode, palette, textScale);
    if (mode !== 'system') return;
    const mq = window.matchMedia(LIGHT_QUERY);
    const onChange = () => applyTheme(mode, palette, textScale);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [mode, palette, textScale]);
}
