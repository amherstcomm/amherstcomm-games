// Lifetime play statistics across all game modes. Each game calls a
// record* helper at its completion transition; the Stats modal reads the
// aggregate. Storage is best-effort localStorage, sanitized on load.

const STATS_KEY = 'anagrimoire:stats:v1';

export type LifetimeStats = {
  guess: {
    played: number; // boards finished, daily and practice alike
    won: number;
    dist: number[]; // wins by guess count, index 0 = won in 1
    totalTimeMs: number;
    bestTimeMs: number | null; // fastest win
  };
  hive: {
    words: number;
    pangrams: number;
    genius: number; // hives that reached Genius
    queenBee: number; // hives fully cleared
    bestScore: number;
  };
  scramble: { sprints: number; words: number; bestScore: number; totalScore: number };
  grid: { sprints: number; words: number; bestScore: number; totalScore: number };
  box: {
    solved: number;
    fewestWords: number | null;
    bestTimeMs: number | null;
    totalWords: number;
    totalTimeMs: number;
  };
  weave: {
    solved: number;
    revealed: number;
    hintsUsed: number;
    bestTimeMs: number | null;
    totalTimeMs: number;
  };
};

export const EMPTY_STATS: LifetimeStats = {
  guess: { played: 0, won: 0, dist: [0, 0, 0, 0, 0, 0], totalTimeMs: 0, bestTimeMs: null },
  hive: { words: 0, pangrams: 0, genius: 0, queenBee: 0, bestScore: 0 },
  scramble: { sprints: 0, words: 0, bestScore: 0, totalScore: 0 },
  grid: { sprints: 0, words: 0, bestScore: 0, totalScore: 0 },
  box: { solved: 0, fewestWords: null, bestTimeMs: null, totalWords: 0, totalTimeMs: 0 },
  weave: { solved: 0, revealed: 0, hintsUsed: 0, bestTimeMs: null, totalTimeMs: 0 },
};

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0;
}

function numOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;
}

export function loadStats(): LifetimeStats {
  try {
    const raw = localStorage.getItem(STATS_KEY);
    if (!raw) return structuredClone(EMPTY_STATS);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p: any = JSON.parse(raw);
    return {
      guess: {
        played: num(p?.guess?.played),
        won: num(p?.guess?.won),
        dist: Array.from({ length: 6 }, (_, i) => num(p?.guess?.dist?.[i])),
        totalTimeMs: num(p?.guess?.totalTimeMs),
        bestTimeMs: numOrNull(p?.guess?.bestTimeMs),
      },
      hive: {
        words: num(p?.hive?.words),
        pangrams: num(p?.hive?.pangrams),
        genius: num(p?.hive?.genius),
        queenBee: num(p?.hive?.queenBee),
        bestScore: num(p?.hive?.bestScore),
      },
      scramble: {
        sprints: num(p?.scramble?.sprints),
        words: num(p?.scramble?.words),
        bestScore: num(p?.scramble?.bestScore),
        totalScore: num(p?.scramble?.totalScore),
      },
      grid: {
        sprints: num(p?.grid?.sprints),
        words: num(p?.grid?.words),
        bestScore: num(p?.grid?.bestScore),
        totalScore: num(p?.grid?.totalScore),
      },
      box: {
        solved: num(p?.box?.solved),
        fewestWords: numOrNull(p?.box?.fewestWords),
        bestTimeMs: numOrNull(p?.box?.bestTimeMs),
        totalWords: num(p?.box?.totalWords),
        totalTimeMs: num(p?.box?.totalTimeMs),
      },
      weave: {
        solved: num(p?.weave?.solved),
        revealed: num(p?.weave?.revealed),
        hintsUsed: num(p?.weave?.hintsUsed),
        bestTimeMs: numOrNull(p?.weave?.bestTimeMs),
        totalTimeMs: num(p?.weave?.totalTimeMs),
      },
    };
  } catch {
    return structuredClone(EMPTY_STATS);
  }
}

function update(fn: (s: LifetimeStats) => void): void {
  try {
    const s = loadStats();
    fn(s);
    localStorage.setItem(STATS_KEY, JSON.stringify(s));
  } catch {
    // storage unavailable — stats are best-effort
  }
}

export function recordGuessFinish(won: boolean, guesses: number, timeMs: number): void {
  update((s) => {
    s.guess.played += 1;
    s.guess.totalTimeMs += timeMs;
    if (won) {
      s.guess.won += 1;
      if (guesses >= 1 && guesses <= 6) s.guess.dist[guesses - 1] += 1;
      if (s.guess.bestTimeMs === null || timeMs < s.guess.bestTimeMs) s.guess.bestTimeMs = timeMs;
    }
  });
}

export function recordHiveWord(
  pangram: boolean,
  newScore: number,
  crossedGenius: boolean,
  crossedQueenBee: boolean
): void {
  update((s) => {
    s.hive.words += 1;
    if (pangram) s.hive.pangrams += 1;
    if (crossedGenius) s.hive.genius += 1;
    if (crossedQueenBee) s.hive.queenBee += 1;
    if (newScore > s.hive.bestScore) s.hive.bestScore = newScore;
  });
}

export function recordSprint(game: 'scramble' | 'grid', score: number, words: number): void {
  update((s) => {
    s[game].sprints += 1;
    s[game].words += words;
    s[game].totalScore += score;
    if (score > s[game].bestScore) s[game].bestScore = score;
  });
}

export function recordBoxSolve(words: number, timeMs: number): void {
  update((s) => {
    s.box.solved += 1;
    s.box.totalWords += words;
    s.box.totalTimeMs += timeMs;
    if (s.box.fewestWords === null || words < s.box.fewestWords) s.box.fewestWords = words;
    if (s.box.bestTimeMs === null || timeMs < s.box.bestTimeMs) s.box.bestTimeMs = timeMs;
  });
}

export function recordWeaveSolve(timeMs: number, hints: number): void {
  update((s) => {
    s.weave.solved += 1;
    s.weave.hintsUsed += hints;
    s.weave.totalTimeMs += timeMs;
    if (s.weave.bestTimeMs === null || timeMs < s.weave.bestTimeMs) s.weave.bestTimeMs = timeMs;
  });
}

export function recordWeaveReveal(hints: number): void {
  update((s) => {
    s.weave.revealed += 1;
    s.weave.hintsUsed += hints;
  });
}
