// Glue between a game's local daily record and its synced row.
//
// Order matters here: we must never push before the first pull has landed, or
// a freshly-opened board on device two would overwrite the progress device one
// had already saved. `syncedKey` is what enforces that — pushes are ignored
// until the key for this board has been marked as merged.

import { useEffect, useRef, useState } from 'react';
import {
  clearSyncBase,
  loadDaily,
  mergeFromServer,
  saveDaily,
  type DailyGame,
} from '@/dailySync';
import { supabase } from '@/supabase';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Rec = Record<string, any>;

export function useDailySync({
  game,
  variant = '',
  date,
  record,
  setRecord,
  summary,
  active,
}: {
  game: DailyGame;
  variant?: string;
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

  const key = `${game}:${variant}:${date}`;

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
    loadDaily(game, variant, date)
      .then((remote) => {
        if (!alive) return;
        if (remote?.state && Object.keys(remote.state).length) {
          const merged = mergeFromServer(game, variant, date, record, remote.state);
          if (merged) setRecordRef.current(merged);
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
  }, [game, variant, date, active, key, authTick]);

  // push, after the pull has landed
  useEffect(() => {
    if (!supabase || !active || !date || !record) return;
    if (syncedKey.current !== key) return;
    const stamp = JSON.stringify([record, completed, summary]);
    if (stamp === lastPush.current) return;
    lastPush.current = stamp;
    saveDaily(game, variant, date, record, completed, summary, (merged) => {
      // the write found progress we hadn't seen; adopt it and let the next
      // push settle, rather than leaving the two copies disagreeing
      lastPush.current = '';
      setRecordRef.current(merged);
    });
  }, [game, variant, date, active, key, record, completed, summary]);

  return syncing;
}
