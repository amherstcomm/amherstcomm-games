// Cryptogram generation: a passage from the curated pool under a substitution
// cipher. All the text work happened at harvest (scripts/cryptogram-harvest.mjs
// and the human review); this module only picks, enciphers, and decides what
// to give away.
//
// Difficulty is the reveal count and nothing else — the cipher is always a
// full substitution, and every difficulty draws from the same pool. Passage
// length as a second dial (the short proverbs the harvest floor cut) is
// recorded in the roadmap for later.

/** The passages that are in play: `review: true` is the human hold. */
export function livePassages(parsed) {
  return parsed.quotes.filter((q) => !q.review);
}

/** Which passage a given day gets, with no repeat inside a pool-sized window.
 *
 *  A fresh random pick per day would repeat on birthday-paradox time (weeks,
 *  at this pool size), and a stateless generator can't keep a ledger of what
 *  it already served. A permutation walk needs no ledger: days walk a shuffled
 *  order of the whole pool, so the first repeat arrives after poolSize days —
 *  seven years at 2,590 — and the next cycle reshuffles.
 *
 *  The caller seeds the rng from the CYCLE number, not the date: every day in
 *  a cycle must see the same permutation or the walk is just random picks
 *  again. Editing the pool re-deals the walk (the cycle length changes), which
 *  costs at worst an early repeat — acceptable for a list that changes rarely.
 */
export function cycleOf(position, poolSize) {
  return Math.floor(position / poolSize);
}

export function permutedIndex(cycleRng, poolSize, position) {
  const perm = [...Array(poolSize).keys()];
  for (let i = poolSize - 1; i > 0; i--) {
    const j = Math.floor(cycleRng() * (i + 1));
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  return perm[position % poolSize];
}

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz'.split('');

/** A substitution alphabet with no letter standing for itself. A fixed point
 *  is a free square the player never earned, and worse, an inconsistent one —
 *  some boards would have it and some wouldn't. Rejection sampling: shuffle
 *  until deranged, which takes e (~2.7) tries on average. */
export function makeCipher(rng) {
  for (;;) {
    const shuffled = [...ALPHABET];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    if (ALPHABET.every((c, i) => shuffled[i] !== c)) {
      const map = {};
      ALPHABET.forEach((c, i) => {
        map[c] = shuffled[i];
      });
      return map;
    }
  }
}

/** Letters become their cipher letter, uppercased — a cryptogram is case-blind
 *  and tradition prints the unsolved text in capitals. Everything that isn't a
 *  letter (spaces, punctuation, apostrophes) passes through, which is the
 *  word-boundaries-preserved variant the roadmap describes. */
export function encipher(text, cipher) {
  return text.replace(/[A-Za-z]/g, (c) => cipher[c.toLowerCase()].toUpperCase());
}

/** Which letters to give away: the most frequent letters of the passage,
 *  most-frequent first. Revealing 'e' hands the player the same first move a
 *  frequency table would suggest — traction, not the answer. Returned as
 *  { CIPHERLETTER: plainletter } so the client can mark the cells directly. */
export function revealsFor(text, cipher, count) {
  const freq = {};
  for (const c of text.toLowerCase()) {
    if (/[a-z]/.test(c)) freq[c] = (freq[c] ?? 0) + 1;
  }
  const byFrequency = Object.keys(freq).sort((a, b) => freq[b] - freq[a] || a.localeCompare(b));
  const out = {};
  for (const plain of byFrequency.slice(0, count)) {
    out[cipher[plain].toUpperCase()] = plain;
  }
  return out;
}

/** One board: the ciphertext the player sees, the reveals difficulty grants,
 *  and the answer riding along encoded for the reveal button — the passage and
 *  its attribution are both spoilers until then. */
export function generateCryptogram(passage, rng, revealCount) {
  const cipher = makeCipher(rng);
  return {
    ciphertext: encipher(passage.text, cipher),
    reveals: revealsFor(passage.text, cipher, revealCount),
    answer: Buffer.from(JSON.stringify({ text: passage.text, author: passage.author })).toString(
      'base64'
    ),
  };
}

/** reveal counts per difficulty: the whole of what difficulty means here */
export const CRYPTOGRAM_REVEALS = { easy: 3, hard: 1, extreme: 0 };
