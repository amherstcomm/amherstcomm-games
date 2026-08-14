// Appearance settings. The actual colors live in index.css as CSS variables;
// this just decides which set is active by stamping attributes on <html>.
import { createContext, useContext, useEffect } from 'react';

export type ThemeMode = 'system' | 'light' | 'dark';
// deuter covers deuteranopia/protanopia (red-green, by far the most common),
// tritan covers tritanopia (blue-yellow), mono covers achromatopsia and any
// case where hue can't be relied on at all
// sepia and ocean are there for taste rather than need — they move the page,
// panels and text tiers and leave the meaning-carrying hues alone. They share
// this axis with the accommodations, so choosing one gives up the other; the
// Settings list keeps them in separate groups and says so.
export type Palette =
  | 'default'
  | 'deuter'
  | 'tritan'
  | 'mono'
  | 'sepia'
  | 'ocean'
  | 'forest'
  | 'plum'
  | 'graphite'
  | 'ember'
  | 'garnet';
// every size in the app is in rem, so scaling the root scales all of it
export type TextScale = 'normal' | 'large' | 'larger';

export const THEME_MODES: ThemeMode[] = ['system', 'light', 'dark'];
export const PALETTES: Palette[] = [
  'default',
  'deuter',
  'tritan',
  'mono',
  'sepia',
  'ocean',
  'forest',
  'plum',
  'graphite',
  'ember',
  'garnet',
];
/** the ones that exist for colour vision, as opposed to for looks */
export const ACCESSIBLE_PALETTES: Palette[] = ['default', 'deuter', 'tritan', 'mono'];

/** What to call a colour in copy, per palette — and, for one of them, per
 *  theme as well.
 *
 *  "Must use the amber center letter" is true of one palette in eleven. Under
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
  default: { right: 'green', wrong: 'amber', span: 'gold', theme: 'blue', key: 'amber' },
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
  // decorative palettes leave every meaning-carrying hue alone, so the words
  // for them are the default words
  sepia: { right: 'green', wrong: 'amber', span: 'gold', theme: 'blue', key: 'amber' },
  ocean: { right: 'green', wrong: 'amber', span: 'gold', theme: 'blue', key: 'amber' },
  forest: { right: 'green', wrong: 'amber', span: 'gold', theme: 'blue', key: 'amber' },
  plum: { right: 'green', wrong: 'amber', span: 'gold', theme: 'blue', key: 'amber' },
  graphite: { right: 'green', wrong: 'amber', span: 'gold', theme: 'blue', key: 'amber' },
  ember: { right: 'green', wrong: 'amber', span: 'gold', theme: 'blue', key: 'amber' },
  garnet: { right: 'green', wrong: 'amber', span: 'gold', theme: 'blue', key: 'amber' },
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
 *  the sake of six rows.
 *
 *  A unit test holds these to the stylesheet instead — every value here has to
 *  be one that palette actually declares. It caught the mono row inventing a
 *  grey ramp (180/130/90) that the palette never used, which is the failure
 *  this duplication invites: a wrong swatch still looks like a colour, so
 *  nothing about it asks to be checked. */
export const PALETTE_SWATCHES: Record<Palette, string[]> = {
  default: ['52 211 153', '251 191 36', '251 113 133', '125 211 252'],
  deuter: ['59 130 246', '230 159 0', '236 72 153', '86 180 233'],
  tritan: ['45 190 125', '232 106 58', '236 88 150', '165 228 240'],
  // the real fills: this palette separates states by lightness, so a swatch
  // showing lightnesses it does not use gets the one thing that matters wrong
  mono: ['235 235 235', '210 210 210', '165 165 165', '150 150 150'],
  sepia: ['245 176 65', '184 167 143', '79 66 50', '38 31 22'],
  ocean: ['94 214 226', '152 180 195', '33 70 94', '10 30 45'],
  forest: ['122 205 158', '158 182 168', '46 74 59', '18 34 26'],
  plum: ['209 160 233', '180 166 190', '78 58 90', '38 26 45'],
  graphite: ['214 214 220', '173 173 178', '64 64 68', '29 29 31'],
  ember: ['240 150 118', '188 166 158', '86 55 46', '43 25 21'],
  garnet: ['255 196 205', '188 162 168', '88 43 51', '44 20 25'],
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
export const PaletteContext = createContext<Palette>('default');
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
