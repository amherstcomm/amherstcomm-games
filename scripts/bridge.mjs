// Bridge: SNOW · ? · BALL, five of them a day.
//
// Like the ladder, almost nothing happens here — the prompts and their single
// answers were settled at harvest (scripts/bridge-harvest.mjs), so a daily is a
// deal from a pool rather than a construction. What the generator decides is
// which five prompts a day and difficulty get, and that is a walk.
//
// Two things are worth knowing about the shape of this one.
//
// A board is five prompts with five *different* answers. Without that rule the
// walk will happily deal OUT three times in one board, because the pool holds
// far more prompts than answers — 13,944 across 479 — and the productive
// answers own most of the prompts. Three OUTs is not a board, it is one prompt
// asked three ways.
//
// And difficulty is not the pool. Every tier deals from all of it; what changes
// is the hint budget. The first design split the pool by how many compounds an
// answer appears in, which is circular — that number *is* the prompt count, so
// the easy tier was defined by the property that made it repetitive, and came
// out as two dozen answers. Support is the dial that leaves supply alone.

export { cycleOf, permutedIndex } from './walk.mjs';
import { permutedIndex } from './walk.mjs';

/** Prompts in play: `review: true` is the human hold, same as the cryptogram
 *  pool and the ladder pairs — kept in the data so a change of heart is an
 *  unflag rather than a re-harvest. */
export function livePrompts(parsed) {
  return parsed.prompts.filter((p) => !p.review);
}

/** Five is enough to be a session and few enough that the hint budget bites:
 *  at easy you can buy help on three of five, at extreme on none. */
export const BOARD_SIZE = 5;

/** What difficulty means here: how many prompts you can buy help on.
 *
 *  Not the word tier, and not how obscure the answer is. Bridge answers are
 *  common words by nature — a rare word rarely joins to anything — so there is
 *  no supply of hard vocabulary to draw on even if we wanted it. A hint buys
 *  the answer's length or its next letter, player's choice, and it applies to
 *  one prompt rather than the board. */
export const TIER_HINTS = {
  easy: 3,
  hard: 1,
  extreme: 0,
};

/** The prompts a difficulty can be dealt: all of them.
 *
 *  Kept as a function so the call site reads like the ladder's and so this stays
 *  the one place to change if a tier ever does want its own slice. */
export function poolFor(prompts) {
  return prompts;
}

/** Deal one board.
 *
 *  Walks the pool from `position`, taking prompts whose answer has not already
 *  been used on this board, so the five are five distinct puzzles. Skipping
 *  costs the walk nothing — it steps on and the no-repeat guarantee still
 *  holds, since the guarantee is about the order being a permutation rather
 *  than about consuming it one at a time.
 *
 *  Returns the prompts and the answers separately. The board a player sees is
 *  the ends alone; the answers ride along for the hints, which need to know the
 *  word before the player does. */
export function generateBoard(pool, cycleRng, position, size = BOARD_SIZE) {
  const answers = new Set();
  const prompts = [];
  for (let step = 0; prompts.length < size && step < pool.length; step++) {
    const p = pool[permutedIndex(cycleRng, pool.length, position + step)];
    if (answers.has(p.m)) continue;
    answers.add(p.m);
    prompts.push(p);
  }
  return {
    prompts: prompts.map((p) => ({ x: p.x, y: p.y })),
    answers: prompts.map((p) => p.m),
  };
}

/** Is `word` a legal bridge for this prompt, given a dictionary?
 *
 *  By rule rather than by stored answer, which is the ladder's trick and the
 *  reason both games can be marked without holding the solution: X+word and
 *  word+Y have to be words, and that is checkable by anyone with the list. The
 *  harvest proved each prompt has one answer within its own bands, but a player
 *  reaching a different legal bridge with a wider dictionary is right, and this
 *  says so. */
export function isBridge(prompt, word, words) {
  const w = String(word ?? '').toLowerCase();
  if (w.length < 3) return false;
  return words.has(prompt.x + w) && words.has(w + prompt.y);
}
