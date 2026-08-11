// The solver, on ciphers built here so the expected answer is known rather
// than guessed at. A small dictionary keeps the fixtures readable: the search
// is the thing under test, not the word list.
import { describe, expect, it } from 'vitest';
import { buildPatternIndex, patternOf, solveCryptogram } from '@/cryptogramSolver';

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
