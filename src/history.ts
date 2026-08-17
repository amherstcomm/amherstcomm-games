// Day-by-day history, read from daily_progress.
//
// This is the one thing the event log could never give us. Practice results
// have a timestamp but no puzzle identity, and hive wrote a row per word, so
// "how did I do on the 3rd" had no answer. One row per player per puzzle does.
//
// It needs an account by definition: a signed-out browser keeps running totals
// and no dates at all, so there is no series to draw.

import { DAILY_ENV } from '@/dailyData';
import { difficulty, type Difficulty } from '@/difficulty';
import { supabase } from '@/supabase';
import { ALL_MODES, PROGRESS_NAME } from '@/games';
import type { Mode } from '@/games';

/** Derived, and it was a hand-written union of eight before — so Word Ladder
 *  and Bridge had dailies, leaderboards and statistics, and no day-by-day
 *  record at all. Not merely missing from the cards: the row was dropped here,
 *  in the fetch, by a membership check against a list two games short. */
export type HistoryGame = (typeof PROGRESS_NAME)[Mode];

export type HistoryEntry = {
  date: string; // the puzzle's Eastern-time date, not when it was played
  /** which board on that date — Guess's word length; '' where a game has one */
  variant: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  result: Record<string, any>;
};

export type History = Record<HistoryGame, HistoryEntry[]>;

const GAMES: HistoryGame[] = ALL_MODES.map((m) => PROGRESS_NAME[m]);

export function emptyHistory(): History {
  return Object.fromEntries(GAMES.map((g) => [g, [] as HistoryEntry[]])) as History;
}

/** Your record at one difficulty.
 *
 *  Filtered rather than pooled: the easy and hard boards for a date are
 *  different puzzles, so counting both would inflate every total and let one
 *  difficulty hold a streak the other broke. */
export async function fetchHistory(
  level: Difficulty = difficulty()
): Promise<History | null> {
  if (!supabase) return null;
  try {
    const { data: sess } = await supabase.auth.getSession();
    if (!sess.session) return null;
    const { data, error } = await supabase
      .from('daily_progress')
      .select('game, variant, puzzle_date, result')
      .eq('completed', true)
      .eq('env', DAILY_ENV)
      .eq('difficulty', level)
      .order('puzzle_date', { ascending: true });
    if (error) throw error;

    const out = emptyHistory();
    for (const row of data ?? []) {
      if (!GAMES.includes(row.game) || !row.result || !row.puzzle_date) continue;
      // Rows written before the summary carried a length have an empty
      // variant; the result usually still knows, so fall back to it.
      const variant = row.variant || (row.result.length ? String(row.result.length) : '');
      out[row.game as HistoryGame].push({ date: row.puzzle_date, variant, result: row.result });
    }
    return out;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Streaks
// ---------------------------------------------------------------------------
// Guess has always kept a streak in localStorage, which only ever knew about
// the browser it lived in — clearing a cache lost it, and a second device
// disagreed. Counted off puzzle dates it survives both.

function previousDate(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export type Streaks = { current: number; best: number };

// `counts` decides what a day has to look like to keep a streak alive — a
// solved Guess, any finished Hive, and so on.
export function streaks(
  entries: HistoryEntry[],
  counts: (e: HistoryEntry) => boolean,
  today: string
): Streaks {
  const days = new Set(entries.filter(counts).map((e) => e.date));
  if (!days.size) return { current: 0, best: 0 };

  let best = 0;
  for (const day of days) {
    // count each run once, from its first day
    if (days.has(previousDate(day))) continue;
    let run = 0;
    for (let d = day; days.has(d); d = nextDate(d)) run++;
    if (run > best) best = run;
  }

  // Today not being played doesn't break a streak until tomorrow — you still
  // have the day to do it.
  let anchor = days.has(today) ? today : previousDate(today);
  let current = 0;
  while (days.has(anchor)) {
    current++;
    anchor = previousDate(anchor);
  }

  return { current, best };
}

function nextDate(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

// What keeps each game's streak alive. Hive and the sprints have no pass mark,
// so turning up is the bar; the rest have to actually be solved.
export const STREAK_RULE: Record<HistoryGame, (e: HistoryEntry) => boolean> = {
  guess: (e) => !!e.result.won,
  hive: () => true,
  scramble: () => true,
  grid: () => true,
  box: () => true,
  weave: (e) => !!e.result.solved,
  // giving up doesn't keep a streak alive, same as Guess and Weave
  squares: (e) => !!e.result.solved,
  cryptogram: (e) => !!e.result.solved,
  // a ladder records solved as a boolean — revealing the route is not solving it
  ladder: (e) => !!e.result.solved,
  // a bridge records how many of its five prompts you got, so the bar is all of
  // them: finding four is a good day, not a kept streak
  bridge: (e) => Number(e.result.solved) >= 5,
};

// ---------------------------------------------------------------------------
// Series
// ---------------------------------------------------------------------------

export type Series = { date: string; value: number }[];

// The number worth plotting for each game, or null where a day has none.
export const SERIES_VALUE: Record<HistoryGame, (e: HistoryEntry) => number | null> = {
  guess: (e) => (e.result.won ? Number(e.result.guesses) || null : null),
  hive: (e) => Number(e.result.score) || 0,
  scramble: (e) => Number(e.result.score) || 0,
  grid: (e) => Number(e.result.score) || 0,
  box: (e) => Number(e.result.words) || null,
  weave: (e) => (e.result.solved ? Number(e.result.timeMs) || null : null),
  squares: (e) => (e.result.solved ? Number(e.result.timeMs) || null : null),
  cryptogram: (e) => (e.result.solved ? Number(e.result.timeMs) || null : null),
  ladder: (e) => (e.result.solved ? Number(e.result.timeMs) || null : null),
  // prompts found, which is the number the board is actually about — time is
  // recorded too, but a bridge is a puzzle you finish rather than a race
  bridge: (e) => Number(e.result.solved) || 0,
};

export function series(entries: HistoryEntry[], game: HistoryGame): Series {
  const read = SERIES_VALUE[game];
  const out: Series = [];
  for (const e of entries) {
    const v = read(e);
    if (v !== null) out.push({ date: e.date, value: v });
  }
  return out;
}

// Guess is really thirteen games — a 5-letter board and a 12-letter board on
// the same day are different puzzles of very different difficulty, and pooling
// them hides exactly the thing worth knowing. The length is already the row's
// variant, so the split costs nothing.
export type LengthRecord = {
  length: number;
  days: number;
  won: number;
  bestGuesses: number | null;
  bestTimeMs: number | null;
};

export function guessByLength(entries: HistoryEntry[]): LengthRecord[] {
  const byLength = new Map<number, LengthRecord>();
  for (const e of entries) {
    const length = Number(e.variant);
    if (!Number.isInteger(length) || length <= 0) continue;
    let rec = byLength.get(length);
    if (!rec) {
      rec = { length, days: 0, won: 0, bestGuesses: null, bestTimeMs: null };
      byLength.set(length, rec);
    }
    rec.days++;
    if (!e.result.won) continue;
    rec.won++;
    const g = Number(e.result.guesses);
    if (g > 0 && (rec.bestGuesses === null || g < rec.bestGuesses)) rec.bestGuesses = g;
    const t = Number(e.result.timeMs);
    if (t > 0 && (rec.bestTimeMs === null || t < rec.bestTimeMs)) rec.bestTimeMs = t;
  }
  return [...byLength.values()].sort((a, b) => a.length - b.length);
}

// Guess is the one game with a distribution worth showing rather than a trend.
export function guessDistribution(entries: HistoryEntry[]): number[] {
  const dist = [0, 0, 0, 0, 0, 0];
  for (const e of entries) {
    if (!e.result.won) continue;
    const g = Number(e.result.guesses);
    if (g >= 1 && g <= 6) dist[g - 1]++;
  }
  return dist;
}
