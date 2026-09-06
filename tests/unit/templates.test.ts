// The blank a month gets written into.
//
// One assertion carries this file: each template, pushed back through its own
// parser, comes out clean. A template that does not import is worse than no
// template — it looks like the shape and is not, and the person who filled it
// in finds out after doing the work.
import { describe, expect, it } from 'vitest';
import { LIST_TEMPLATE, PASSAGE_TEMPLATE, THEME_TEMPLATE } from '@/templates';
import { parsePassages, parseWeaveThemes, parseWordLists } from '@/importing';
import { fitsBoards } from '@/weaveFit';
import { tiersFor } from '@/cryptogramFit';

describe('the theme template', () => {
  it('imports cleanly through the parser it is for', () => {
    const { items, problems } = parseWeaveThemes(JSON.stringify(THEME_TEMPLATE));
    expect(problems).toEqual([]);
    expect(items).toHaveLength(2);
  });

  // Handed to somebody who will fill it in elsewhere, so the instructions have
  // to travel with it — and the key holding them must not read as an entry.
  it('carries its instructions where the parser ignores them', () => {
    expect(THEME_TEMPLATE._readme.length).toBeGreaterThan(80);
    const { problems } = parseWeaveThemes(JSON.stringify(THEME_TEMPLATE));
    expect(problems).toEqual([]);
  });

  // An example that fills no board would teach the wrong shape.
  it('and examples that actually fill a board', () => {
    const { items } = parseWeaveThemes(JSON.stringify(THEME_TEMPLATE));
    for (const theme of items) {
      const fits = fitsBoards(theme.spangram, theme.words);
      expect(
        Object.values(fits).some((f) => f.fits),
        `${theme.clue} fills nothing`
      ).toBe(true);
    }
  });

  it('with dates the parser recognises', () => {
    const { items } = parseWeaveThemes(JSON.stringify(THEME_TEMPLATE));
    expect(items[0].from).toBe('2026-10-01');
    expect(items[0].until).toBe('2026-10-01');
  });
});

describe('the list template', () => {
  it('imports cleanly through the parser it is for', () => {
    const { items, problems } = parseWordLists(JSON.stringify(LIST_TEMPLATE));
    expect(problems).toEqual([]);
    expect(items).toHaveLength(2);
    expect(items[0].name).toBe('Employee ownership');
  });

  it('carries its instructions where the parser ignores them', () => {
    expect(LIST_TEMPLATE._readme.length).toBeGreaterThan(80);
  });

  // The point of a themed list, in the example rather than only in the prose.
  it('and an example word no dictionary carries', () => {
    const { items } = parseWordLists(JSON.stringify(LIST_TEMPLATE));
    expect(items[0].words).toContain('esop');
  });
});

describe('the passage template', () => {
  it('imports cleanly through the parser it is for', () => {
    const { items, problems } = parsePassages(JSON.stringify(PASSAGE_TEMPLATE));
    expect(problems).toEqual([]);
    expect(items).toHaveLength(2);
  });

  it('carries its instructions where the parser ignores them', () => {
    expect(PASSAGE_TEMPLATE._readme.length).toBeGreaterThan(80);
  });

  // The whole difficulty of writing one is the length, so an example that no
  // board would take teaches exactly the wrong thing — and between them the two
  // examples have to show both bands, because one of each is the lesson.
  it('and examples a board can actually take, one per band', () => {
    const { items } = parsePassages(JSON.stringify(PASSAGE_TEMPLATE));
    const tiers = items.map((p) => tiersFor(p.text));
    for (const [i, t] of tiers.entries()) {
      expect(t, `example ${i + 1} fits no board`).not.toEqual([]);
    }
    expect(tiers.some((t) => t.includes('easy'))).toBe(true);
    expect(tiers.some((t) => t.includes('extreme'))).toBe(true);
  });
});
