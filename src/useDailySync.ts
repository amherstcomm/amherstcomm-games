// Glue between a game's local daily record and its synced row.
//
// Order matters here: we must never push before the first pull has landed, or
// a freshly-opened board on device two would overwrite the progress device one
// had already saved. `syncedKey` is what enforces that — pushes are ignored
// until the key for this board has been marked as merged.

import { useEffect, useRef, useState } from 'react';
import type { Difficulty } from '@/difficulty';
import {
  clearSyncBase,
  loadDaily,
  mergeFromServer,
  progressOf,
  saveDaily,
  type DailyGame,
} from '@/dailySync';
import { onDoorbell, realtimeUp } from '@/realtimeSync';
import { supabase } from '@/supabase';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Rec = Record<string, any>;

const POLL_MS = 10_000;

export function useDailySync({
  game,
  difficulty,
  variant = '',
  date,
  record,
  setRecord,
  summary,
  active,
}: {
  game: DailyGame;
  variant?: string;
  /** Which of the day's boards this is. Part of the puzzle's identity, so it
   *  keys the sync the same way the game and the date do. */
  difficulty: Difficulty;
  date: string;
  record: Rec | null;
  setRecord: (merged: Rec) => void;
  /** the finished board's numbers, or null while it's still in play */
  summary: Rec | null;
  active: boolean;
}): boolean {
  // A board counts as done exactly when it has numbers to report. Keeping the
  // two in step matters: daily_stats averages over completed rows, so a row
  // flagged complete with a null result would drag every average toward zero.
  const completed = summary !== null;
  const [syncing, setSyncing] = useState(false);
  // games pass a fresh arrow each render; a ref keeps the effects from
  // re-running on identity alone while still calling the current one
  const setRecordRef = useRef(setRecord);
  setRecordRef.current = setRecord;
  const syncedKey = useRef<string | null>(null);
  // boards this session has already pulled once, so later pulls stay quiet
  const seenKeys = useRef(new Set<string>());
  const lastPush = useRef<string>('');
  // bumped on sign-in/out so a fresh account re-pulls rather than inheriting
  // whatever the previous one left on screen
  const [authTick, setAuthTick] = useState(0);

  useEffect(() => {
    if (!supabase) return;
    const { data } = supabase.auth.onAuthStateChange(() => {
      syncedKey.current = null;
      lastPush.current = '';
      clearSyncBase();
      setAuthTick((n) => n + 1);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  // Write on change, read on a timer. Two windows side by side never exchange
  // focus events — only one of them is focused, and the other just sits there
  // looking stale — so a board that is visible checks back on its own.
  //
  // The doorbell below is the primary delivery now; this timer is the fallback
  // for a dropped socket. While the subscription is up it steps back to a slow
  // sweep — once a minute rather than never, because a socket can go quiet
  // without ever reporting itself down.
  useEffect(() => {
    if (!supabase || !active || !date) return;
    let ticks = 0;
    const id = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      ticks += 1;
      if (realtimeUp() && ticks % 6 !== 0) return;
      syncedKey.current = null;
      setAuthTick((n) => n + 1);
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [active, date]);

  // Pulling once on mount only helps a board that was opened after the other
  // device played. Coming back to a tab that has been sitting there is the
  // normal way people switch machines, so look again when it regains focus.
  useEffect(() => {
    function recheck() {
      if (document.visibilityState !== 'visible') return;
      syncedKey.current = null;
      setAuthTick((n) => n + 1);
    }
    window.addEventListener('focus', recheck);
    document.addEventListener('visibilitychange', recheck);
    return () => {
      window.removeEventListener('focus', recheck);
      document.removeEventListener('visibilitychange', recheck);
    };
  }, []);

  const key = `${game}:${variant}:${difficulty}:${date}`;

  // The doorbell: a realtime event on one of this user's rows triggers the
  // same pull the poll would, and nothing else — the payload only says which
  // board moved. A null key means the event couldn't say, so everyone checks.
  useEffect(() => {
    if (!supabase || !active || !date) return;
    return onDoorbell((ringed) => {
      if (ringed !== null && ringed !== key) return;
      // a hidden tab can stay stale; the visibilitychange recheck catches it up
      if (document.visibilityState !== 'visible') return;
      syncedKey.current = null;
      setAuthTick((n) => n + 1);
    });
  }, [active, date, key]);

  // pull, once per board
  useEffect(() => {
    if (!supabase || !active || !date || syncedKey.current === key) return;
    let alive = true;
    // Only the first look at a board is worth waiting for. The re-checks on
    // focus happen constantly while someone switches windows, and flashing
    // the loading state at each one would be worse than the staleness it
    // exists to fix.
    const silent = seenKeys.current.has(key);
    if (!silent) setSyncing(true);
    loadDaily(game, variant, difficulty, date)
      .then((remote) => {
        if (!alive) return;
        if (remote?.state && Object.keys(remote.state).length) {
          const merged = mergeFromServer(game, variant, difficulty, date, record, remote);
          if (merged) {
            setRecordRef.current(merged);
            // what we just took from the row doesn't need writing straight back
            lastPush.current = JSON.stringify([progressOf(game, merged), completed, summary]);
          }
        }
        syncedKey.current = key;
        seenKeys.current.add(key);
      })
      .finally(() => {
        if (alive && !silent) setSyncing(false);
      });
    return () => {
      alive = false;
    };
    // `record` is deliberately absent: this runs once per board, and re-running
    // it on every keystroke would re-merge the remote board over local progress.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game, variant, difficulty, date, active, key, authTick]);

  // push, after the pull has landed
  useEffect(() => {
    if (!supabase || !active || !date || !record) return;
    if (syncedKey.current !== key) return;
    // Keyed on progress, not the whole record. The boards commit a second of
    // elapsed time into the record every second, so keying on the record meant
    // both devices wrote continuously — and each then saw its own write as the
    // newest, decided the server hadn't moved, and kept its own copy over the
    // other's words. Time rides along with the next real change instead.
    const stamp = JSON.stringify([progressOf(game, record), completed, summary]);
    if (stamp === lastPush.current) return;
    lastPush.current = stamp;
    saveDaily(game, variant, difficulty, date, record, completed, summary, (merged: Rec) => {
      // the write found progress we hadn't seen; adopt it and let the next
      // push settle, rather than leaving the two copies disagreeing
      lastPush.current = '';
      setRecordRef.current(merged);
    });
  }, [game, variant, difficulty, date, active, key, record, completed, summary]);

  return syncing;
}
