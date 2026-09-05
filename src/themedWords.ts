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
