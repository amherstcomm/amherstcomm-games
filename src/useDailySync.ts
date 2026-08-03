// Glue between a game's local daily record and its synced row.
//
// Order matters here: we must never push before the first pull has landed, or
// a freshly-opened board on device two would overwrite the progress device one
// had already saved. `syncedKey` is what enforces that — pushes are ignored
// until the key for this board has been marked as merged.

import { useEffect, useRef, useState } from 'react';
import { loadDaily, mergeDaily, saveDaily, type DailyGame } from '@/dailySync';
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
  const syncedKey = useRef<string | null>(null);
  const lastPush = useRef<string>('');
  // bumped on sign-in/out so a fresh account re-pulls rather than inheriting
  // whatever the previous one left on screen
  const [authTick, setAuthTick] = useState(0);

  useEffect(() => {
    if (!supabase) return;
    const { data } = supabase.auth.onAuthStateChange(() => {
      syncedKey.current = null;
      lastPush.current = '';
      setAuthTick((n) => n + 1);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const key = `${game}:${variant}:${date}`;

  // pull, once per board
  useEffect(() => {
    if (!supabase || !active || !date || syncedKey.current === key) return;
    let alive = true;
    setSyncing(true);
    loadDaily(game, variant, date)
      .then((remote) => {
        if (!alive) return;
        if (remote?.state && Object.keys(remote.state).length) {
          const merged = mergeDaily(game, record, remote.state);
          if (merged) setRecord(merged);
        }
        syncedKey.current = key;
      })
      .finally(() => {
        if (alive) setSyncing(false);
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
    saveDaily(game, variant, date, record, completed, summary);
  }, [game, variant, date, active, key, record, completed, summary]);

  return syncing;
}
