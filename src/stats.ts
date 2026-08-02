// Lifetime play statistics across all game modes, kept in separate daily
// and practice buckets so the Stats modal can show either or a combined
// overall view. Each game calls a record* helper at its completion
// transition. Storage is best-effort localStorage, sanitized on load.

const STATS_KEY = 'anagrimoire:stats:v1';

export type LifetimeStats = {
  guess: {
    played: number; // boards finished
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

export type StatsStore = { daily: LifetimeStats; practice: LifetimeStats };

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function sanitizeBucket(p: any): LifetimeStats {
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
}

export function loadStats(): StatsStore {
  try {
    const raw = localStorage.getItem(STATS_KEY);
    if (!raw) return { daily: sanitizeBucket(null), practice: sanitizeBucket(null) };
    const p = JSON.parse(raw);
    return { daily: sanitizeBucket(p?.daily), practice: sanitizeBucket(p?.practice) };
  } catch {
    return { daily: sanitizeBucket(null), practice: sanitizeBucket(null) };
  }
}

function minNullable(a: number | null, b: number | null): number | null {
  if (a === null) return b;
  if (b === null) return a;
  return Math.min(a, b);
}

// overall view: sums for counters, best-of for records
export function combineStats(a: LifetimeStats, b: LifetimeStats): LifetimeStats {
  return {
    guess: {
      played: a.guess.played + b.guess.played,
      won: a.guess.won + b.guess.won,
      dist: a.guess.dist.map((n, i) => n + b.guess.dist[i]),
      totalTimeMs: a.guess.totalTimeMs + b.guess.totalTimeMs,
      bestTimeMs: minNullable(a.guess.bestTimeMs, b.guess.bestTimeMs),
    },
    hive: {
      words: a.hive.words + b.hive.words,
      pangrams: a.hive.pangrams + b.hive.pangrams,
      genius: a.hive.genius + b.hive.genius,
      queenBee: a.hive.queenBee + b.hive.queenBee,
      bestScore: Math.max(a.hive.bestScore, b.hive.bestScore),
    },
    scramble: {
      sprints: a.scramble.sprints + b.scramble.sprints,
      words: a.scramble.words + b.scramble.words,
      bestScore: Math.max(a.scramble.bestScore, b.scramble.bestScore),
      totalScore: a.scramble.totalScore + b.scramble.totalScore,
    },
    grid: {
      sprints: a.grid.sprints + b.grid.sprints,
      words: a.grid.words + b.grid.words,
      bestScore: Math.max(a.grid.bestScore, b.grid.bestScore),
      totalScore: a.grid.totalScore + b.grid.totalScore,
    },
    box: {
      solved: a.box.solved + b.box.solved,
      fewestWords: minNullable(a.box.fewestWords, b.box.fewestWords),
      bestTimeMs: minNullable(a.box.bestTimeMs, b.box.bestTimeMs),
      totalWords: a.box.totalWords + b.box.totalWords,
      totalTimeMs: a.box.totalTimeMs + b.box.totalTimeMs,
    },
    weave: {
      solved: a.weave.solved + b.weave.solved,
      revealed: a.weave.revealed + b.weave.revealed,
      hintsUsed: a.weave.hintsUsed + b.weave.hintsUsed,
      bestTimeMs: minNullable(a.weave.bestTimeMs, b.weave.bestTimeMs),
      totalTimeMs: a.weave.totalTimeMs + b.weave.totalTimeMs,
    },
  };
}

function update(daily: boolean, fn: (s: LifetimeStats) => void): void {
  try {
    const store = loadStats();
    fn(daily ? store.daily : store.practice);
    localStorage.setItem(STATS_KEY, JSON.stringify(store));
  } catch {
    // storage unavailable — stats are best-effort
  }
}

export function recordGuessFinish(
  daily: boolean,
  won: boolean,
  guesses: number,
  timeMs: number
): void {
  update(daily, (s) => {
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
  daily: boolean,
  pangram: boolean,
  newScore: number,
  crossedGenius: boolean,
  crossedQueenBee: boolean
): void {
  update(daily, (s) => {
    s.hive.words += 1;
    if (pangram) s.hive.pangrams += 1;
    if (crossedGenius) s.hive.genius += 1;
    if (crossedQueenBee) s.hive.queenBee += 1;
    if (newScore > s.hive.bestScore) s.hive.bestScore = newScore;
  });
}

export function recordSprint(
  daily: boolean,
  game: 'scramble' | 'grid',
  score: number,
  words: number
): void {
  update(daily, (s) => {
    s[game].sprints += 1;
    s[game].words += words;
    s[game].totalScore += score;
    if (score > s[game].bestScore) s[game].bestScore = score;
  });
}

export function recordBoxSolve(daily: boolean, words: number, timeMs: number): void {
  update(daily, (s) => {
    s.box.solved += 1;
    s.box.totalWords += words;
    s.box.totalTimeMs += timeMs;
    if (s.box.fewestWords === null || words < s.box.fewestWords) s.box.fewestWords = words;
    if (s.box.bestTimeMs === null || timeMs < s.box.bestTimeMs) s.box.bestTimeMs = timeMs;
  });
}

export function recordWeaveSolve(daily: boolean, timeMs: number, hints: number): void {
  update(daily, (s) => {
    s.weave.solved += 1;
    s.weave.hintsUsed += hints;
    s.weave.totalTimeMs += timeMs;
    if (s.weave.bestTimeMs === null || timeMs < s.weave.bestTimeMs) s.weave.bestTimeMs = timeMs;
  });
}

export function recordWeaveReveal(daily: boolean, hints: number): void {
  update(daily, (s) => {
    s.weave.revealed += 1;
    s.weave.hintsUsed += hints;
  });
}
