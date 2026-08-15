// Lifetime play statistics across all game modes, kept in separate daily
// and practice buckets so the Stats modal can show either or a combined
// overall view. Each game calls a record* helper at its completion
// transition; the helper applies the event to local storage and, when
// signed in, also appends it to the game_results log in Supabase. The
// synced view replays that log through the same applyEvent logic, so the
// two can never drift.

import { DAILY_ENV } from '@/dailyData';
import { supabase } from '@/supabase';
import { store as siteStore } from '@/siteStorage';

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
  cryptogram: {
    solved: number;
    revealed: number;
    bestTimeMs: number | null;
    totalTimeMs: number;
  };
  /** `inPar` is the ladder's own measure of a good game: solving it at all is
   *  one thing, solving it in the fewest steps another. */
  ladder: {
    solved: number;
    revealed: number;
    inPar: number;
    bestTimeMs: number | null;
    totalTimeMs: number;
  };
  /** A bridge board is five prompts, so a day is not solved or unsolved — it
   *  is a count out of five. `boards` is the clean sweeps and `found` the
   *  prompts, because a four-of-five day is worth more than a blank one and a
   *  single number cannot say both. */
  bridge: {
    boards: number;
    found: number;
    revealed: number;
    hints: number;
    bestTimeMs: number | null;
    totalTimeMs: number;
  };
  /** kept per board size: a 4×4 and a 5×5 are different puzzles, and pooling
   *  their times makes an average that describes neither */
  squares: Record<SquareStatSize, SquaresStat>;
};

export type SquareStatSize = '4' | '5';
export const SQUARE_STAT_SIZES: SquareStatSize[] = ['4', '5'];
export type SquaresStat = {
  solved: number;
  revealed: number;
  bestTimeMs: number | null;
  totalTimeMs: number;
};

export type StatsStore = { daily: LifetimeStats; practice: LifetimeStats };

// one completed-game event; payload shapes match what record* helpers send
export type GameEvent =
  | { game: 'guess'; payload: { won: boolean; guesses: number; timeMs: number; length?: number } }
  | {
      game: 'hive';
      payload: { pangram: boolean; score: number; genius: boolean; queenBee: boolean };
    }
  | { game: 'scramble' | 'grid'; payload: { score: number; words: number } }
  | { game: 'box'; payload: { words: number; timeMs: number } }
  | { game: 'weave'; payload: { solved: boolean; timeMs: number; hints: number } }
  | { game: 'squares'; payload: { solved: boolean; size: number; timeMs: number } }
  | { game: 'cryptogram'; payload: { solved: boolean; timeMs: number } }
  | { game: 'ladder'; payload: { solved: boolean; steps: number; par: number; timeMs: number } }
  | {
      game: 'bridge';
      payload: { solved: number; of: number; hints: number; timeMs: number; revealed: boolean };
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
    cryptogram: {
      solved: num(p?.cryptogram?.solved),
      revealed: num(p?.cryptogram?.revealed),
      bestTimeMs: numOrNull(p?.cryptogram?.bestTimeMs),
      totalTimeMs: num(p?.cryptogram?.totalTimeMs),
    },
    ladder: {
      solved: num(p?.ladder?.solved),
      revealed: num(p?.ladder?.revealed),
      inPar: num(p?.ladder?.inPar),
      bestTimeMs: numOrNull(p?.ladder?.bestTimeMs),
      totalTimeMs: num(p?.ladder?.totalTimeMs),
    },
    bridge: {
      boards: num(p?.bridge?.boards),
      found: num(p?.bridge?.found),
      revealed: num(p?.bridge?.revealed),
      hints: num(p?.bridge?.hints),
      bestTimeMs: numOrNull(p?.bridge?.bestTimeMs),
      totalTimeMs: num(p?.bridge?.totalTimeMs),
    },
    squares: Object.fromEntries(
      SQUARE_STAT_SIZES.map((k) => [
        k,
        {
          solved: num(p?.squares?.[k]?.solved),
          revealed: num(p?.squares?.[k]?.revealed),
          bestTimeMs: numOrNull(p?.squares?.[k]?.bestTimeMs),
          totalTimeMs: num(p?.squares?.[k]?.totalTimeMs),
        },
      ])
    ) as Record<SquareStatSize, SquaresStat>,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function sanitizeStore(p: any): StatsStore {
  return { daily: sanitizeBucket(p?.daily), practice: sanitizeBucket(p?.practice) };
}

export function loadStats(): StatsStore {
  try {
    const raw = siteStore.getItem(STATS_KEY);
    return sanitizeStore(raw ? JSON.parse(raw) : null);
  } catch {
    return sanitizeStore(null);
  }
}

// Forget this browser's lifetime totals. Boards in progress are a separate
// key each and deliberately untouched — clearing statistics shouldn't take
// a puzzle away from someone mid-solve.
export function clearLocalStats(): void {
  try {
    siteStore.removeItem(STATS_KEY);
  } catch {
    // nothing sensible to do; the account copy is the one that mattered
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
    case 'ladder': {
      const { solved, steps, par, timeMs } = e.payload;
      if (solved) {
        s.ladder.solved += 1;
        if (steps <= par) s.ladder.inPar += 1;
        s.ladder.totalTimeMs += num(timeMs);
        if (s.ladder.bestTimeMs === null || timeMs < s.ladder.bestTimeMs) {
          s.ladder.bestTimeMs = num(timeMs);
        }
      } else {
        s.ladder.revealed += 1;
      }
      break;
    }
    case 'bridge': {
      const { solved, of, hints, timeMs, revealed } = e.payload;
      s.bridge.found += num(solved);
      s.bridge.hints += num(hints);
      if (revealed) {
        s.bridge.revealed += 1;
      } else if (solved >= of) {
        s.bridge.boards += 1;
        s.bridge.totalTimeMs += num(timeMs);
        if (s.bridge.bestTimeMs === null || timeMs < s.bridge.bestTimeMs) {
          s.bridge.bestTimeMs = num(timeMs);
        }
      }
      break;
    }
    case 'cryptogram': {
      const { solved, timeMs } = e.payload;
      if (solved) {
        s.cryptogram.solved += 1;
        s.cryptogram.totalTimeMs += num(timeMs);
        if (s.cryptogram.bestTimeMs === null || timeMs < s.cryptogram.bestTimeMs) {
          s.cryptogram.bestTimeMs = num(timeMs);
        }
      } else {
        s.cryptogram.revealed += 1;
      }
      break;
    }
    case 'squares': {
      const { solved, size, timeMs } = e.payload;
      const b = s.squares[String(size) as SquareStatSize];
      if (!b) break;
      if (solved) {
        b.solved += 1;
        b.totalTimeMs += num(timeMs);
        if (b.bestTimeMs === null || timeMs < b.bestTimeMs) b.bestTimeMs = num(timeMs);
      } else {
        b.revealed += 1;
      }
      break;
    }
  }
}

// A daily contributes one summary rather than a stream of events. Hive is the
// reason this isn't just applyEvent: its log counted one row per word, so a
// finished hive has to arrive as totals instead.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applyDailySummary(s: LifetimeStats, game: string, p: any): void {
  switch (game) {
    case 'guess': {
      s.guess.played += 1;
      s.guess.totalTimeMs += num(p?.timeMs);
      if (p?.won) {
        s.guess.won += 1;
        const g = num(p?.guesses);
        if (g >= 1 && g <= 6) s.guess.dist[g - 1] += 1;
        s.guess.bestTimeMs = minNullable(s.guess.bestTimeMs, num(p?.timeMs));
      }
      break;
    }
    case 'hive':
      s.hive.words += num(p?.words);
      s.hive.pangrams += num(p?.pangrams);
      if (p?.genius) s.hive.genius += 1;
      if (p?.queenBee) s.hive.queenBee += 1;
      s.hive.bestScore = Math.max(s.hive.bestScore, num(p?.score));
      break;
    case 'scramble':
    case 'grid': {
      const b = s[game];
      b.sprints += 1;
      b.words += num(p?.words);
      b.totalScore += num(p?.score);
      b.bestScore = Math.max(b.bestScore, num(p?.score));
      break;
    }
    case 'box':
      s.box.solved += 1;
      s.box.totalWords += num(p?.words);
      s.box.totalTimeMs += num(p?.timeMs);
      s.box.fewestWords = minNullable(s.box.fewestWords, num(p?.words));
      s.box.bestTimeMs = minNullable(s.box.bestTimeMs, num(p?.timeMs));
      break;
    case 'weave':
      s.weave.hintsUsed += num(p?.hints);
      if (p?.solved) {
        s.weave.solved += 1;
        s.weave.totalTimeMs += num(p?.timeMs);
        s.weave.bestTimeMs = minNullable(s.weave.bestTimeMs, num(p?.timeMs));
      } else {
        s.weave.revealed += 1;
      }
      break;
    case 'ladder':
      if (p?.solved) {
        s.ladder.solved += 1;
        if (num(p?.steps) <= num(p?.par)) s.ladder.inPar += 1;
        s.ladder.totalTimeMs += num(p?.timeMs);
        s.ladder.bestTimeMs = minNullable(s.ladder.bestTimeMs, num(p?.timeMs));
      } else {
        s.ladder.revealed += 1;
      }
      break;
    case 'bridge':
      s.bridge.found += num(p?.solved);
      s.bridge.hints += num(p?.hints);
      if (p?.revealed) {
        s.bridge.revealed += 1;
      } else if (num(p?.solved) >= num(p?.of)) {
        s.bridge.boards += 1;
        s.bridge.totalTimeMs += num(p?.timeMs);
        s.bridge.bestTimeMs = minNullable(s.bridge.bestTimeMs, num(p?.timeMs));
      }
      break;
    case 'cryptogram':
      if (p?.solved) {
        s.cryptogram.solved += 1;
        s.cryptogram.totalTimeMs += num(p?.timeMs);
        s.cryptogram.bestTimeMs = minNullable(s.cryptogram.bestTimeMs, num(p?.timeMs));
      } else {
        s.cryptogram.revealed += 1;
      }
      break;
    case 'squares': {
      const sq = s.squares[String(p?.size) as SquareStatSize];
      if (!sq) break;
      if (p?.solved) {
        sq.solved += 1;
        sq.totalTimeMs += num(p?.timeMs);
        sq.bestTimeMs = minNullable(sq.bestTimeMs, num(p?.timeMs));
      } else {
        sq.revealed += 1;
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
    bridge: {
      boards: a.bridge.boards + b.bridge.boards,
      found: a.bridge.found + b.bridge.found,
      revealed: a.bridge.revealed + b.bridge.revealed,
      hints: a.bridge.hints + b.bridge.hints,
      bestTimeMs: minNullable(a.bridge.bestTimeMs, b.bridge.bestTimeMs),
      totalTimeMs: a.bridge.totalTimeMs + b.bridge.totalTimeMs,
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
    cryptogram: {
      solved: a.cryptogram.solved + b.cryptogram.solved,
      revealed: a.cryptogram.revealed + b.cryptogram.revealed,
      bestTimeMs: minNullable(a.cryptogram.bestTimeMs, b.cryptogram.bestTimeMs),
      totalTimeMs: a.cryptogram.totalTimeMs + b.cryptogram.totalTimeMs,
    },
    ladder: {
      solved: a.ladder.solved + b.ladder.solved,
      revealed: a.ladder.revealed + b.ladder.revealed,
      inPar: a.ladder.inPar + b.ladder.inPar,
      bestTimeMs: minNullable(a.ladder.bestTimeMs, b.ladder.bestTimeMs),
      totalTimeMs: a.ladder.totalTimeMs + b.ladder.totalTimeMs,
    },
    squares: Object.fromEntries(
      SQUARE_STAT_SIZES.map((k) => [
        k,
        {
          solved: a.squares[k].solved + b.squares[k].solved,
          revealed: a.squares[k].revealed + b.squares[k].revealed,
          bestTimeMs: minNullable(a.squares[k].bestTimeMs, b.squares[k].bestTimeMs),
          totalTimeMs: a.squares[k].totalTimeMs + b.squares[k].totalTimeMs,
        },
      ])
    ) as Record<SquareStatSize, SquaresStat>,
  };
}

// Fire-and-forget append to the synced event log; no-op when signed out.
//
// Practice only. Dailies live in daily_progress, keyed on the puzzle, because
// an append-only log can't say "this is the same board you already played" —
// which is exactly what two devices need to agree on.
function syncEvent(e: GameEvent, daily: boolean, puzzleDate: string | null): void {
  if (!supabase || daily) return;
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
        // env tags which daily set (dev/prod) this result belongs to, so
        // global daily stats never mix the two sites' different puzzles
        payload: { ...e.payload, env: DAILY_ENV },
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
    siteStore.setItem(STATS_KEY, JSON.stringify(store));
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
  puzzleDate: string | null = null,
  length?: number
): void {
  record(daily, { game: 'guess', payload: { won, guesses, timeMs, length } }, puzzleDate);
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

/** Same shape as a squares finish: a passage is worked out or given up on,
 *  once either way. There is no size to carry — every cryptogram is one
 *  passage, and difficulty is how much of it you were handed. */
export function recordCryptogramFinish(
  daily: boolean,
  solved: boolean,
  timeMs: number,
  puzzleDate: string | null = null
): void {
  record(daily, { game: 'cryptogram', payload: { solved, timeMs } }, puzzleDate);
}

/** A ladder ends once, solved or given up on. `steps` rides along so par can
 *  be counted without the stats needing to know which pair it was. */
export function recordLadderFinish(
  daily: boolean,
  solved: boolean,
  steps: number,
  par: number,
  timeMs: number,
  puzzleDate: string | null = null
): void {
  record(daily, { game: 'ladder', payload: { solved, steps, par, timeMs } }, puzzleDate);
}

/** A squares board is over exactly once — solved or given up on — so both
 *  outcomes are one event, and `size` rides along because the 4x4 and the 5x5
 *  are separate puzzles on the same day. */
/** One board, however it ended. `solved` is how many of the five came out, so
 *  a partial day still counts for something — the alternative records a
 *  four-of-five as identical to never opening it. */
export function recordBridgeFinish(o: {
  solved: number;
  of: number;
  hints: number;
  timeMs: number;
  revealed: boolean;
}): void {
  record(true, { game: 'bridge', payload: o }, null);
}

export function recordSquaresFinish(
  daily: boolean,
  solved: boolean,
  size: number,
  timeMs: number,
  puzzleDate: string | null = null
): void {
  record(daily, { game: 'squares', payload: { solved, size, timeMs } }, puzzleDate);
}

// ---------------------------------------------------------------------------
// Synced view
// ---------------------------------------------------------------------------

// stable per-browser identity, so every device can contribute its own
// pre-account history exactly once
function deviceId(): string {
  const KEY = 'anagrimoire:device:v1';
  let id = siteStore.getItem(KEY);
  if (!id) {
    id = crypto.randomUUID();
    siteStore.setItem(KEY, id);
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
    if (siteStore.getItem(flagKey)) return;
    const { error } = await supabase
      .from('stats_baselines')
      .insert({ user_id: userId, device_id: deviceId(), baseline: loadStats() });
    // 23505 = already imported (row exists from a previous visit)
    if (!error || error.code === '23505') siteStore.setItem(flagKey, '1');
    else console.warn('Anagrimoire baseline import failed:', error.message);
  } catch {
    // best-effort; retried on next load
  }
}

// Every game name GameEvent can carry. A row for anything else is from a
// version this build doesn't know about, and gets skipped rather than crashing
// the replay — which is also why a game missing from here disappears from the
// synced view entirely while still showing up signed out. Add new games here.
const KNOWN_GAMES = new Set<GameEvent['game']>([
  'guess',
  'hive',
  'scramble',
  'grid',
  'box',
  'weave',
  'squares',
  'cryptogram',
  'ladder',
  'bridge',
]);

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

    // practice: the event log, replayed
    const PAGE = 1000;
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from('game_results')
        .select('game, daily, payload')
        .eq('daily', false)
        .order('id', { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) throw error;
      for (const row of data ?? []) {
        if (!KNOWN_GAMES.has(row.game)) continue;
        applyEvent(store.practice, {
          game: row.game,
          payload: row.payload ?? {},
        } as GameEvent);
      }
      if (!data || data.length < PAGE) break;
    }

    // dailies: one summary per board, however many devices played it
    const { data: dailies, error: dailyError } = await supabase
      .from('daily_progress')
      .select('game, result')
      .eq('completed', true);
    if (dailyError) throw dailyError;
    for (const row of dailies ?? []) {
      if (!KNOWN_GAMES.has(row.game) || !row.result) continue;
      applyDailySummary(store.daily, row.game, row.result);
    }

    return store;
  } catch {
    return null;
  }
}
