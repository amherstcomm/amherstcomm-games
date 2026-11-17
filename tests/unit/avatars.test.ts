// What somebody without an avatar is drawn as: their initials, on a colour
// that is theirs every time.
import { describe, expect, it } from 'vitest';
import { COLORS, INITIALS_COLORS, PRESETS, colorFor, initials, presetEmoji } from '@/avatars';

describe('initials', () => {
  it('are the first letters of the first and last names', () => {
    expect(initials('Ray Tetzloff')).toBe('RT');
    expect(initials('Mary Ann de la Cruz')).toBe('MC');
  });
  it('are one letter for one name, and a question mark for none', () => {
    expect(initials('Cher')).toBe('C');
    expect(initials('   ')).toBe('?');
    expect(initials(null)).toBe('?');
  });
  it('take a whole character, not half of one', () => {
    expect(initials('Émile Zola')).toBe('ÉZ');
    expect(initials('😀 Smile')).toBe('😀S');
  });
});

describe('the colour for somebody', () => {
  it('is the same every time, and one of the set', () => {
    expect(colorFor('u-1')).toBe(colorFor('u-1'));
    expect(INITIALS_COLORS).toContain(colorFor('u-1'));
    expect(INITIALS_COLORS).toContain(colorFor(null));
  });
});

describe('the pictures', () => {
  it('have names the server accepts, each once', () => {
    for (const p of PRESETS) expect(p.id).toMatch(/^[a-z0-9-]{1,32}$/);
    expect(new Set(PRESETS.map((p) => p.id)).size).toBe(PRESETS.length);
  });
  it('and colours it accepts', () => {
    for (const c of COLORS) expect(c).toMatch(/^#[0-9a-f]{6}$/);
  });
  it('and a name nobody knows still draws something', () => {
    expect(presetEmoji('no-such-thing')).toBe('🙂');
  });
});

// WCAG 2 relative luminance and contrast, for white text on a background.
const lum = (hex: string) => {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const onWhite = (hex: string) => 1.05 / (lum(hex) + 0.05);

describe('initials colours', () => {
  it('every one puts white initials at 4.5:1 or better', () => {
    for (const c of INITIALS_COLORS) expect(onWhite(c), c).toBeGreaterThanOrEqual(4.5);
  });
  it('has one for each picture colour, so nobody changes hue', () => {
    expect(INITIALS_COLORS).toHaveLength(COLORS.length);
  });
  it('is what colorFor hands out', () => {
    for (const seed of ['u-1', 'u-2', 'abc', 'Cy Ortiz', '']) expect(INITIALS_COLORS).toContain(colorFor(seed));
  });
});
