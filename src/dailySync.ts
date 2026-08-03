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
  /** the row's own stamp — the only reliable way to tell it apart from itself */
  updatedAt: string;
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
// So keep a third: which version of the row we last reconciled with. If the
// row is still that one, nothing else has happened and our copy is the newer
// one, deletions included. If it isn't, another device really did play and the
// safe thing is to keep whichever side has more of the puzzle done.
//
// Identified by the row's updated_at rather than by comparing its contents.
// jsonb doesn't preserve key order, so a state written and read straight back
// serialises differently than it went in — comparing values meant a save
// always looked like someone else's edit, while two reads in a row didn't.
// That is a coin flip, not a rule, and it made syncing look erratic.
//
// Knowing the row moved is only half of it. The device that didn't make the
// change has the mirror question: its row has moved, so "prefer more progress"
// is what it falls back on — and a deletion can never win that comparison. It
// needs to know one more thing about itself: whether it is holding any work
// the server hasn't got. If it isn't, the server's version is simply the
// truth, shorter or not.
//
// So the base records both what we believe the server holds and what it looked
// like, giving three cases instead of two:
//
//   server unchanged          -> our copy is newer; keep it, deletions included
//   server moved, we're clean -> take the server's copy whole, deletions too
//   both moved                -> a real conflict; keep whichever has more done
//
// Persisted, because a reload otherwise loses the distinction and the stale
// browser goes back to resurrecting on its next load.
type Base = { stamp: string; state: string };

const BASE_STORE = 'anagrimoire:syncbase:v1';

function loadBases(): Map<string, Base> {
  try {
    return new Map(JSON.parse(localStorage.getItem(BASE_STORE) ?? '[]'));
  } catch {
    return new Map();
  }
}

const syncBase = loadBases();

// Key order is not content: jsonb hands a state back rearranged, so comparing
// raw JSON would call every round trip a change.
function canon(value: unknown): string {
  const norm = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(norm);
    if (v && typeof v === 'object') {
      const src = v as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(src).sort()) if (src[k] !== undefined) out[k] = norm(src[k]);
      return out;
    }
    return v;
  };
  return JSON.stringify(norm(value ?? null));
}

const baseKey = (game: DailyGame, variant: string, date: string) => `${game}:${variant}:${date}`;

function saveBases(): void {
  try {
    // yesterday's puzzles are never coming back; don't grow this forever
    const cutoff = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    for (const key of syncBase.keys()) {
      const date = key.split(':')[2] ?? '';
      if (date && date < cutoff) syncBase.delete(key);
    }
    localStorage.setItem(BASE_STORE, JSON.stringify([...syncBase]));
  } catch {
    // storage full or unavailable — the base holds for this page view
  }
}

export function clearSyncBase(): void {
  syncBase.clear();
  saveBases();
}

// Merge a freshly-read row into the local board, using the base to decide
// whether this is a real conflict or just our own change coming back.
export function mergeFromServer(
  game: DailyGame,
  variant: string,
  puzzleDate: string,
  local: Rec | null,
  row: DailyRow
): Rec | null {
  const key = baseKey(game, variant, puzzleDate);
  const base = syncBase.get(key);
  const serverMoved = base === undefined || base.stamp !== row.updatedAt;
  const localDirty = base === undefined || canon(local) !== base.state;

  let merged: Rec | null;
  if (!serverMoved) {
    merged = mergeDaily(game, local, row.state, 'push');
  } else if (!localDirty && row.state) {
    // nothing of ours is unsaved, so there is nothing to defend — take the row
    // as it stands, which is the only way a deletion reaches this device
    merged = { ...(local ?? {}), ...row.state };
  } else {
    merged = mergeDaily(game, local, row.state, 'pull');
  }

  // The base is our own copy at the moment we were last in step, not the row
  // as it arrived. Merging fills in fields the stored state doesn't carry —
  // `revealed` and the like — so comparing against the raw row would call an
  // untouched board dirty forever, and a device that is never clean can never
  // accept a deletion.
  syncBase.set(key, { stamp: row.updatedAt, state: canon(merged) });
  saveBases();
  return merged;
}

export function noteWritten(
  game: DailyGame,
  variant: string,
  puzzleDate: string,
  updatedAt: string,
  state: Rec
): void {
  syncBase.set(baseKey(game, variant, puzzleDate), { stamp: updatedAt, state: canon(state) });
  saveBases();
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
      .select('state, completed, result, updated_at')
      .eq('game', game)
      .eq('variant', variant)
      .eq('puzzle_date', puzzleDate)
      .eq('env', DAILY_ENV)
      .maybeSingle();
    if (error || !data) return null;
    return {
      state: data.state ?? null,
      completed: !!data.completed,
      result: data.result ?? null,
      updatedAt: String(data.updated_at ?? ''),
    };
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
    const writtenAt = new Date().toISOString();
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
        updated_at: writtenAt,
      },
      { onConflict: 'user_id,game,variant,puzzle_date,env' }
    );
    // what we just wrote is now the server state we have reconciled with, so a
    // pull that reads it back knows it isn't news
    if (!error) noteWritten(game, variant, puzzleDate, writtenAt, merged);
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
