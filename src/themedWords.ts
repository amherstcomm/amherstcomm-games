// The words a themed day adds to what the board will accept.
//
// A daily answer has to be typeable, and the guess board judges a guess against
// the dictionary bundled with the client. For eleven months that is the whole
// rule. During an event the answer can come from a list somebody wrote, and the
// words an event most wants — ESOP, the name of the building — are exactly the
// ones a dictionary does not carry. Being absent from it is what makes them the
// company's.
//
// So a themed day ships its own words beside the answer, and the board accepts
// those as well. Nothing is revealed by carrying them: the answers themselves
// already ship in the same payload, base64'd against a casual glance rather
// than as a secret. It is a client-side game, and the board on your machine has
// always known what it wants you to type.

/** The themed words out of a daily payload, or none.
 *
 *  Tolerant on purpose. This reads a feed the client did not generate and may
 *  be older or newer than — a day with no theme has no field at all, which is
 *  the ordinary state for most of the year and must not look like an error. */
export function themedWords(payload: unknown): string[] {
  const raw = (payload as { themed?: unknown } | null)?.themed;
  if (typeof raw !== 'string' || raw === '') return [];
  try {
    return atob(raw)
      .split(/\s+/)
      .map((w) => w.trim().toLowerCase())
      .filter((w) => /^[a-z]+$/.test(w));
  } catch {
    // A payload that will not decode is a payload with no theme in it. The
    // board still has its dictionary and the day still has its answer.
    return [];
  }
}

/** What this board will take, at this length: the dictionary plus the day's
 *  own words.
 *
 *  Null when the dictionary has not arrived, which the caller shows as "still
 *  loading" rather than as a refusal — a guess rejected because a fetch was
 *  slow reads as the board calling you wrong. */
export function acceptedAt(
  dictionary: string[] | null,
  themed: string[],
  length: number
): Set<string> | null {
  if (!dictionary) return null;
  const out = new Set(dictionary.filter((w) => w.length === length));
  for (const word of themed) if (word.length === length) out.add(word);
  return out;
}

/** What a theme word is worth on top of what it would score anyway.
 *
 *  Flat rather than a multiplier, and five rather than three. A multiplier is
 *  invisible on the short words that make up most of a scramble — doubling a
 *  three-letter word is one point — and a flat bonus reads the same in every
 *  game that has a score. Five sits below the hive's pangram (+7) on purpose:
 *  finding the seven-letter word is still the bigger thing.
 */
export const THEME_BONUS = 5;

/** The day's words a board should accept on top of its dictionary.
 *
 *  Handed to the solver rather than checked at the door, so a themed word is
 *  only accepted if the board can actually make it — the rack has to spell it,
 *  the hive has to reach it, the grid has to trace it. The solver already
 *  answers that question for every other word, and asking it here as well is
 *  how the two halves come apart.
 *
 *  Null while the dictionary is still on its way, which the games already show
 *  as "still loading" rather than as a refusal.
 */
export function withThemed(dictionary: string[] | null, themed: string[]): string[] | null {
  if (!dictionary) return null;
  if (themed.length === 0) return dictionary;
  const known = new Set(dictionary);
  return [...dictionary, ...themed.filter((w) => !known.has(w))];
}
