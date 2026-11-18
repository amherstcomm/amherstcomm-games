// Every game has a tile, and every tile's glyph reads on its fill.
import { describe, expect, it } from 'vitest';
import { GAME_ICONS, TILE_COLOURS } from '@/gameTiles';
import { ALL_SLUGS } from '@/games';

const lin = (c: number) => (c / 255 <= 0.03928 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4);
const lum = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => lin(parseInt(hex.slice(i, i + 2), 16)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a: string, b: string) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

describe('game tiles', () => {
  it('cover every game, and no others', () => {
    expect(Object.keys(TILE_COLOURS).sort()).toEqual([...ALL_SLUGS].sort());
    expect(Object.keys(GAME_ICONS).sort()).toEqual([...ALL_SLUGS].sort());
  });

  it('put every glyph at 4.5:1 or better on its fill', () => {
    for (const [slug, { fill, glyph }] of Object.entries(TILE_COLOURS)) {
      expect(ratio(fill, glyph), slug).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('give every game a fill of its own', () => {
    const fills = Object.values(TILE_COLOURS).map((t) => t.fill.toLowerCase());
    expect(new Set(fills).size).toBe(fills.length);
  });
});
