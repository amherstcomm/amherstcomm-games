// What somebody without an avatar is drawn as: their initials, on a colour
// that is theirs every time.
import { describe, expect, it } from 'vitest';
import { COLORS, PRESETS, colorFor, initials, presetEmoji } from '@/avatars';

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
    expect(COLORS).toContain(colorFor('u-1'));
    expect(COLORS).toContain(colorFor(null));
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
