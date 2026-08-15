// The bridge rule, in one place, so the board, the solver and Learn cannot
// disagree about what counts — the same reason src/ladder.ts exists.
//
// A bridge is spelling and nothing else: X + M and M + Y both have to be
// words. Not compounds. `reddish` is red+dish and `grimace` is grim+ace, and
// both are fair prompts, because a solver who thinks of the answer can check
// it against the dictionary they already have.
//
// That is also why the server can mark a board without holding its answers,
// and why a player who reaches a bridge the harvest never found is right.

/** One prompt: the two ends a player is shown. */
export type Prompt = { x: string; y: string };

/** Does `word` bridge this prompt, in this dictionary? */
export function isBridge(prompt: Prompt, word: string, words: Set<string>): boolean {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  // three letters is the harvest's floor for a part, and a one- or two-letter
  // "bridge" is a spelling accident rather than an answer
  if (w.length < 3) return false;
  return words.has(prompt.x + w) && words.has(w + prompt.y);
}

/** Every word in `words` that bridges this prompt.
 *
 *  The harvest only keeps prompts with a single answer, so this normally
 *  returns one — but it returns all of them, because the solver's job is to
 *  say what is true rather than what was published, and a wider dictionary
 *  than the harvest used can legitimately find another. */
export function bridges(prompt: Prompt, words: Iterable<string>): string[] {
  const out: string[] = [];
  const set = words instanceof Set ? words : new Set(words);
  for (const w of set) {
    if (w.length < 3) continue;
    if (set.has(prompt.x + w) && set.has(w + prompt.y)) out.push(w);
  }
  return out.sort();
}

/** What a hint turns over.
 *
 *  Two kinds at the same price, so spending one is a decision: `length` is
 *  broad and cheap to reason from, `letter` is narrow and specific. Which you
 *  want depends on whether you are stuck for the shape of the word or for the
 *  word itself. */
export type HintKind = 'length' | 'letter';

/** The hints spent on one prompt: whether its length is showing, and how many
 *  letters have been turned over from the left. */
export type PromptHints = { length: boolean; letters: number };

export const NO_HINTS: PromptHints = { length: false, letters: 0 };

/** What the player can see of an answer, given what they have spent on it.
 *
 *  Returns the revealed prefix and whether the length is known, rather than a
 *  formatted string, so the board can draw it and a screen reader can say it
 *  without either re-deriving the rule. */
export function revealed(answer: string, hints: PromptHints): { prefix: string; length: number | null } {
  return {
    prefix: answer.slice(0, Math.max(0, Math.min(hints.letters, answer.length))),
    length: hints.length || hints.letters > 0 ? answer.length : null,
  };
}

/** Spending a hint of this kind on a prompt, or null when it buys nothing.
 *
 *  Asking for a length twice buys nothing, and neither does turning over more
 *  letters than the answer has — refusing both here rather than in the board
 *  is what stops a budget being spent on nothing. */
export function spend(
  answer: string,
  hints: PromptHints,
  kind: HintKind
): PromptHints | null {
  if (kind === 'length') return hints.length ? null : { ...hints, length: true };
  if (hints.letters >= answer.length - 1) return null;
  return { ...hints, letters: hints.letters + 1 };
}
