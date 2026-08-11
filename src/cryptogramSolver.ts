// Cracking a substitution cipher from the shape of its words.
//
// This is Guess's solver generalised: there, one word is narrowed by its known
// letters; here, twenty words are narrowed by each other. A cipher word can
// only stand for a dictionary word of the same *pattern* — HAPPY and MOTTO
// share the shape (first, second, third, third, fourth) — so each word starts
// with a candidate list, and choosing one for any word constrains every other
// word that shares a letter with it. Backtracking over those lists finds the
// assignment where all of them agree at once.
//
// Word divisions are load-bearing. Without them there are no word shapes to
// match, and cracking the cipher needs frequency hill-climbing instead — a
// different program, and one that fails often enough to be a poor promise.
// `solveCryptogram` says so rather than pretending.

/** A word's shape, with the letters thrown away: 'happy' and 'motto' both
 *  become 0,1,2,2,3. Two words can stand for each other only if these match. */
export function patternOf(word: string): string {
  const seen = new Map<string, number>();
  const out: number[] = [];
  for (const c of word) {
    if (!seen.has(c)) seen.set(c, seen.size);
    out.push(seen.get(c)!);
  }
  return out.join(',');
}

/** Dictionary words grouped by shape. Built once per word list and reused —
 *  it costs a pass over the whole dictionary, which is worth paying only if
 *  the answer gets looked up more than once.
 *
 *  `common` decides what each bucket offers first, and it matters more than it
 *  looks. Pattern matching alone asks only "is every word a word", and against
 *  a hundred thousand of them a passage often has a second reading where every
 *  word is real and the whole is nonsense. Trying ordinary words before
 *  obscure ones makes the first answer found the likely one rather than
 *  merely a legal one. */
export function buildPatternIndex(words: string[], common?: Set<string>): Map<string, string[]> {
  const index = new Map<string, string[]>();
  for (const w of words) {
    const key = patternOf(w);
    const bucket = index.get(key);
    if (bucket) bucket.push(w);
    else index.set(key, [w]);
  }
  if (common) {
    for (const bucket of index.values()) {
      bucket.sort((a, b) => Number(common.has(b)) - Number(common.has(a)));
    }
  }
  return index;
}

export type Cracked = {
  /** cipher letter -> plaintext letter, for the letters that appear */
  mapping: Record<string, string>;
  /** the passage, with the original punctuation and spacing kept */
  text: string;
};

export type SolveOutcome =
  | { ok: true; result: Cracked }
  | { ok: false; reason: 'no words' | 'no divisions' | 'not found' | 'gave up' };

// Tuned against the published boards: the ones that come out at all come out
// in a few milliseconds, and the only board that hit the old 400,000 spent
// five seconds before admitting defeat. A solver that gives up in well under a
// second is worth more than one that might answer eventually.
const NODE_BUDGET = 60_000;

/**
 * @param ciphertext what the board shows — case and punctuation are kept for
 *                   the answer, but only letters take part in the search
 * @param index      dictionary grouped by pattern, from buildPatternIndex
 */
export function solveCryptogram(ciphertext: string, index: Map<string, string[]>): SolveOutcome {
  const raw = ciphertext.toLowerCase();
  const cipherWords = [...new Set(raw.match(/[a-z]+/g) ?? [])];
  if (!cipherWords.length) return { ok: false, reason: 'no words' };

  // One long run of letters is a passage with its spaces taken out, not a
  // word. Twelve is past the longest thing anyone writes and well short of
  // the shortest grouped passage.
  if (cipherWords.every((w) => w.length > 12)) return { ok: false, reason: 'no divisions' };

  // Fewest candidates first. A six-letter word with one possible reading
  // settles half the alphabet before a three-letter word has narrowed
  // anything, and trying them in that order is most of what makes this fast.
  const candidates = new Map<string, string[]>();
  for (const w of cipherWords) {
    candidates.set(w, index.get(patternOf(w)) ?? []);
  }
  const order = [...cipherWords].sort(
    (a, b) => (candidates.get(a)!.length || Infinity) - (candidates.get(b)!.length || Infinity)
  );

  const toPlain: Record<string, string> = {};
  const toCipher: Record<string, string> = {};
  let nodes = 0;
  let gaveUp = false;

  /** Can this cipher word read as this dictionary word, given what's fixed? */
  function fits(cipher: string, plain: string): boolean {
    for (let i = 0; i < cipher.length; i++) {
      const c = cipher[i];
      const p = plain[i];
      if (toPlain[c] !== undefined && toPlain[c] !== p) return false;
      if (toCipher[p] !== undefined && toCipher[p] !== c) return false;
    }
    return true;
  }

  function place(depth: number): boolean {
    if (depth === order.length) return true;
    if (++nodes > NODE_BUDGET) {
      gaveUp = true;
      return false;
    }
    const cipher = order[depth];
    for (const plain of candidates.get(cipher)!) {
      if (!fits(cipher, plain)) continue;
      // remember only what this word actually adds, so undoing is exact
      const added: string[] = [];
      for (let i = 0; i < cipher.length; i++) {
        if (toPlain[cipher[i]] === undefined) {
          toPlain[cipher[i]] = plain[i];
          toCipher[plain[i]] = cipher[i];
          added.push(cipher[i]);
        }
      }
      if (place(depth + 1)) return true;
      for (const c of added) {
        delete toCipher[toPlain[c]];
        delete toPlain[c];
      }
      if (gaveUp) return false;
    }
    return false;
  }

  if (!place(0)) return { ok: false, reason: gaveUp ? 'gave up' : 'not found' };

  const text = ciphertext.replace(/[A-Za-z]/g, (c) => {
    const plain = toPlain[c.toLowerCase()];
    if (!plain) return c;
    // a capital in the ciphertext is the cipher's own shouting, not the
    // passage's, so the answer comes back in lower case throughout
    return plain;
  });

  return { ok: true, result: { mapping: { ...toPlain }, text } };
}
