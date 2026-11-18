// Each game's tile: its icon on a colour of its own, a dark fill with a light
// glyph (the layout spec, November 2026). The same tile on the home page, the
// game rail and the menus, so a game is recognised by its colour as well as
// its name -- never by its colour alone; the name is always beside it.
//
// Fixed colours rather than theme tiers: a tile is the game's, the same on
// either theme, and each glyph clears 4.5:1 on its fill
// (tests/unit/gameTiles.test.ts measures).
import { Combine, Grid3x3, Hexagon, KeyRound, LayoutGrid, Puzzle, Shuffle, Square, Table2 } from 'lucide-react';
import LadderIcon from '@/LadderIcon';
import type { Slug } from '@/games';

export const GAME_ICONS: Record<Slug, typeof Grid3x3> = {
  guess: Grid3x3,
  scramble: Shuffle,
  hive: Hexagon,
  grid: LayoutGrid,
  boxed: Square,
  weave: Puzzle,
  squares: Table2,
  cryptogram: KeyRound,
  ladder: LadderIcon as unknown as typeof Grid3x3,
  bridge: Combine,
};

export const TILE_COLOURS: Record<Slug, { fill: string; glyph: string }> = {
  guess: { fill: '#14532D', glyph: '#86EFAC' },
  scramble: { fill: '#1E3A8A', glyph: '#93C5FD' },
  hive: { fill: '#78350F', glyph: '#FCD34D' },
  boxed: { fill: '#4C1D95', glyph: '#C4B5FD' },
  grid: { fill: '#134E4A', glyph: '#5EEAD4' },
  weave: { fill: '#831843', glyph: '#F9A8D4' },
  squares: { fill: '#3F3F46', glyph: '#E4E4E7' },
  cryptogram: { fill: '#7C2D12', glyph: '#FDBA74' },
  ladder: { fill: '#164E63', glyph: '#67E8F9' },
  bridge: { fill: '#365314', glyph: '#BEF264' },
};
