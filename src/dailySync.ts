// Daily puzzles, synced per account.
//
// A daily is one board with one outcome, which makes it state rather than an
// event. The append-only game_results log couldn't express that: two devices
// each appended their own rows, so the same puzzle counted twice, and hive —
// which logs a row per word found — couldn't be deduplicated at all without
// storing the word. daily_progress is keyed on the puzzle itself, so a second
// device updates the same row instead of adding to it.
//
// Practice deliberately stays local. Practice boards are generated on demand
// and never repeat, so there is nothing to collide.

import { DAILY_ENV } from '@/dailyData';
import { supabase } from '@/supabase';

export type DailyGame = 'guess' | 'hive' | 'scramble' | 'grid' | 'box' | 'weave';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Rec = Record<string, any>;

export type DailyRow = {
  state: Rec | null;
  completed: boolean;
  result: Rec | null;
};

// ---------------------------------------------------------------------------
// Merging
// ---------------------------------------------------------------------------
// Two devices can both hold progress on the same board — one left open on a
// phone, one on a laptop. Neither is authoritative, so we keep whichever has
// more of the puzzle done rather than letting the later write erase the other.

function unionWords(a?: string[], b?: string[]): string[] {
  const out = [...(a ?? [])];
  const seen = new Set(out);
  for (const w of b ?? []) {
    if (!seen.has(w)) {
      seen.add(w);
      out.push(w);
    }
  }
  return out;
}

const maxNum = (a?: number, b?: number) => Math.max(a ?? 0, b ?? 0);

// smallest of the two, ignoring nulls — for "best" records and start times
function minDefined(a?: number | null, b?: number | null): number | null {
  if (a === null || a === undefined) return b ?? null;
  if (b === null || b === undefined) return a;
  return Math.min(a, b);
}

// Merge a remote board into the local one. `local` shape is whatever the game
// keeps in its own store, so each case knows only its own record.
export function mergeDaily(game: DailyGame, local: Rec | null, remote: Rec | null): Rec | null {
  if (!remote) return local;
  if (!local) return remote;

  switch (game) {
    case 'guess': {
      // Guesses are an ordered sequence against one secret, so they can't be
      // unioned — take whichever device got further.
      const mine = local.guesses ?? [];
      const theirs = remote.guesses ?? [];
      return {
        ...local,
        guesses: theirs.length > mine.length ? theirs : mine,
        elapsedMs: maxNum(local.elapsedMs, remote.elapsedMs),
      };
    }
    case 'hive':
      return {
        ...local,
        found: unionWords(local.found, remote.found),
        invalid: unionWords(local.invalid, remote.invalid),
        revealed: !!(local.revealed || remote.revealed),
        elapsedMs: maxNum(local.elapsedMs, remote.elapsedMs),
      };
    case 'box': {
      // A finished chain beats an unfinished one; otherwise the longer.
      const mine = local.chain ?? [];
      const theirs = remote.chain ?? [];
      const localDone = !!local.revealed || (local.solved ?? false);
      const remoteDone = !!remote.revealed || (remote.solved ?? false);
      const chain = remoteDone && !localDone ? theirs : theirs.length > mine.length ? theirs : mine;
      return {
        ...local,
        chain,
        invalid: unionWords(local.invalid, remote.invalid),
        revealed: !!(local.revealed || remote.revealed),
        elapsedMs: maxNum(local.elapsedMs, remote.elapsedMs),
      };
    }
    case 'scramble':
    case 'grid':
      return {
        ...local,
        found: unionWords(local.found, remote.found),
        invalid: unionWords(local.invalid, remote.invalid),
        // the clock belongs to whichever device started it first
        endsAt: minDefined(local.endsAt, remote.endsAt),
        finished: !!(local.finished || remote.finished),
      };
    case 'weave':
      return {
        ...local,
        found: unionWords(local.found, remote.found),
        hintWords: unionWords(local.hintWords, remote.hintWords),
        hintsUsed: maxNum(local.hintsUsed, remote.hintsUsed),
        revealed: !!(local.revealed || remote.revealed),
        elapsedMs: maxNum(local.elapsedMs, remote.elapsedMs),
      };
  }
}

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

export async function loadDaily(
  game: DailyGame,
  variant: string,
  puzzleDate: string
): Promise<DailyRow | null> {
  if (!supabase || !puzzleDate) return null;
  try {
    const { data: sess } = await supabase.auth.getSession();
    if (!sess.session) return null;
    const { data, error } = await supabase
      .from('daily_progress')
      .select('state, completed, result')
      .eq('game', game)
      .eq('variant', variant)
      .eq('puzzle_date', puzzleDate)
      .eq('env', DAILY_ENV)
      .maybeSingle();
    if (error || !data) return null;
    return { state: data.state ?? null, completed: !!data.completed, result: data.result ?? null };
  } catch {
    // offline, or the table isn't there yet — play locally
    return null;
  }
}

// One pending write per board, so a burst of found words collapses into a
// single upsert instead of one per keystroke.
const pending = new Map<string, number>();

export function saveDaily(
  game: DailyGame,
  variant: string,
  puzzleDate: string,
  state: Rec,
  completed: boolean,
  result: Rec | null,
  /** called when the row already held progress this device hadn't seen */
  onMerged?: (merged: Rec) => void
): void {
  if (!supabase || !puzzleDate) return;
  const key = `${game}:${variant}:${puzzleDate}`;
  window.clearTimeout(pending.get(key));
  pending.set(
    key,
    window.setTimeout(() => {
      pending.delete(key);
      void push(game, variant, puzzleDate, state, completed, result, onMerged);
    }, 800)
  );
}

async function push(
  game: DailyGame,
  variant: string,
  puzzleDate: string,
  state: Rec,
  completed: boolean,
  result: Rec | null,
  onMerged?: (merged: Rec) => void
): Promise<void> {
  try {
    const { data: sess } = await supabase!.auth.getSession();
    const userId = sess.session?.user.id;
    if (!userId) return;

    // Read before write. Merging only when a board first loads isn't enough:
    // a tab that has been open since before the other device played holds a
    // stale copy, and writing that copy wholesale erases whatever the other
    // device did. Whoever writes last must fold in what's already there.
    const current = await loadDaily(game, variant, puzzleDate);
    const merged = (current?.state && Object.keys(current.state).length
      ? mergeDaily(game, state, current.state)
      : state) as Rec;
    const doneNow = completed || !!current?.completed;
    // the finished board's numbers win over a half-played one's absence
    const resultNow = completed ? result : (current?.result ?? result);

    const { error } = await supabase!.from('daily_progress').upsert(
      {
        user_id: userId,
        game,
        variant,
        puzzle_date: puzzleDate,
        env: DAILY_ENV,
        state: merged,
        completed: doneNow,
        result: resultNow,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,game,variant,puzzle_date,env' }
    );
    if (error) {
      console.warn('Anagrimoire daily sync failed:', error.message);
      return;
    }
    // hand anything new back so this device catches up too, rather than
    // waiting for its next reload
    if (onMerged && JSON.stringify(merged) !== JSON.stringify(state)) onMerged(merged);
  } catch {
    // the local board still stands; the next change retries
  }
}
