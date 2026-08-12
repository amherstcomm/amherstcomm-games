// Difficulty is part of a puzzle's identity, not a setting beside it.
//
// The easy and hard Guess for a given day are different puzzles with different
// answers, and one player may do both — the same way today's 5-letter and
// 6-letter boards are different puzzles. So it keys the board, the saved
// progress and the leaderboard, and the preference below only decides which of
// them you're shown.
//
// What it means is not the same in every game. Guess, Hive, Boxed and Scramble
// draw their answers from a wider band of words; Grid keeps its dice and only
// widens what it accepts, which moves the score you're chasing; Squares and
// Weave change shape, because a word tier means nothing to a dice grid or to a
// hand-written theme.

import { store } from '@/siteStorage';

export type Difficulty = 'easy' | 'hard' | 'extreme';

export const DIFFICULTIES: Difficulty[] = ['easy', 'hard', 'extreme'];

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  easy: 'Easy',
  hard: 'Hard',
  extreme: 'Extreme',
};

/** What changes, in the player's terms rather than ours. */
export const DIFFICULTY_BLURB: Record<Difficulty, string> = {
  easy: 'Everyday words, and the smaller boards.',
  hard: 'Less common words, and a bigger board where there is one.',
  extreme: 'Words you may have to think about, and the least help.',
};

const KEY = 'anagrimoire:difficulty:v1';
const MODE_KEY = 'anagrimoire:difficulty-mode:v1';

/** Whether all three difficulties are on offer each day, or just one.
 *
 *  'all' is the point of the feature: three boards a day per game, each with
 *  its own progress, statistics and streak, and you play as many as you like —
 *  the same way Guess already offers a board per word length. 'locked' is for
 *  people who want one puzzle and no decision, and it hides the switch rather
 *  than removing the other boards, which still exist and can still be played
 *  by unlocking. */
export type DifficultyMode = 'all' | 'locked';

export function difficultyMode(): DifficultyMode {
  return store.getItem(MODE_KEY) === 'locked' ? 'locked' : 'all';
}

export function isDifficulty(v: unknown): v is Difficulty {
  return v === 'easy' || v === 'hard' || v === 'extreme';
}

/** The difficulty being played. Easy by default, which is what every daily
 *  generated before this was: drawn from the common tier. Nobody's puzzle
 *  changes character until they ask it to. */
export function difficulty(): Difficulty {
  const v = store.getItem(KEY);
  return isDifficulty(v) ? v : 'easy';
}

// Games read the difficulty once, when they fetch their board. Changing it has
// to reach them, and a storage write doesn't re-render anything — so the games
// listen and re-fetch. Same shape as dailyBus, and for the same reason: the
// alternative is threading one value through every game as a prop.
const listeners = new Set<() => void>();

export function setDifficulty(next: Difficulty): void {
  if (difficulty() === next) return;
  store.setItem(KEY, next);
  for (const fn of listeners) fn();
}

export function setDifficultyMode(next: DifficultyMode): void {
  if (difficultyMode() === next) return;
  store.setItem(MODE_KEY, next);
  // Locking doesn't change which board you're on, only whether the switch is
  // offered — so no listener fires and nothing re-fetches.
}

/** Called when the difficulty changes. Returns an unsubscribe. */
export function onDifficultyChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Read a difficulty out of a daily feed.
 *
 *  `byDifficulty` is the whole shape now. The feed used to repeat the easy
 *  board at the top level for clients that predated difficulty, and this fell
 *  back to the payload itself to read those — that duplication is gone from
 *  the generator, and with it the fallback. A feed missing the difficulty
 *  asked for simply doesn't have it. */
export function pickDifficulty<T extends object>(
  payload: (T & { byDifficulty?: Partial<Record<Difficulty, unknown>> }) | null,
  want: Difficulty
): T | null {
  const variant = payload?.byDifficulty?.[want];
  return variant && typeof variant === 'object' ? (variant as T) : null;
}

/** The board to play, and the difficulty it actually is.
 *
 *  Those can differ. A feed generated before difficulty existed has only the
 *  easy board, and there will be such a feed in production until the workflow
 *  next runs. Falling back to easy is the right call — a playable puzzle beats
 *  an empty one — but the result must then be recorded as easy, because it is.
 *  Saving it as "hard" would put a board nobody played at that difficulty onto
 *  that difficulty's leaderboard. */
export function resolveDifficulty<T extends object>(
  payload: (T & { byDifficulty?: Partial<Record<Difficulty, unknown>> }) | null,
  want: Difficulty
): { board: T | null; difficulty: Difficulty } {
  const board = pickDifficulty(payload, want);
  if (board) return { board, difficulty: want };
  return { board: pickDifficulty(payload, 'easy'), difficulty: 'easy' };
}
