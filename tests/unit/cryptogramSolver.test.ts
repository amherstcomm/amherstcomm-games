// The solver, on ciphers built here so the expected answer is known rather
// than guessed at. A small dictionary keeps the fixtures readable: the search
// is the thing under test, not the word list.
import { describe, expect, it } from 'vitest';
import {
  analyse,
  buildPatternIndex,
  hunches,
  parseCryptogram,
  patternOf,
  solveCryptogram,
} from '@/cryptogramSolver';

const WORDS = [
  'the', 'quick', 'brown', 'fox', 'jumps', 'over', 'lazy', 'dog',
  'happy', 'motto', 'time', 'flies', 'when', 'you', 'are', 'having', 'fun',
  'a', 'i', 'and', 'but', 'not', 'was', 'his', 'her', 'that', 'this',
];

const index = buildPatternIndex(WORDS);

/** encipher with a shift, which is a substitution like any other */
function shift(text: string, by: number): string {
  return text.replace(/[a-z]/g, (c) =>
    String.fromCharCode(((c.charCodeAt(0) - 97 + by) % 26) + 97)
  );
}

describe('patternOf', () => {
  it('gives words with the same shape the same key', () => {
    expect(patternOf('happy')).toBe(patternOf('sorry'));
    expect(patternOf('the')).not.toBe(patternOf('tee'));
  });

  it('counts every repeat, not just the doubled pair', () => {
    // 'motto' repeats its o as well as its t, so it is not 'happy' shaped —
    // the near-miss worth having a test for, since it is the whole reason a
    // candidate list is small
    expect(patternOf('motto')).not.toBe(patternOf('happy'));
  });

  it('is about repetition, not letters', () => {
    expect(patternOf('abc')).toBe('0,1,2');
    expect(patternOf('aab')).toBe('0,0,1');
  });
});

describe('patternOf on tokens', () => {
  it('asks the same question of numbers as of letters', () => {
    // "17 42 42" has the shape of "see", so a board marked in numbers can be
    // looked up in exactly the same index
    expect(patternOf(['17', '42', '42'])).toBe(patternOf('see'));
    expect(patternOf(['17', '4', '17'])).toBe(patternOf('aba'));
    // two distinct marks are two distinct marks however they are written, so
    // these share a shape — it's the word key that has to keep them apart,
    // which is why analyse joins tokens with a separator
    expect(patternOf(['1', '74'])).toBe(patternOf(['17', '4']));
  });
});

describe('parseCryptogram', () => {
  it('reads a newspaper cryptogram a letter at a time', () => {
    expect(parseCryptogram('WKH TXLFN!', 'letters')).toEqual([
      ['w', 'k', 'h'],
      ['t', 'x', 'l', 'f', 'n'],
    ]);
  });

  it('reads multi-character marks, with the slash dividing words', () => {
    expect(parseCryptogram('17 42 42 / 8 9', 'tokens')).toEqual([
      ['17', '42', '42'],
      ['8', '9'],
    ]);
  });
});

describe('analyse', () => {
  it('deduces the letters a single candidate forces, and stops there', () => {
    // 'having' is the only word of its shape in the dictionary, so every one
    // of its letters is settled without any guessing
    const words = parseCryptogram('ODULQJ', 'letters');
    const out = analyse(words, index);
    expect(out.contradiction).toBe(false);
    expect(out.words[0].candidates).toEqual(['having']);
    expect(out.mapping.o).toBe('h');
    expect(out.mapping.j).toBe('g');
  });

  it('offers the choice rather than picking, when the shape allows several', () => {
    const out = analyse(parseCryptogram('ABC', 'letters'), index);
    expect(out.words[0].candidates.length).toBeGreaterThan(1);
    // nothing forced, because nothing is proven
    expect(Object.keys(out.mapping)).toHaveLength(0);
  });

  it('takes a pinned letter and narrows everything by it', () => {
    const words = parseCryptogram('ABC', 'letters');
    const loose = analyse(words, index).words[0].candidates.length;
    const tight = analyse(words, index, { a: 't' }).words[0].candidates;
    expect(tight.length).toBeLessThan(loose);
    for (const w of tight) expect(w[0]).toBe('t');
  });

  it('reports a contradiction rather than an empty answer', () => {
    // nothing of that shape can start with both t and q
    const out = analyse(parseCryptogram('ABC', 'letters'), index, { a: 'q', b: 'q' });
    expect(out.contradiction).toBe(true);
  });

  it('works the same on a board marked in numbers', () => {
    const out = analyse(parseCryptogram('15 1 22 9 13 7', 'tokens'), index);
    expect(out.words[0].candidates).toEqual(['having']);
    expect(out.mapping['15']).toBe('h');
  });
});

describe('hunches', () => {
  it('names what a mark probably means when nothing forces it', () => {
    // 'abc' has several readings in this dictionary, so nothing is settled —
    // but the surviving readings still lean somewhere
    const out = hunches(analyse(parseCryptogram('ABC', 'letters'), index));
    expect(out.length).toBeGreaterThan(0);
    for (const h of out) {
      expect(h.plain).toMatch(/^[a-z]$/);
      expect(h.share).toBeGreaterThan(0);
      expect(h.share).toBeLessThanOrEqual(1);
    }
  });

  it('says nothing about a mark already settled — a guess there is noise', () => {
    // 'having' is the only word of its shape, so every mark in it is proven
    const out = hunches(analyse(parseCryptogram('ODULQJ', 'letters'), index));
    expect(out).toEqual([]);
  });

  it('reports a coin flip as a coin flip', () => {
    // pinning f leaves 'fox' and 'fun', which disagree about both remaining
    // marks — 0.5 is the honest number, and a solver that rounded it up to a
    // confident guess would be the thing this whole design avoids
    const out = hunches(analyse(parseCryptogram('ABC', 'letters'), index, { a: 'f' }));
    expect(out.length).toBe(2);
    for (const h of out) expect(h.share).toBe(0.5);
  });

  it('goes quiet where deduction has already done the work', () => {
    // two pins leave only 'fox', so propagation settles the last mark outright
    // — and a hunch about a proven letter would be noise dressed as evidence.
    // The two halves never speak at once.
    const settled = analyse(parseCryptogram('ABC', 'letters'), index, { a: 'f', b: 'o' });
    expect(settled.mapping.c).toBe('x');
    expect(hunches(settled)).toEqual([]);
  });

  it('sorts the surest first, since that is the one worth acting on', () => {
    const out = hunches(analyse(parseCryptogram('ABC DEF', 'letters'), index));
    const shares = out.map((h) => h.share);
    expect([...shares].sort((a, b) => b - a)).toEqual(shares);
  });
});

describe('solveCryptogram', () => {
  it('cracks a passage back to its plaintext', () => {
    const plain = 'time flies when you are having fun';
    const out = solveCryptogram(shift(plain, 7), index);
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.result.text).toBe(plain);
  });

  it('keeps the punctuation and spacing it was given', () => {
    const out = solveCryptogram(shift('the quick brown fox, and that dog!', 3), index);
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.result.text).toBe('the quick brown fox, and that dog!');
  });

  it('reports an alphabet that explains the text it returned', () => {
    // Not "the alphabet we enciphered with": a short passage against a small
    // dictionary genuinely has more than one consistent reading, and the
    // solver owes us a coherent answer rather than our answer. What it must
    // never do is hand back a mapping that doesn't produce its own text.
    const cipher = shift('the lazy dog', 1);
    const out = solveCryptogram(cipher, index);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const applied = cipher.replace(/[a-z]/g, (c) => out.result.mapping[c] ?? c);
    expect(applied).toBe(out.result.text);
  });

  it('says so when the passage has no word divisions to match on', () => {
    const out = solveCryptogram(shift('timeflieswhenyouarehavingfun', 4), index);
    expect(out).toEqual({ ok: false, reason: 'no divisions' });
  });

  it('says so when nothing was typed', () => {
    expect(solveCryptogram('   ...  ', index)).toEqual({ ok: false, reason: 'no words' });
  });

  it('fails honestly on words the dictionary has never seen', () => {
    const out = solveCryptogram(shift('zzz qqq', 5), index);
    expect(out.ok).toBe(false);
  });
});
