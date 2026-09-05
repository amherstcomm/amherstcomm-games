// What the on-screen keyboard shows about each letter.
//
// The rule worth pinning is that the strongest mark wins. A letter can be
// marked correct in one guess and absent in another — that is ordinary in a
// word with a repeated letter — and colouring it grey because of the later
// guess tells the player something untrue about a letter that is in the word.
import { describe, expect, it } from 'vitest';
import { tallyLetters } from '@/keySink';

const guess = (word: string, marks: string[]) => ({ word, marks });

describe('tallyLetters', () => {
  it('has nothing to say before anything is guessed', () => {
    expect(tallyLetters([])).toEqual({});
  });

  it('marks each letter as the guess marked it', () => {
    expect(tallyLetters([guess('CAT', ['correct', 'present', 'absent'])])).toEqual({
      c: 'correct',
      a: 'present',
      t: 'absent',
    });
  });

  it('holds the strongest across guesses, whichever came last', () => {
    // "in the word" is the fact; a later guess putting it in the wrong place
    // does not unsay it
    const out = tallyLetters([
      guess('OWNER', ['correct', 'absent', 'absent', 'absent', 'absent']),
      guess('OTHER', ['absent', 'absent', 'absent', 'absent', 'absent']),
    ]);
    expect(out.o).toBe('correct');
  });

  it('and upgrades as well as holding', () => {
    const out = tallyLetters([
      guess('AB', ['present', 'absent']),
      guess('AB', ['correct', 'absent']),
    ]);
    expect(out.a).toBe('correct');
    expect(out.b).toBe('absent');
  });

  it('keys by lower case, because that is what the keyboard is drawn from', () => {
    expect(tallyLetters([guess('AB', ['correct', 'absent'])])).toHaveProperty('a');
  });

  it('ignores a mark it does not recognise, rather than colouring by it', () => {
    expect(tallyLetters([guess('AB', ['sparkly', 'absent'])])).toEqual({ b: 'absent' });
  });

  it('survives a guess with no marks at all', () => {
    // a row can exist before it has been marked
    expect(() => tallyLetters([{ word: 'CAT' }])).not.toThrow();
    expect(tallyLetters([{ word: 'CAT' }])).toEqual({});
  });

  it('and marks that do not reach the end of the word', () => {
    expect(tallyLetters([guess('CAT', ['correct'])])).toEqual({ c: 'correct' });
  });
});
