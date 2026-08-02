// Lifetime play statistics across all game modes, kept in separate daily
// and practice buckets so the Stats modal can show either or a combined
// overall view. Each game calls a record* helper at its completion
// transition; the helper applies the event to local storage and, when
// signed in, also appends it to the game_results log in Supabase. The
// synced view replays that log through the same applyEvent logic, so the
// two can never drift.

import { supabase } from '@/supabase';

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

// one completed-game event; payload shapes match what record* helpers send
export type GameEvent =
  | { game: 'guess'; payload: { won: boolean; guesses: number; timeMs: number } }
  | {
      game: 'hive';
      payload: { pangram: boolean; score: number; genius: boolean; queenBee: boolean };
    }
  | { game: 'scramble' | 'grid'; payload: { score: number; words: number } }
  | { game: 'box'; payload: { words: number; timeMs: number } }
  | { game: 'weave'; payload: { solved: boolean; timeMs: number; hints: number } };

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function sanitizeStore(p: any): StatsStore {
  return { daily: sanitizeBucket(p?.daily), practice: sanitizeBucket(p?.practice) };
}

export function loadStats(): StatsStore {
  try {
    const raw = localStorage.getItem(STATS_KEY);
    return sanitizeStore(raw ? JSON.parse(raw) : null);
  } catch {
    return sanitizeStore(null);
  }
}

// the single source of truth for how an event changes a stats bucket —
// used for live local updates and for replaying the synced event log
export function applyEvent(s: LifetimeStats, e: GameEvent): void {
  switch (e.game) {
    case 'guess': {
      const { won, guesses, timeMs } = e.payload;
      s.guess.played += 1;
      s.guess.totalTimeMs += num(timeMs);
      if (won) {
        s.guess.won += 1;
        if (guesses >= 1 && guesses <= 6) s.guess.dist[guesses - 1] += 1;
        if (s.guess.bestTimeMs === null || timeMs < s.guess.bestTimeMs) {
          s.guess.bestTimeMs = num(timeMs);
        }
      }
      break;
    }
    case 'hive': {
      const { pangram, score, genius, queenBee } = e.payload;
      s.hive.words += 1;
      if (pangram) s.hive.pangrams += 1;
      if (genius) s.hive.genius += 1;
      if (queenBee) s.hive.queenBee += 1;
      if (num(score) > s.hive.bestScore) s.hive.bestScore = num(score);
      break;
    }
    case 'scramble':
    case 'grid': {
      const { score, words } = e.payload;
      s[e.game].sprints += 1;
      s[e.game].words += num(words);
      s[e.game].totalScore += num(score);
      if (num(score) > s[e.game].bestScore) s[e.game].bestScore = num(score);
      break;
    }
    case 'box': {
      const { words, timeMs } = e.payload;
      s.box.solved += 1;
      s.box.totalWords += num(words);
      s.box.totalTimeMs += num(timeMs);
      if (s.box.fewestWords === null || words < s.box.fewestWords) s.box.fewestWords = num(words);
      if (s.box.bestTimeMs === null || timeMs < s.box.bestTimeMs) s.box.bestTimeMs = num(timeMs);
      break;
    }
    case 'weave': {
      const { solved, timeMs, hints } = e.payload;
      s.weave.hintsUsed += num(hints);
      if (solved) {
        s.weave.solved += 1;
        s.weave.totalTimeMs += num(timeMs);
        if (s.weave.bestTimeMs === null || timeMs < s.weave.bestTimeMs) {
          s.weave.bestTimeMs = num(timeMs);
        }
      } else {
        s.weave.revealed += 1;
      }
      break;
    }
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

// fire-and-forget append to the synced event log; no-op when signed out
function syncEvent(e: GameEvent, daily: boolean, puzzleDate: string | null): void {
  if (!supabase) return;
  supabase.auth
    .getSession()
    .then(({ data }) => {
      const userId = data.session?.user.id;
      if (!userId) return;
      return supabase!.from('game_results').insert({
        user_id: userId,
        game: e.game,
        daily,
        puzzle_date: daily && puzzleDate ? puzzleDate : null,
        payload: e.payload,
      });
    })
    .then((res) => {
      if (res?.error) console.warn('Anagrimoire stats sync failed:', res.error.message);
    })
    .catch(() => {
      // offline or transient failure — the local record still stands
    });
}

function record(daily: boolean, e: GameEvent, puzzleDate: string | null = null): void {
  try {
    const store = loadStats();
    applyEvent(daily ? store.daily : store.practice, e);
    localStorage.setItem(STATS_KEY, JSON.stringify(store));
  } catch {
    // storage unavailable — stats are best-effort
  }
  syncEvent(e, daily, puzzleDate);
}

export function recordGuessFinish(
  daily: boolean,
  won: boolean,
  guesses: number,
  timeMs: number,
  puzzleDate: string | null = null
): void {
  record(daily, { game: 'guess', payload: { won, guesses, timeMs } }, puzzleDate);
}

export function recordHiveWord(
  daily: boolean,
  pangram: boolean,
  newScore: number,
  crossedGenius: boolean,
  crossedQueenBee: boolean,
  puzzleDate: string | null = null
): void {
  record(
    daily,
    {
      game: 'hive',
      payload: { pangram, score: newScore, genius: crossedGenius, queenBee: crossedQueenBee },
    },
    puzzleDate
  );
}

export function recordSprint(
  daily: boolean,
  game: 'scramble' | 'grid',
  score: number,
  words: number,
  puzzleDate: string | null = null
): void {
  record(daily, { game, payload: { score, words } }, puzzleDate);
}

export function recordBoxSolve(
  daily: boolean,
  words: number,
  timeMs: number,
  puzzleDate: string | null = null
): void {
  record(daily, { game: 'box', payload: { words, timeMs } }, puzzleDate);
}

export function recordWeaveSolve(
  daily: boolean,
  timeMs: number,
  hints: number,
  puzzleDate: string | null = null
): void {
  record(daily, { game: 'weave', payload: { solved: true, timeMs, hints } }, puzzleDate);
}

export function recordWeaveReveal(
  daily: boolean,
  hints: number,
  puzzleDate: string | null = null
): void {
  record(daily, { game: 'weave', payload: { solved: false, timeMs: 0, hints } }, puzzleDate);
}

// ---------------------------------------------------------------------------
// Synced view
// ---------------------------------------------------------------------------

// stable per-browser identity, so every device can contribute its own
// pre-account history exactly once
function deviceId(): string {
  const KEY = 'anagrimoire:device:v1';
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(KEY, id);
  }
  return id;
}

// one-time per (user, device): snapshot this browser's pre-account stats
// as one of the account's baselines
export async function importBaselineOnce(): Promise<void> {
  if (!supabase) return;
  try {
    const { data: sess } = await supabase.auth.getSession();
    const userId = sess.session?.user.id;
    if (!userId) return;
    const flagKey = `anagrimoire:baseline-imported:${userId}`;
    if (localStorage.getItem(flagKey)) return;
    const { error } = await supabase
      .from('stats_baselines')
      .insert({ user_id: userId, device_id: deviceId(), baseline: loadStats() });
    // 23505 = already imported (row exists from a previous visit)
    if (!error || error.code === '23505') localStorage.setItem(flagKey, '1');
    else console.warn('Anagrimoire baseline import failed:', error.message);
  } catch {
    // best-effort; retried on next load
  }
}

const KNOWN_GAMES = new Set(['guess', 'hive', 'scramble', 'grid', 'box', 'weave']);

// sum of all device baselines + full event-log replay -> the account's
// synced stats
export async function fetchSyncedStats(): Promise<StatsStore | null> {
  if (!supabase) return null;
  try {
    const { data: baselineRows, error: baselineError } = await supabase
      .from('stats_baselines')
      .select('baseline');
    if (baselineError) throw baselineError;
    let store = sanitizeStore(null);
    for (const row of baselineRows ?? []) {
      const b = sanitizeStore(row.baseline);
      store = {
        daily: combineStats(store.daily, b.daily),
        practice: combineStats(store.practice, b.practice),
      };
    }

    const PAGE = 1000;
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from('game_results')
        .select('game, daily, payload')
        .order('id', { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) throw error;
      for (const row of data ?? []) {
        if (!KNOWN_GAMES.has(row.game)) continue;
        applyEvent(row.daily ? store.daily : store.practice, {
          game: row.game,
          payload: row.payload ?? {},
        } as GameEvent);
      }
      if (!data || data.length < PAGE) break;
    }
    return store;
  } catch {
    return null;
  }
}
