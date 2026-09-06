// Word ladder: two words the same length, and the shortest chain of real words
// between them, changing one letter at a time.
//
// Almost nothing happens here, which is the point. The pair and its par were
// settled at harvest (scripts/ladder-harvest.mjs), so a daily is a deal from a
// pool rather than a construction — there is no board to build, no key to
// choose, no uniqueness to prove. What the generator decides is which pair a
// given day and difficulty gets, and that is a walk.
//
// The route is never published and never stored. A ladder is checked by rule —
// every rung a word in the tier, one letter from the last, ending where it
// should — so the server can mark an answer without holding one, which no
// other game here manages. It also means a player who finds a different route
// of the same length is right, because they are.

export { cycleOf, permutedIndex } from './walk.mjs';

/** The pairs in play: `review: true` is the human hold, same as the cryptogram
 *  pool — kept in the data so a change of heart is an unflag. */
export function livePairs(parsed, blocked = null) {
  return parsed.pairs.filter(
    (p) => !p.review && !(blocked && (blocked.has(p.a) || blocked.has(p.b)))
  );
}

/** What difficulty means here.
 *
 *  Not the word tier. Every rung comes from the common tier at every level,
 *  because a ladder whose only route runs through a word nobody knows is not
 *  harder, it is unfair — and widening the dictionary *helps* a solver, since
 *  more words means more routes. Length is the honest dial: further to go, more
 *  places to go wrong. */
export const TIER_PAR = {
  easy: [3, 4],
  hard: [5, 6],
  extreme: [7, 8],
};

/** The pairs a difficulty can be dealt. */
export function poolFor(pairs, difficulty) {
  const [lo, hi] = TIER_PAR[difficulty];
  return pairs.filter((p) => p.par >= lo && p.par <= hi);
}

/** One board. `from` and `to` are both given — that is the puzzle — and `par`
 *  is shown, because a ladder with no stated target is a maze and one that says
 *  five steps is a challenge.
 *
 *  The relation that earned the pair its place stays out. Both ends are on
 *  screen, so COLD and WARM already say what they are to each other, and a
 *  label reading "opposites" prints what the player can see. */
export function generateLadder(pair) {
  return { from: pair.a, to: pair.b, par: pair.par };
}

// ---------------------------------------------------------------------------
// Themed pairs
// ---------------------------------------------------------------------------
// The curated pairs are related in WordNet — COLD and WARM, ACE and ONE — and
// the relation is what makes a pair read as a puzzle somebody set rather than
// two words a search found. A themed month has a relation of its own: both ends
// are the company's own words. That only holds when *both* ends are, which is
// why a theme word paired with any old destination is not offered. Measured on
// a 49-word list, both-ends-themed gives 21 pairs across the three bands and
// one-end-themed gives sixteen thousand, of which `shares → elopes` is typical
// and reads as no theme at all.
//
// Both ends must also be rungs. A ladder is walked through the common tier and
// checked against it rung by rung, so an end the tier has never heard of is an
// end nobody can type — and unlike the guess board, this cannot be fixed by
// shipping the day's words: par is measured over the words a player may use, so
// widening what counts as a rung changes the answer to the puzzle. ESOP stays
// out of this game, and the admin page says which words were left behind.

export const MIN_PAR = 3;
export const MAX_PAR = 8;

/** How far every same-length rung is from `word`, breadth first, giving up at
 *  `max` — the same walk the harvest does, because the number it produces is
 *  the par a player is held to. */
export function distancesFrom(word, byLength, max = MAX_PAR) {
  const pool = byLength.get(word.length) ?? new Set();
  const dist = new Map([[word, 0]]);
  const queue = [word];
  for (let i = 0; i < queue.length; i++) {
    const w = queue[i];
    const d = dist.get(w);
    if (d >= max) continue;
    for (let p = 0; p < w.length; p++) {
      for (let c = 97; c < 123; c++) {
        const next = w.slice(0, p) + String.fromCharCode(c) + w.slice(p + 1);
        if (next !== w && pool.has(next) && !dist.has(next)) {
          dist.set(next, d + 1);
          queue.push(next);
        }
      }
    }
  }
  return dist;
}

/** The rungs, bucketed by length — built once and handed to every walk. */
export function rungsByLength(rungs) {
  const byLength = new Map();
  for (const w of rungs) {
    if (!byLength.has(w.length)) byLength.set(w.length, new Set());
    byLength.get(w.length).add(w);
  }
  return byLength;
}

/** Every ladder a themed word list can set: both ends its own, and a route
 *  through the common tier of 3 to 8 steps.
 *
 *  Sorted, because the draw is by index and an unsorted pool would make the
 *  same seed deal different ladders for no reason anybody could see.
 */
export function themedLadderPairs(themeWords, rungs, blocked = null) {
  if (!themeWords || themeWords.length === 0) return [];
  const byLength = rungsByLength(rungs);
  const usable = [...new Set(themeWords)]
    .filter((w) => rungs.has(w) && !(blocked && blocked.has(w)))
    .sort();
  const out = [];
  for (let i = 0; i < usable.length; i++) {
    const dist = distancesFrom(usable[i], byLength);
    for (let j = i + 1; j < usable.length; j++) {
      const b = usable[j];
      if (b.length !== usable[i].length) continue;
      const par = dist.get(b);
      if (par === undefined || par < MIN_PAR || par > MAX_PAR) continue;
      out.push({ a: usable[i], b, par, rel: ['themed'] });
    }
  }
  return out;
}
