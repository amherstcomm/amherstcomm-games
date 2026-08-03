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

// Most of a board only ever grows: words found, hints spent, time elapsed.
// Those can be unioned from either side safely, because nothing is ever taken
// away. Boxed's chain is the exception — backspace un-commits a word and
// restart clears the lot — and that changes what a merge means depending on
// which way it is running.
//
//   'pull'  opening a board: prefer whichever side has more of the puzzle done
//   'push'  saving a local edit: the player is looking at the local copy, so a
//           write must never resurrect what they just deleted
//
// Getting this wrong made undo impossible: restart cleared the chain, the save
// read the server's longer copy back, and the words reappeared.
export type MergeMode = 'pull' | 'push';

// Merge a remote board into the local one. `local` shape is whatever the game
// keeps in its own store, so each case knows only its own record.
export function mergeDaily(
  game: DailyGame,
  local: Rec | null,
  remote: Rec | null,
  mode: MergeMode = 'pull'
): Rec | null {
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
      const mine = local.chain ?? [];
      const theirs = remote.chain ?? [];
      const localDone = !!local.revealed || (local.solved ?? false);
      const remoteDone = !!remote.revealed || (remote.solved ?? false);
      // Saving a local edit: the chain is whatever the player is looking at,
      // shorter or not. Opening a board: a finished chain beats an unfinished
      // one, otherwise the longer.
      const chain =
        mode === 'push'
          ? mine
          : remoteDone && !localDone
            ? theirs
            : theirs.length > mine.length
              ? theirs
              : mine;
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
// Knowing whether the server has actually moved
// ---------------------------------------------------------------------------
// Two states can't tell you what happened between them. "The server has a
// longer chain" reads identically whether the other device played more words
// or simply hasn't heard about the word you just deleted — and guessing wrong
// in the second case undoes your undo.
//
// So keep a third: the server state we last reconciled with. If the row still
// looks like that, nothing else has happened and our copy is the newer one,
// deletions included. If it doesn't, another device really did play and the
// safe thing is to keep whichever side has more of the puzzle done.
//
// Deliberately in memory only. After a reload there is no pending local edit
// to protect, so an unknown base falling back to "prefer more progress" is
// exactly right.
const syncBase = new Map<string, string>();

const baseKey = (game: DailyGame, variant: string, date: string) => `${game}:${variant}:${date}`;

export function clearSyncBase(): void {
  syncBase.clear();
}

// Merge a freshly-read row into the local board, using the base to decide
// whether this is a real conflict or just our own change coming back.
export function mergeFromServer(
  game: DailyGame,
  variant: string,
  puzzleDate: string,
  local: Rec | null,
  remote: Rec | null
): Rec | null {
  const key = baseKey(game, variant, puzzleDate);
  const remoteJson = JSON.stringify(remote ?? null);
  const base = syncBase.get(key);
  const serverMoved = base === undefined || base !== remoteJson;
  syncBase.set(key, remoteJson);
  return mergeDaily(game, local, remote, serverMoved ? 'pull' : 'push');
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
      ? mergeDaily(game, state, current.state, 'push')
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
    // what we just wrote is now the server state we have reconciled with, so a
    // pull that reads it back knows it isn't news
    if (!error) syncBase.set(baseKey(game, variant, puzzleDate), JSON.stringify(merged));
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
