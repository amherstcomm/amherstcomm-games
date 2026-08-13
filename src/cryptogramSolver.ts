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
export function patternOf(word: string | string[]): string {
  // A string is walked a character at a time and an array a token at a time,
  // which is the same question asked of a dictionary word and of a board
  // marked in numbers: "17 42 42" has the shape of "see".
  const seen = new Map<string, number>();
  const out: number[] = [];
  for (const unit of word) {
    if (!seen.has(unit)) seen.set(unit, seen.size);
    out.push(seen.get(unit)!);
  }
  return out.join(',');
}

/** Dictionary words grouped by shape. Built once per word list and reused —
 *  it costs a pass over the whole dictionary, which is worth paying only if
 *  the answer gets looked up more than once.
 *
 *  `common` decides what each bucket offers first, and it matters more than it
 *  looks: a list of ten readings is only useful if they are the ten a person
 *  would consider.
 *
 *  It is also weaker than it sounds, which is worth knowing before trusting
 *  it. Membership of the common tier is nearly forty thousand words, so `dye`,
 *  `ego` and `era` all pass it and the sort barely discriminates. The word
 *  files themselves are ordered by SCOWL band, which is roughly frequency
 *  order and sorts far better — so a list that arrives alphabetised has
 *  already lost the signal this cannot put back. Ranking properly wants a
 *  frequency-ordered list, not a membership test. */
export function buildPatternIndex(
  words: string[],
  rank?: Map<string, number>
): Map<string, string[]> {
  const index = new Map<string, string[]>();
  for (const w of words) {
    const key = patternOf(w);
    const bucket = index.get(key);
    if (bucket) bucket.push(w);
    else index.set(key, [w]);
  }
  if (rank) {
    // commonest band first, alphabetical inside a band so the order is stable
    for (const bucket of index.values()) {
      bucket.sort(
        (a, b) => (rank.get(a) ?? 99) - (rank.get(b) ?? 99) || (a < b ? -1 : a > b ? 1 : 0)
      );
    }
  }
  return index;
}

// ---------------------------------------------------------------------------
// Reading a pasted cryptogram
// ---------------------------------------------------------------------------
// Any cipher, not just ours, and any alphabet, not just letters. A board can
// be marked in letters, numbers, grid coordinates or symbols, so the solver
// takes tokens and only needs to know where one ends.

export type InputMode = 'letters' | 'tokens';

/** Cipher words, each a list of tokens.
 *
 *  In `letters` mode every letter is its own token and anything else divides
 *  words, which is how a newspaper cryptogram is written. In `tokens` mode the
 *  marks are multi-character — 17, 42, a glyph — so they're separated by
 *  spaces and the words by a slash, since nothing about "17 42" says whether
 *  that is one word or two. */
export function parseCryptogram(input: string, mode: InputMode): string[][] {
  if (mode === 'letters') {
    // Contractions stay whole. Splitting "SOI'N" into "soi" and "n" invents a
    // one-letter word, and a one-letter word can only be "a" or "i" — so the
    // mark standing for T gets forced to a vowel, and every "the" on the board
    // stops being readable. The apostrophe rides along as a token and
    // `analyse` leaves such words alone rather than trusting a dictionary that
    // has no contractions in it.
    return (input.toLowerCase().match(/[a-z]+(?:'[a-z]+)*/g) ?? []).map((w) => [...w]);
  }
  return input
    .split(/[/\n]+/)
    .map((word) => word.split(/[\s,]+/).filter(Boolean))
    .filter((w) => w.length);
}

/** Every reading still open for each word, and every letter already forced.
 *
 *  This is propagation rather than search: a word whose candidate list has
 *  come down to one is settled, its letters go into the mapping, and every
 *  other list is filtered again — repeat until nothing more falls out. It
 *  cannot guess, so it cannot be wrong; where it stops is exactly what the
 *  word shapes are able to prove. */
export type Analysis = {
  /** the distinct cipher words, in the order first seen */
  words: { tokens: string[]; candidates: string[] }[];
  /** cipher token -> plaintext letter, forced or pinned by hand */
  mapping: Record<string, string>;
  /** a word whose candidates all died: the pins can't all be true */
  contradiction: boolean;
};

export function analyse(
  words: string[][],
  index: Map<string, string[]>,
  pinned: Record<string, string> = {}
): Analysis {
  const mapping: Record<string, string> = { ...pinned };
  const distinct = new Map<string, string[]>();
  // keyed with a separator: "1 74" and "17 4" are different words, and
  // joining them bare would make them the same key
  for (const w of words) distinct.set(w.join(' '), w);

  const readable = (tokens: string[], plain: string): boolean => {
    if (tokens.length !== plain.length) return false;
    const local: Record<string, string> = {};
    const used: Record<string, string> = {};
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      const p = plain[i];
      const fixed = mapping[t] ?? local[t];
      if (fixed !== undefined && fixed !== p) return false;
      const owner = used[p];
      if (owner !== undefined && owner !== t) return false;
      local[t] = p;
      used[p] = t;
    }
    // a letter already spoken for elsewhere can't be borrowed here
    for (const [t, p] of Object.entries(local)) {
      for (const [ot, op] of Object.entries(mapping)) {
        if (op === p && ot !== t) return false;
      }
    }
    return true;
  };

  let contradiction = false;

  // Words we can say nothing about, which contribute no constraint rather
  // than a false one — the marks inside them still get solved by their
  // neighbours. Two kinds:
  //
  //   contractions, because the dictionary holds no apostrophes; and
  //   anything the dictionary simply doesn't have.
  //
  // The second matters because this searches a *common* word list. A short
  // list is the whole point — against a hundred thousand words a three-letter
  // shape offers dye, ecu and ego, which is noise wearing the costume of a
  // choice — but it means a passage using an uncommon word would otherwise
  // come back "no reading fits" and take the rest of the board down with it.
  // Absent from the list is not the same as impossible.
  const mute = new Set<string>();
  const lists = new Map<string, string[]>();
  for (const [key, tokens] of distinct) {
    const shaped = index.get(patternOf(tokens)) ?? [];
    if (tokens.includes("'") || !shaped.length) {
      mute.add(key);
      lists.set(key, []);
    } else {
      lists.set(key, shaped.filter((w) => readable(tokens, w)));
    }
  }

  // Arc consistency, rather than "wait for a word to collapse to one reading".
  //
  // Waiting is the shallow version and it deduces almost nothing: a word has
  // to be uniquely shaped before it says anything at all. The pruning that
  // matters is between words. Every mark has a set of letters it could be —
  // gathered from the surviving readings of each word it appears in, and
  // *intersected* across those words, because the mark has to be one letter in
  // all of them at once. "K is e or a here, a or o there" leaves a, proven,
  // with no word having collapsed. Then readings using a letter no longer
  // possible at their position die, which shrinks the sets again, and round it
  // goes until nothing moves.
  //
  // It only ever removes the impossible, so the contract holds: it still
  // cannot be wrong, it can only stop early.
  for (let pass = 0; pass < 40; pass++) {
    let changed = false;

    // what each mark could still be, intersected over every word using it
    const possible = new Map<string, Set<string>>();
    for (const [key, tokens] of distinct) {
      if (mute.has(key)) continue;
      const cands = lists.get(key)!;
      tokens.forEach((t, i) => {
        const here = new Set<string>();
        for (const c of cands) here.add(c[i]);
        const known = possible.get(t);
        if (!known) possible.set(t, here);
        else for (const letter of [...known]) if (!here.has(letter)) known.delete(letter);
      });
    }
    for (const [t, letter] of Object.entries(mapping)) possible.set(t, new Set([letter]));

    // a mark with one letter left is proven, not chosen
    for (const [t, set] of possible) {
      if (set.size === 0) contradiction = true;
      if (set.size === 1) {
        const only = [...set][0];
        if (mapping[t] !== only) {
          mapping[t] = only;
          changed = true;
        }
      }
    }

    // the cipher is a bijection, so a letter spoken for belongs to no one else
    for (const [t, letter] of Object.entries(mapping)) {
      for (const [other, set] of possible) {
        if (other !== t && set.delete(letter)) changed = true;
      }
    }

    // drop readings that need a letter their mark can no longer be
    for (const [key, tokens] of distinct) {
      if (mute.has(key)) continue;
      const before = lists.get(key)!;
      const after = before.filter((c) => tokens.every((t, i) => possible.get(t)?.has(c[i])));
      if (after.length !== before.length) {
        lists.set(key, after);
        changed = true;
      }
      if (!after.length) contradiction = true;
    }

    if (!changed) break;
  }

  return {
    words: [...distinct].map(([key, tokens]) => ({ tokens, candidates: lists.get(key) ?? [] })),
    mapping,
    contradiction,
  };
}

/** A mark the shapes can't settle, and what it probably stands for. */
export type Hunch = { token: string; plain: string; share: number };

/** What each unsettled mark most likely means, counted off the readings that
 *  are still alive.
 *
 *  Not a frequency table. The classic move — commonest mark is 'e', then 't' —
 *  is about English in general, and a sixty-letter passage deviates from
 *  English in general quite happily. This counts instead over the candidate
 *  lists propagation already produced: for every word a mark appears in, and
 *  every reading still standing for that word, tally the letter sitting at
 *  that position. That is evidence from this puzzle's own shapes and this
 *  dictionary, and it sharpens on its own as picks narrow the lists.
 *
 *  A guess even so, and kept separate from `mapping` for exactly that reason:
 *  what makes the rest of this solver worth trusting is that a blank means
 *  genuinely unknown.
 *
 *  Two things decide how much a reading counts, and both were measured over
 *  150 generated boards at their opening move rather than guessed.
 *
 *  Each *word* gets one vote, split across its readings. It used to be each
 *  reading that got a vote, which made a word's influence its candidate count
 *  — so a three-letter shape with three thousand readings drowned out a nine
 *  letter one with four, having said far less. Skipping any word over four
 *  hundred readings kept that from being a disaster, at the price of most of
 *  the board saying nothing at all: the solver was silent on half of boards.
 *
 *  And a word's vote is split by how ordinary each reading is, not evenly. A
 *  shape matching both `the` and `dye` is mostly evidence for `the`. Splitting
 *  it evenly is what a membership test does — the common tier holds forty
 *  thousand words and `dye` is one of them — so the split follows the SCOWL
 *  band instead, which is roughly frequency order.
 *
 *  Together: the solver now speaks on 63% of boards rather than 51%, and what
 *  it says is right 86% of the time rather than 78%. Confidence tracks
 *  accuracy closely enough to act on — 50-60% is right 67% of the time, above
 *  80% is right 92%.
 */
export function hunches(analysis: Analysis, rank?: Map<string, number>): Hunch[] {
  const tally = new Map<string, Map<string, number>>();

  for (const { tokens, candidates } of analysis.words) {
    if (!candidates.length) continue;
    // One vote per word, so volume cannot stand in for evidence, split by how
    // ordinary each reading is. Squared because the bands are coarse — six of
    // them over a quarter million words — and a linear split left the tail
    // with more say than it has earned.
    const weights = candidates.map((w) => 1 / (1 + (rank?.get(w) ?? 5)) ** 2);
    const total = weights.reduce((a, b) => a + b, 0) || 1;

    candidates.forEach((reading, ri) => {
      const weight = weights[ri] / total;
      tokens.forEach((t, i) => {
        if (analysis.mapping[t] !== undefined) return; // already settled
        const forToken = tally.get(t) ?? new Map<string, number>();
        forToken.set(reading[i], (forToken.get(reading[i]) ?? 0) + weight);
        tally.set(t, forToken);
      });
    });
  }

  const out: Hunch[] = [];
  for (const [token, letters] of tally) {
    let total = 0;
    for (const n of letters.values()) total += n;
    let best = '';
    let bestN = 0;
    for (const [letter, n] of letters) {
      if (n > bestN) {
        best = letter;
        bestN = n;
      }
    }
    if (best && total > 0) out.push({ token, plain: best, share: bestN / total });
  }
  // strongest first: the mark we are surest about is the one worth acting on
  return out.sort((a, b) => b.share - a.share);
}

export type Cracked = {
  /** cipher letter -> plaintext letter, for the letters that appear */
  mapping: Record<string, string>;
  /** the passage, with the original punctuation and spacing kept */
  text: string;
  /** how many complete readings were found before the search stopped, so the
   *  answer can say whether it was the only one or the pick of several */
  readings: number;
};

export type SolveOutcome =
  | { ok: true; result: Cracked }
  | { ok: false; reason: 'no words' | 'no divisions' | 'not found' | 'gave up' };

// Tuned against the published boards: the ones that come out at all come out
// in a few milliseconds, and the only board that hit the old 400,000 spent
// five seconds before admitting defeat. A solver that gives up in well under a
// second is worth more than one that might answer eventually.
const NODE_BUDGET = 60_000;
// Enough readings to have something to choose between without letting a very
// ambiguous passage run away. The best is almost always in the first handful.
const READING_CAP = 300;

/**
 * @param ciphertext what the board shows — case and punctuation are kept for
 *                   the answer, but only letters take part in the search
 * @param index      dictionary grouped by pattern, from buildPatternIndex
 */
export function solveCryptogram(
  ciphertext: string,
  index: Map<string, string[]>,
  common?: Set<string>
): SolveOutcome {
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

  // Every word being a word is a weak test: a long passage often has a second
  // reading that passes it and means nothing. So the search doesn't stop at
  // the first one — it keeps going and weighs what it finds. A reading built
  // from ordinary words beats one that needs obscure ones, which is the
  // difference the first-answer version couldn't see.
  //
  // Longer words count for more. Agreeing on a nine-letter word is far more
  // evidence than agreeing on "an", and the rare-word penalty is flat so one
  // oddity doesn't sink an otherwise ordinary reading.
  function scoreOf(): number {
    if (!common) return 0;
    let score = 0;
    for (const cipher of order) {
      let plain = '';
      for (const c of cipher) plain += toPlain[c];
      score += common.has(plain) ? plain.length : -2;
    }
    return score;
  }

  let best: { mapping: Record<string, string>; score: number } | null = null;
  let readings = 0;

  function place(depth: number): void {
    if (depth === order.length) {
      readings++;
      const score = scoreOf();
      if (!best || score > best.score) best = { mapping: { ...toPlain }, score };
      return;
    }
    if (++nodes > NODE_BUDGET) {
      gaveUp = true;
      return;
    }
    const cipher = order[depth];
    for (const plain of candidates.get(cipher)!) {
      if (gaveUp || readings >= READING_CAP) return;
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
      place(depth + 1);
      for (const c of added) {
        delete toCipher[toPlain[c]];
        delete toPlain[c];
      }
    }
  }

  place(0);
  if (!best) return { ok: false, reason: gaveUp ? 'gave up' : 'not found' };
  // the winner, rather than whatever the mapping happened to hold when the
  // search unwound
  Object.assign(toPlain, (best as { mapping: Record<string, string> }).mapping);

  const text = ciphertext.replace(/[A-Za-z]/g, (c) => {
    const plain = toPlain[c.toLowerCase()];
    if (!plain) return c;
    // a capital in the ciphertext is the cipher's own shouting, not the
    // passage's, so the answer comes back in lower case throughout
    return plain;
  });

  return { ok: true, result: { mapping: { ...toPlain }, text, readings } };
}
