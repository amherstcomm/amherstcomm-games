// Appearance settings. The actual colors live in index.css as CSS variables;
// this just decides which set is active by stamping attributes on <html>.
import { useEffect } from 'react';

export type ThemeMode = 'system' | 'light' | 'dark';
// deuter covers deuteranopia/protanopia (red-green, by far the most common),
// tritan covers tritanopia (blue-yellow), mono covers achromatopsia and any
// case where hue can't be relied on at all
export type Palette = 'default' | 'deuter' | 'tritan' | 'mono';

export const THEME_MODES: ThemeMode[] = ['system', 'light', 'dark'];
export const PALETTES: Palette[] = ['default', 'deuter', 'tritan', 'mono'];

const LIGHT_QUERY = '(prefers-color-scheme: light)';

export function resolveTheme(mode: ThemeMode): 'light' | 'dark' {
  if (mode !== 'system') return mode;
  return typeof window !== 'undefined' && window.matchMedia(LIGHT_QUERY).matches
    ? 'light'
    : 'dark';
}

export function applyTheme(mode: ThemeMode, palette: Palette): void {
  const root = document.documentElement;
  const resolved = resolveTheme(mode);
  root.setAttribute('data-theme', resolved);
  root.setAttribute('data-palette', palette);
  // keeps scrollbars, form controls, and the URL bar in step with the theme
  root.style.colorScheme = resolved;
}

// apply on change, and follow the OS while the mode is "system"
export function useTheme(mode: ThemeMode, palette: Palette): void {
  useEffect(() => {
    applyTheme(mode, palette);
    if (mode !== 'system') return;
    const mq = window.matchMedia(LIGHT_QUERY);
    const onChange = () => applyTheme(mode, palette);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [mode, palette]);
}
