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
export function livePairs(parsed) {
  return parsed.pairs.filter((p) => !p.review);
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
