// Who the on-screen keyboard is typing into.
//
// The keyboard is drawn by App, and it knew about exactly one family of
// boards: the daily games, reached through `pressKey` and coloured from
// `letterStates`. A word game inside a session is drawn by LiveSession, several
// components away and not in that list — so the keyboard rendered, and pressing
// it did nothing.
//
// That was worse than it sounds, because the keyboard is the only place the
// site shows which letters have been used up. A player on a phone could see the
// board and not the letters, which is most of what a guessing game is.
//
// So a board can say "the keyboard is mine while I am on screen". App keeps the
// daily behaviour when nobody has claimed it, which is every page except this
// one.
import { createContext, useContext, useEffect } from 'react';

export type LetterTone = 'correct' | 'present' | 'absent';

export type KeySink = {
  press: (key: string) => void;
  /** lower-case letter to how it should be coloured; absent means untouched */
  letters: Record<string, LetterTone>;
};

/** Set by App. Boards call it through the hook below rather than directly. */
export const KeySinkContext = createContext<(sink: KeySink | null) => void>(() => {});

/** Claim the on-screen keyboard while `active`, and give it back afterwards.
 *
 *  **Both `press` and `letters` must be stable** — `useCallback` and `useMemo`.
 *  Registering puts them in App's state, so a new object every render would
 *  re-render App, which re-renders this, which builds another object. Passing
 *  them raw does not fail loudly; it spins. */
export function useKeySink(
  active: boolean,
  press: (key: string) => void,
  letters: Record<string, LetterTone>
): void {
  const register = useContext(KeySinkContext);
  useEffect(() => {
    if (!active) return;
    register({ press, letters });
    // Given back on the way out, so the daily games get their keyboard back
    // rather than typing into a board that is no longer on screen.
    return () => register(null);
  }, [active, press, letters, register]);
}

/** What each letter has been shown to be, across every guess so far.
 *
 *  Strongest wins: a letter marked correct in one guess and absent in another
 *  is in the word, and colouring it grey because of the later guess would be
 *  telling the player something untrue.
 */
export function tallyLetters(
  guesses: { word: string; marks?: string[] }[]
): Record<string, LetterTone> {
  const rank: Record<LetterTone, number> = { absent: 1, present: 2, correct: 3 };
  const out: Record<string, LetterTone> = {};
  for (const guess of guesses) {
    const letters = guess.word.toLowerCase().split('');
    letters.forEach((letter, i) => {
      const mark = guess.marks?.[i];
      if (mark !== 'correct' && mark !== 'present' && mark !== 'absent') return;
      const held = out[letter];
      if (!held || rank[mark] > rank[held]) out[letter] = mark;
    });
  }
  return out;
}
