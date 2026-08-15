// Cryptogram generation: a passage from the curated pool under a substitution
// cipher. All the text work happened at harvest (scripts/cryptogram-harvest.mjs
// and the human review); this module picks, enciphers, and decides what to
// give away.
//
// Three separable dials, which is what lets one small pool of parts make a
// varied one of puzzles:
//
//   key         which slot each plaintext letter maps to — shift, affine,
//               keyword or random. All monoalphabetic, so the deduction is
//               always the same shape.
//   alphabet    what a slot looks like on the board. Letters, numbers, grid
//               coordinates, symbols — the player is solving for words, so
//               the cipher's own alphabet needn't be letters at all.
//   grouping    word divisions kept, or stripped into fives. Boundaries are
//               most of a solver's traction, so taking them away is the
//               single biggest difficulty lever we have.
//
// Everything here produces TOKENS rather than characters: a board is a list of
// strings, so "17" or "◆" is as ordinary as "K". That is the whole reason the
// alphabet dial exists.

// the day-to-day deal lives in walk.mjs, shared with the ladder
export { cycleOf, permutedIndex } from './walk.mjs';

/** The passages that are in play: `review: true` is the human hold.
 *
 *  Two bands, and they are separate pools rather than one pool with a
 *  preference. `standard` is 50-100 letters and is what easy and hard have
 *  always drawn from; `short` is 35-49, for extreme. A passage carries no
 *  `band` when it is standard, so the 2,674 entries curated before the short
 *  harvest need no rewriting — and, more to the point, the standard pool stays
 *  exactly the size it was, so the permutation walk deals easy and hard the
 *  same passages it did yesterday. */
export function livePassages(parsed, band = 'standard', blocked = null) {
  return parsed.quotes.filter(
    (q) =>
      !q.review &&
      (q.band ?? 'standard') === band &&
      !(blocked && (String(q.text ?? '').toLowerCase().match(/[a-z]+/g) ?? []).some((w) => blocked.has(w)))
  );
}

/** Which length band each difficulty plays.
 *
 *  Less text is less to work with: the frequency profile of forty letters is a
 *  poor likeness of English, and there are fewer repeated shapes to lever
 *  against. Measured on the harvest, a 35-49 letter passage admits a second
 *  common-word reading almost twice as often as a 50-100 one — which is why
 *  every short passage is put through scripts/cryptogram-guard.ts and only
 *  those with one answer are kept. Without that, extreme would be handing
 *  players a puzzle whose honest solution the answer check calls wrong. */
export const TIER_BAND = { easy: 'standard', hard: 'standard', extreme: 'short' };

const A = 'abcdefghijklmnopqrstuvwxyz'.split('');

// ---------------------------------------------------------------------------
// Keys: plaintext letter -> slot 0..25
// ---------------------------------------------------------------------------
// A key is only ever a permutation of the 26 slots. What differs between types
// is how much *structure* the permutation has, and therefore how much a solver
// gets for free once they spot it — a shift hands over all 26 letters from
// one, a keyword hands over the alphabetical tail, a random key hands over
// nothing.

const gcd = (a, b) => (b ? gcd(b, a % b) : a);

function shiftKey(rng) {
  // 1..25: a shift of 0 is the identity, which is no cipher at all
  const n = 1 + Math.floor(rng() * 25);
  return A.map((_, i) => (i + n) % 26);
}

function affineKey(rng) {
  const coprime = [3, 5, 7, 9, 11, 15, 17, 19, 21, 23, 25].filter((a) => gcd(a, 26) === 1);
  const a = coprime[Math.floor(rng() * coprime.length)];
  const b = Math.floor(rng() * 26);
  return A.map((_, i) => (a * i + b) % 26);
}

function keywordKey(rng) {
  // The structure that matters isn't that the head spells a word — nobody sees
  // it — it's that the tail runs in alphabetical order, so a partial solve
  // collapses the endgame. A random head of distinct letters gives exactly
  // that, without needing a dictionary in here.
  const head = [];
  const pool = [...A];
  const size = 5 + Math.floor(rng() * 4);
  for (let i = 0; i < size; i++) {
    head.push(...pool.splice(Math.floor(rng() * pool.length), 1));
  }
  const order = [...head, ...pool]; // pool is still alphabetical
  return A.map((_, i) => order.indexOf(A[i]));
}

function randomKey(rng) {
  const slots = [...Array(26).keys()];
  for (let i = slots.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [slots[i], slots[j]] = [slots[j], slots[i]];
  }
  return slots;
}

const KEYS = { shift: shiftKey, affine: affineKey, keyword: keywordKey, random: randomKey };

/** Build a key, rejecting any that leaves a letter standing for itself.
 *
 *  Only meaningful when the board shows letters: a fixed point there is a free
 *  square nobody earned, and an inconsistent one — some boards would have it
 *  and some wouldn't. Against numbers or symbols there is no "itself" to stand
 *  for, so the constraint doesn't apply and would only shrink the keyspace. */
export function makeKey(type, rng, lettersShown) {
  for (let attempt = 0; attempt < 200; attempt++) {
    const key = KEYS[type](rng);
    if (!lettersShown || key.every((slot, i) => slot !== i)) return key;
  }
  throw new Error(`could not build a deranged ${type} key`);
}

// ---------------------------------------------------------------------------
// Alphabets: slot 0..25 -> the token(s) shown on the board
// ---------------------------------------------------------------------------

// Named so a screen reader has something to say. Arbitrary glyphs read as
// nothing useful, and the board is unplayable by ear without these.
export const SYMBOL_NAMES = {
  '★': 'star', '☂': 'umbrella', '☀': 'sun', '☾': 'moon', '♠': 'spade',
  '♣': 'club', '♥': 'heart', '♦': 'diamond', '✦': 'sparkle', '✚': 'cross',
  '⌂': 'house', '☯': 'yin yang', '⚑': 'flag', '⚙': 'gear', '⚡': 'bolt',
  '✿': 'flower', '❄': 'snowflake', '❖': 'lozenge', '➤': 'arrow', '⬢': 'hexagon',
  '◐': 'half circle', '◫': 'window', '⌘': 'loop', '⍟': 'circled star',
  '♪': 'note', '⚓': 'anchor',
};
const SYMBOLS = Object.keys(SYMBOL_NAMES);

// English letter frequency, only accurate enough to decide how many tokens a
// homophonic cipher spends on each letter.
const FREQ = 'etaoinshrdlcumwfgypbvkjxqz';

function alphabetFor(kind, rng) {
  switch (kind) {
    case 'letters':
      return A.map((_, i) => [String.fromCharCode(65 + i)]);
    case 'digits':
      // a=1 through z=26, shifted by whatever the key does
      return A.map((_, i) => [String(i + 1)]);
    case 'coords': {
      // A 5x6 rectangle rather than the traditional 5x5 Polybius square: 30
      // cells covers 26 letters, so i and j stay separate. Merging them is
      // tradition, and it makes the plaintext unrecoverable — "jar" and "iar"
      // decode identically, which an exact check can't forgive.
      return A.map((_, i) => [`${Math.floor(i / 6) + 1}${(i % 6) + 1}`]);
    }
    case 'symbols':
      return A.map((_, i) => [SYMBOLS[i]]);
    case 'homophonic': {
      // Several numbers for each letter, more of them for the common ones, so
      // the frequency profile flattens out and counting stops being the way
      // in. Every token still means exactly one letter, so the board and the
      // check are unchanged — what goes is the rule that a letter can only be
      // used once.
      const out = A.map(() => []);
      let next = 1;
      for (const letter of FREQ) {
        const slot = letter.charCodeAt(0) - 97;
        const rank = FREQ.indexOf(letter);
        const count = rank < 6 ? 4 : rank < 12 ? 3 : rank < 18 ? 2 : 1;
        for (let k = 0; k < count; k++) out[slot].push(String(next++));
      }
      // deal them out of order, or the numbers themselves rank the letters
      const flat = out.flat();
      for (let i = flat.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [flat[i], flat[j]] = [flat[j], flat[i]];
      }
      let at = 0;
      return out.map((tokens) => tokens.map(() => flat[at++]));
    }
    default:
      throw new Error(`unknown alphabet ${kind}`);
  }
}

// ---------------------------------------------------------------------------
// The named variants, and which tier draws from which
// ---------------------------------------------------------------------------
// The board announces its type, which is the cryptogram tradition and the only
// thing that makes a pool worth having: an unannounced shift is just a
// substitution solved the slow way, and the variety is invisible.

export const VARIANTS = {
  shift: { label: 'Shift', key: 'shift', alphabet: 'letters', grouped: false, reveals: 3, band: 5 },
  affine: { label: 'Affine', key: 'affine', alphabet: 'letters', grouped: false, reveals: 3, band: 5 },
  numbers: { label: 'Numbers', key: 'shift', alphabet: 'digits', grouped: false, reveals: 3, band: 5 },
  keyword: { label: 'Keyword', key: 'keyword', alphabet: 'letters', grouped: false, reveals: 1, band: 3 },
  mixed: { label: 'Mixed', key: 'random', alphabet: 'letters', grouped: false, reveals: 1, band: 3 },
  symbols: { label: 'Symbols', key: 'random', alphabet: 'symbols', grouped: false, reveals: 1, band: 3 },
  keywordGrouped: {
    label: 'Keyword, grouped',
    key: 'keyword',
    alphabet: 'letters',
    grouped: true,
    reveals: 0,
  },
  mixedGrouped: {
    label: 'Mixed, grouped',
    key: 'random',
    alphabet: 'letters',
    grouped: true,
    reveals: 0,
  },
  polybius: { label: 'Polybius', key: 'random', alphabet: 'coords', grouped: false, reveals: 0 },
  homophonic: {
    label: 'Homophonic',
    key: 'random',
    alphabet: 'homophonic',
    grouped: false,
    reveals: 0,
  },
};

// Easy always leaves a shortcut in the key; hard takes the shortcut away;
// extreme takes the word boundaries or the frequency profile as well.
export const TIER_VARIANTS = {
  easy: ['shift', 'affine', 'numbers'],
  hard: ['keyword', 'mixed', 'symbols'],
  extreme: ['mixedGrouped', 'keywordGrouped', 'polybius', 'homophonic'],
};

// ---------------------------------------------------------------------------
// Enciphering
// ---------------------------------------------------------------------------

/** Which tokens to give away: frequent letters of this passage, so a reveal is
 *  the opening a frequency table would suggest rather than the answer.
 *
 *  Drawn from a band rather than taken straight off the top. Handing over
 *  exactly the three commonest letters every time means every easy board opens
 *  the same way, and it tells a regular player something extra: that anything
 *  unrevealed is *not* top-three. Picking three of the top five leaves the help
 *  comparable while making the opening different day to day, and leaves that
 *  inference unavailable.
 *
 *  Homophonic boards reveal nothing — one of four tokens for 'e' would be a
 *  hint about the cipher rather than about the passage. */
function revealsFor(text, tokenFor, count, band, rng) {
  const freq = {};
  for (const c of text.toLowerCase()) if (/[a-z]/.test(c)) freq[c] = (freq[c] ?? 0) + 1;
  const byFrequency = Object.keys(freq).sort((a, b) => freq[b] - freq[a] || a.localeCompare(b));
  const pool = byFrequency.slice(0, Math.max(band, count));
  // shuffle the band, then take from the front
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const out = {};
  for (const plain of pool.slice(0, count)) {
    const tokens = tokenFor(plain);
    if (tokens.length === 1) out[tokens[0]] = plain;
  }
  return out;
}

/** The share of distinct marks that appear more than once.
 *
 *  Repetition is what a solver grips. Where one mark means one letter this is
 *  a property of the passage and the harvest already guarantees it — measured
 *  across the pools, every such cipher bottoms out at 55% on the standard band
 *  and 47% on the short one. Homophonic is the exception, because it spends
 *  several marks on the same letter: it can put 37 letters onto 25 marks with
 *  only 7 of them repeating, which leaves frequency saying nothing and word
 *  shapes lying, since a shape only holds when a mark means one letter. */
export function markRepetition(board) {
  const alphabet = new Set(board.alphabet);
  const counts = new Map();
  for (const t of board.tokens) if (alphabet.has(t)) counts.set(t, (counts.get(t) ?? 0) + 1);
  const seen = [...counts.values()];
  return seen.length ? seen.filter((v) => v > 1).length / seen.length : 0;
}

/** Below this a board is not hard, it is arbitrary. Set where it is because
 *  every cipher other than homophonic clears it always, at both bands, so the
 *  floor only ever bites the one that can fail. */
export const REPETITION_FLOOR = 0.4;
const REDEALS = 8;

/** A board with something to grip, or null if this passage and cipher cannot
 *  make one.
 *
 *  Homophonic picks which of a letter's marks to spend on each occurrence, so
 *  a thin board is usually an unlucky deal rather than a doomed pairing —
 *  re-dealing fixes 141 of the 143 short passages that fail at first ask, 93
 *  of them on the first retry. Retrying keeps the cipher the day announced,
 *  which switching ciphers would not. A board that passes first time consumes
 *  the generator exactly as it did before this existed, so nothing that was
 *  already playable changes. */
export function generatePlayable(passage, rng, variantName) {
  let best = null;
  for (let attempt = 0; attempt <= REDEALS; attempt++) {
    const board = generateCryptogram(passage, rng, variantName);
    const grip = markRepetition(board);
    if (grip >= REPETITION_FLOOR) return board;
    if (!best || grip > best.grip) best = { board, grip };
    // only homophonic re-deals differently; anything else would loop for nothing
    if (!board.homophonic) break;
  }
  return null;
}

/** One board. `tokens` is what the player sees, one entry per position:
 *  cipher tokens for letters, and the punctuation itself where the passage had
 *  punctuation — except on a grouped board, which keeps only the letters. */
export function generateCryptogram(passage, rng, variantName) {
  const v = VARIANTS[variantName];
  const lettersShown = v.alphabet === 'letters';
  const key = makeKey(v.key, rng, lettersShown);
  const alphabet = alphabetFor(v.alphabet, rng);
  const tokensFor = (plain) => alphabet[key[plain.charCodeAt(0) - 97]];

  const tokens = [];
  for (const ch of passage.text) {
    if (/[A-Za-z]/.test(ch)) {
      const choices = tokensFor(ch.toLowerCase());
      // homophonic spends a different token on each occurrence; everything
      // else has exactly one to spend
      tokens.push(choices[Math.floor(rng() * choices.length)]);
    } else if (!v.grouped) {
      tokens.push(ch);
    }
  }

  return {
    type: variantName,
    label: v.label,
    grouped: v.grouped,
    // the one rule the board relaxes: several tokens may mean the same letter
    homophonic: v.alphabet === 'homophonic',
    tokens,
    // Which tokens are the cipher's, so a reader can tell them from the
    // passage's own punctuation. With letters or numbers that's inferable;
    // with symbols it is not — "★" and "," are both one non-alphanumeric
    // character, and nothing else in the payload separates them. It also
    // gives the board something to list as still-unassigned, which is what
    // the A-Z strip does for a letter cipher.
    alphabet: [...new Set(alphabet.flat())].sort(),
    reveals:
      v.alphabet === 'homophonic'
        ? {}
        : revealsFor(passage.text, tokensFor, v.reveals, v.band ?? v.reveals, rng),
    answer: Buffer.from(JSON.stringify({ text: passage.text, author: passage.author })).toString(
      'base64'
    ),
  };
}
