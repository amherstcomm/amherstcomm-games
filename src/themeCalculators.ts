// Whether a word list is rich enough to make puzzles out of.
//
// The Weave calculator answers "does this theme fill a board". These answer the
// same question for the other two games a list could drive, while somebody is
// still writing the list — which is the only time the answer is useful. A list
// finished in September and found to make one puzzle in October is a list
// nobody can fix.
//
// The arithmetic is here rather than in the panel because each of these is a
// small search with an edge, and none of them needs a browser to be wrong.
// scripts/feasibility.mjs asks the same questions from the command line against
// the same rules.

/** No consecutive repeat: a box cannot spell one, because the second letter
 *  would step on the same side as the first. */
const noDouble = (w: string) => !/(\w)\1/.test(w);

export const BOX_LETTERS = 12;

export type Box = {
  /** the two theme words whose letters make it */
  from: [string, string];
  /** four sides of three */
  sides: string[];
  /** every theme word the finished box can spell — the words a player finds */
  holds: string[];
  /** whether two ordinary words finish it, which is the guarantee the daily
   *  makes and the thing a themed box can quietly lose */
  guaranteed: boolean;
};

const spellable = (word: string, sideOf: Record<string, number>) => {
  if (![...word].every((c) => c in sideOf)) return false;
  for (let i = 1; i < word.length; i += 1) {
    if (sideOf[word[i - 1]] === sideOf[word[i]]) return false;
  }
  return true;
};

/** Twelve letters into four sides of three, so every word in `must` is
 *  spellable. Null when no arrangement does. */
export function assignSides(must: string[]): { sides: string[]; sideOf: Record<string, number> } | null {
  const letters = [...new Set(must.join(''))];
  const adjacent = new Set<string>();
  for (const word of must) {
    for (let i = 1; i < word.length; i += 1) {
      adjacent.add(word[i - 1] + word[i]);
      adjacent.add(word[i] + word[i - 1]);
    }
  }
  // Most-constrained letter first, or the search wanders.
  const degree = (c: string) => letters.filter((x) => adjacent.has(c + x)).length;
  letters.sort((a, b) => degree(b) - degree(a));

  const sides: string[][] = [[], [], [], []];
  const place = (i: number): boolean => {
    if (i === letters.length) return true;
    for (const side of sides) {
      if (side.length >= 3) continue;
      if (side.some((x) => adjacent.has(x + letters[i]))) continue;
      side.push(letters[i]);
      if (place(i + 1)) return true;
      side.pop();
    }
    return false;
  };
  if (!place(0)) return null;

  const sideOf: Record<string, number> = {};
  sides.forEach((side, i) => side.forEach((c) => { sideOf[c] = i; }));
  return { sides: sides.map((s) => s.join('')), sideOf };
}

/** Every box that two of these words can make.
 *
 *  Two theme words whose letters are exactly twelve distinct: those letters are
 *  the box, and both words are then findable in it. They do *not* have to chain
 *  — that was the mistake in the first version of this search, and theme words
 *  essentially never chain. The two-word solution the daily guarantees comes
 *  from the dictionary instead, which is what `dictionary` is for; pass none and
 *  `guaranteed` is simply unknown rather than false.
 */
export function boxesFrom(words: string[], dictionary?: string[]): Box[] {
  const usable = [...new Set(words.map((w) => w.trim().toLowerCase()))].filter(
    (w) => /^[a-z]+$/.test(w) && w.length >= 4 && noDouble(w)
  );
  const all = [...new Set(words.map((w) => w.trim().toLowerCase()))].filter((w) =>
    /^[a-z]{3,}$/.test(w)
  );
  const out: Box[] = [];
  // Once, not per box — see indexed() for the six seconds this cost.
  const pool = dictionary ? indexed(dictionary) : null;

  for (let i = 0; i < usable.length; i += 1) {
    for (let j = i + 1; j < usable.length; j += 1) {
      const a = usable[i];
      const b = usable[j];
      if (new Set(a + b).size !== BOX_LETTERS) continue;
      const laid = assignSides([a, b]);
      if (!laid) continue;
      let boxMask = 0;
      for (const c of a + b) boxMask |= 1 << (c.charCodeAt(0) - 97);
      out.push({
        from: [a, b],
        sides: laid.sides,
        holds: all.filter((w) => spellable(w, laid.sideOf)),
        guaranteed: pool ? finishable(laid.sideOf, boxMask, pool) : false,
      });
    }
  }
  // Best first: the number that matters is how many theme words a player finds.
  return out.sort((x, y) => y.holds.length - x.holds.length);
}

/** The dictionary, prepared once for the box search.
 *
 *  Written this way after measuring: the first version filtered the whole
 *  dictionary again for every box, which is thirty-nine thousand per-letter
 *  spellability checks each. A month of overlapping lists then cost six seconds
 *  of a blocked browser, which is what "the page locks up" turned out to be.
 *
 *  A word is a bitmask of its letters. A box is twelve letters, so a word can
 *  only appear in it if its mask is a subset of the box's — one integer
 *  operation, and it rejects almost everything before the expensive check runs.
 *  A doubled letter is dropped here rather than per box: the second one would
 *  always land on the side the first is on, in any arrangement.
 */
type Indexed = { word: string; mask: number; last: string };

function indexed(dictionary: string[]): Indexed[] {
  const out: Indexed[] = [];
  for (const word of dictionary) {
    if (word.length < 3 || !noDouble(word)) continue;
    let mask = 0;
    let ok = true;
    for (let i = 0; i < word.length; i += 1) {
      const bit = word.charCodeAt(i) - 97;
      if (bit < 0 || bit > 25) {
        ok = false;
        break;
      }
      mask |= 1 << bit;
    }
    if (ok) out.push({ word, mask, last: word[word.length - 1] });
  }
  return out;
}

const bits = (mask: number) => {
  let n = 0;
  for (let m = mask; m !== 0; m &= m - 1) n += 1;
  return n;
};

/** Whether two ordinary words spell every letter of the box between them. */
function finishable(sideOf: Record<string, number>, boxMask: number, dictionary: Indexed[]): boolean {
  const usable = dictionary.filter(
    (e) => (e.mask & ~boxMask) === 0 && spellable(e.word, sideOf)
  );
  const byFirst = new Map<string, Indexed[]>();
  for (const e of usable) {
    const list = byFirst.get(e.word[0]);
    if (list) list.push(e);
    else byFirst.set(e.word[0], [e]);
  }
  for (const first of usable) {
    for (const second of byFirst.get(first.last) ?? []) {
      if (bits(first.mask | second.mask) === BOX_LETTERS) return true;
    }
  }
  return false;
}

export type BridgePrompt = { x: string; middle: string; y: string; from: [string, string] };

/** Every bridge these words can make between them.
 *
 *  The themed thing is the compounds, not the answer between them: `nonprofit`
 *  and `profitable` share `profit`, which gives non · profit · able. So this
 *  needs theme words that are compounds sharing a stem, and a list of plain
 *  nouns makes none — which is the answer, and worth seeing before an evening
 *  is spent on it.
 */
export function bridgesFrom(words: string[]): BridgePrompt[] {
  const list = [...new Set(words.map((w) => w.trim().toLowerCase()))].filter((w) =>
    /^[a-z]{5,}$/.test(w)
  );
  const out: BridgePrompt[] = [];
  const seen = new Set<string>();
  for (const a of list) {
    for (const b of list) {
      if (a === b) continue;
      for (let i = 2; i <= a.length - 3; i += 1) {
        const middle = a.slice(i);
        if (middle.length < 3 || !b.startsWith(middle)) continue;
        const x = a.slice(0, i);
        const y = b.slice(middle.length);
        if (x.length < 2 || y.length < 2) continue;
        const key = `${x}|${middle}|${y}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ x, middle, y, from: [a, b] });
      }
    }
  }
  return out;
}
