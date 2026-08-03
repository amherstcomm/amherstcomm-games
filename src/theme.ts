// Appearance settings. The actual colors live in index.css as CSS variables;
// this just decides which set is active by stamping attributes on <html>.
import { createContext, useContext, useEffect } from 'react';

export type ThemeMode = 'system' | 'light' | 'dark';
// deuter covers deuteranopia/protanopia (red-green, by far the most common),
// tritan covers tritanopia (blue-yellow), mono covers achromatopsia and any
// case where hue can't be relied on at all
export type Palette = 'default' | 'deuter' | 'tritan' | 'mono';
// every size in the app is in rem, so scaling the root scales all of it
export type TextScale = 'normal' | 'large' | 'larger';

export const THEME_MODES: ThemeMode[] = ['system', 'light', 'dark'];
export const PALETTES: Palette[] = ['default', 'deuter', 'tritan', 'mono'];
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
