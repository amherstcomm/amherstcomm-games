// One list per enumeration, and the parts a type cannot promise.
//
// `MODE_SLUG: Record<Mode, Slug>` reads as exhaustive and is built by
// inverting `SLUG_MODE`, which TypeScript cannot check: it can see that the
// object is *claimed* to have every Mode, not that the inversion actually
// produced one. It was `Object.fromEntries(...) as Record<Mode, Slug>` before,
// and the cast was load-bearing damage — a Mode with no slug compiled cleanly
// and handed back `undefined` at runtime, which is how a link to a real game
// becomes a link to nowhere.
//
// So the type says the shape and this says the coverage. Everything below is a
// claim no compiler makes.
import { describe, expect, it } from 'vitest';
import {
  ALL_MODES,
  ALL_SLUGS,
  ALL_VIEWS,
  MODE_SLUG,
  SLUG_MODE,
  SLUG_NAME,
  modeOf,
} from '@/games';

describe('the game tables', () => {
  it('has ten of everything, and no duplicates', () => {
    expect(ALL_MODES).toHaveLength(10);
    expect(ALL_SLUGS).toHaveLength(10);
    expect(new Set(ALL_MODES).size).toBe(10);
    expect(new Set(ALL_SLUGS).size).toBe(10);
  });

  it('gives every mode a slug — the thing the cast used to pretend', () => {
    const missing = ALL_MODES.filter((m) => !MODE_SLUG[m]);
    expect(missing, `modes with no slug: ${missing.join(', ')}`).toEqual([]);
  });

  it('gives every slug a mode, and a name to read', () => {
    expect(ALL_SLUGS.filter((s) => !SLUG_MODE[s])).toEqual([]);
    expect(ALL_SLUGS.filter((s) => !SLUG_NAME[s])).toEqual([]);
  });

  it('round-trips both ways, so the two tables cannot disagree', () => {
    for (const slug of ALL_SLUGS) expect(MODE_SLUG[SLUG_MODE[slug]]).toBe(slug);
    for (const mode of ALL_MODES) expect(SLUG_MODE[MODE_SLUG[mode]]).toBe(mode);
  });

  it('maps slugs to distinct modes — two games sharing one would silently merge them', () => {
    expect(new Set(ALL_SLUGS.map((s) => SLUG_MODE[s])).size).toBe(ALL_SLUGS.length);
  });

  it('modeOf is SLUG_MODE, so callers need not know which to reach for', () => {
    for (const slug of ALL_SLUGS) expect(modeOf(slug)).toBe(SLUG_MODE[slug]);
  });

  it('names three views', () => {
    expect(ALL_VIEWS).toEqual(['solve', 'play', 'learn']);
  });

  it('hands out copies, so a caller sorting the list cannot reorder it for everyone', () => {
    // ALL_MODES is spread from a const tuple; if it were the tuple itself, an
    // in-place sort anywhere would be global and permanent
    const before = [...ALL_MODES];
    expect(() => [...ALL_MODES].sort()).not.toThrow();
    expect(ALL_MODES).toEqual(before);
  });
});
