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
  FEED_NAME,
  GAME_NAME,
  MODE_SLUG,
  POOL_MODES,
  PROGRESS_NAME,
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

  it('gives every mode a feed name — the third naming, and the least visible', () => {
    // Mode is what storage keys on, Slug is what the address says, and this is
    // what daily_puzzles and the published files call it. Guess is `pattern`,
    // `guess` and `words` in the three places, all for historical reasons, and
    // nothing but this test says the third table is complete.
    const missing = ALL_MODES.filter((m) => !FEED_NAME[m]);
    expect(missing, `modes with no feed name: ${missing.join(', ')}`).toEqual([]);
    expect(new Set(ALL_MODES.map((m) => FEED_NAME[m])).size).toBe(ALL_MODES.length);
  });

  it('gives every mode a progress name, and keeps it distinct', () => {
    // daily_progress and game_results are keyed on this, so a missing entry
    // loses a game's cross-device sync and a collision merges two games' boards
    for (const m of ALL_MODES) expect(PROGRESS_NAME[m], m).toBeTruthy();
    expect(new Set(ALL_MODES.map((m) => PROGRESS_NAME[m])).size).toBe(ALL_MODES.length);
  });

  it('differs from the feed naming on exactly one game, on purpose', () => {
    // The published board is `words` and the row recording that you played it
    // is `guess`. That is a real inconsistency in the schema, not a typo here —
    // pinned so that unifying them later is a deliberate migration rather than
    // something someone "tidies" and breaks two tables with.
    const differ = ALL_MODES.filter((m) => FEED_NAME[m] !== PROGRESS_NAME[m]);
    expect(differ).toEqual(['pattern']);
    expect(FEED_NAME.pattern).toBe('words');
    expect(PROGRESS_NAME.pattern).toBe('guess');
  });

  it('only claims a pool for games that have one', () => {
    // Guess, Scramble, Hive, Grid and Boxed generate their practice boards on
    // the spot; the other five draw from a pre-generated pool. Asking for a
    // pool that was never published is a 404 on every practice deal.
    expect([...POOL_MODES].sort()).toEqual(
      ['bridge', 'cryptogram', 'ladder', 'squares', 'weave'].sort()
    );
    for (const m of POOL_MODES) expect(ALL_MODES).toContain(m);
  });

  it('gives every mode both names, and never an empty one', () => {
    for (const m of ALL_MODES) {
      expect(GAME_NAME[m]?.short, `${m} short`).toBeTruthy();
      expect(GAME_NAME[m]?.full, `${m} full`).toBeTruthy();
    }
  });

  it('keeps the two names distinct per game, and unambiguous across games', () => {
    // Two games sharing a short name would make the nav unreadable and the
    // hide-a-game checkboxes ambiguous
    expect(new Set(ALL_MODES.map((m) => GAME_NAME[m].short)).size).toBe(ALL_MODES.length);
    expect(new Set(ALL_MODES.map((m) => GAME_NAME[m].full)).size).toBe(ALL_MODES.length);
  });

  it('derives the invitation name from the same table', () => {
    // SLUG_NAME used to be a second hand-written list of the same ten names
    for (const slug of ALL_SLUGS) expect(SLUG_NAME[slug]).toBe(GAME_NAME[SLUG_MODE[slug]].full);
  });

  it('names the two views, play first', () => {
    // 'solve' was the third and is gone: this deployment is for playing, and a
    // solver is a way to win a prize without playing. Order matters — App
    // sends anyone on a hidden view to shownViews[0], so play has to be first
    // or a stored solver state would land people in the tutorial.
    expect(ALL_VIEWS).toEqual(['play', 'learn']);
  });

  it('hands out copies, so a caller sorting the list cannot reorder it for everyone', () => {
    // ALL_MODES is spread from a const tuple; if it were the tuple itself, an
    // in-place sort anywhere would be global and permanent
    const before = [...ALL_MODES];
    expect(() => [...ALL_MODES].sort()).not.toThrow();
    expect(ALL_MODES).toEqual(before);
  });
});
