// The Guess board as it is stored, and how to read one written by an older
// build.
//
// Out of the component because it is pure and because a rule that decides
// whether somebody's half-finished Wednesday survives a release deserves a
// test that can import it.
export type GameRecord = { answer: string; guesses: string[]; elapsedMs?: number }; // answer is base64

/** Accept a record written by an older build, which called the field `secret`.
 *
 *  It was never a secret. It is the answer to a word game, kept in the
 *  player's own browser, base64'd so it doesn't sit in plain sight in devtools
 *  — the player is not the adversary here, and there isn't one. The name was
 *  wrong enough that a static analyser read it as a credential and flagged the
 *  random pick that feeds it, which is a fair reading of the word and not of
 *  the thing.
 *
 *  Renamed while it was still cheap: this field crosses the wire in
 *  daily_progress, so a device on one build syncs boards to a device on
 *  another, and a rename after there are players to strand costs a
 *  write-both-read-either release and then a second one to drop it. Today it
 *  costs this function. */
export function asRecord(rec: unknown): GameRecord | undefined {
  if (!rec || typeof rec !== 'object') return undefined;
  const r = rec as { answer?: unknown; secret?: unknown; guesses?: unknown; elapsedMs?: unknown };
  const answer = typeof r.answer === 'string' ? r.answer : typeof r.secret === 'string' ? r.secret : '';
  if (!answer) return undefined;
  return {
    answer,
    guesses: Array.isArray(r.guesses) ? r.guesses.filter((g): g is string => typeof g === 'string') : [],
    ...(typeof r.elapsedMs === 'number' ? { elapsedMs: r.elapsedMs } : {}),
  };
}

/** Every record in a bag of them, normalised and with the unreadable dropped. */
export function asRecords(bag: unknown): Record<string, GameRecord> {
  if (!bag || typeof bag !== 'object') return {};
  const out: Record<string, GameRecord> = {};
  for (const [k, v] of Object.entries(bag as Record<string, unknown>)) {
    const rec = asRecord(v);
    if (rec) out[k] = rec;
  }
  return out;
}
