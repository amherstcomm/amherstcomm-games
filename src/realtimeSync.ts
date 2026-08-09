// A doorbell over daily_progress, not a data feed.
//
// One channel per signed-in session listens for changes to this user's rows.
// The event payload is never merged into anything — it only identifies which
// board moved, and the listener re-runs the same authenticated read-and-merge
// the poll performs. One set of rules, not two. Our own writes echo back,
// which is harmless: the re-read finds a row whose updated_at matches the
// base we recorded, so it reads as ours and changes nothing.
//
// RLS applies to realtime delivery, so the subscription can only ever be sent
// this user's rows; the user_id filter below just keeps the traffic down.

import type { RealtimeChannel } from '@supabase/supabase-js';
import { DAILY_ENV } from '@/dailyData';
import { supabase } from '@/supabase';

/** which board an event was about, in the sync key's shape — or null when the
 *  payload doesn't say, in which case every open board re-pulls */
export type DoorbellKey = string | null;

type Listener = (key: DoorbellKey) => void;

// The sync key for a row's board, or null if the payload doesn't carry enough
// to route. Deletes arrive with only the primary key, which is enough — and a
// board whose row vanished re-pulls, finds nothing, and stands pat.
export function doorbellKey(row: Record<string, unknown> | null | undefined): DoorbellKey {
  if (!row || typeof row.game !== 'string' || typeof row.puzzle_date !== 'string') return null;
  return `${row.game}:${String(row.variant ?? '')}:${String(row.difficulty ?? '')}:${row.puzzle_date}`;
}

/** an event for the other environment's rows is nobody's business here */
export function doorbellWants(row: Record<string, unknown> | null | undefined): boolean {
  return !row?.env || row.env === DAILY_ENV;
}

const listeners = new Set<Listener>();
let channel: RealtimeChannel | null = null;
let channelUid: string | null = null;
let connected = false;
let started = false;

/** true while the socket is up — the poll steps back to a slow sweep */
export function realtimeUp(): boolean {
  return connected;
}

function teardown(): void {
  if (channel) {
    void supabase?.removeChannel(channel);
    channel = null;
  }
  channelUid = null;
  connected = false;
}

function connect(uid: string): void {
  if (!supabase) return;
  teardown();
  channelUid = uid;
  const ch = supabase
    .channel(`daily-progress:${uid}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'daily_progress', filter: `user_id=eq.${uid}` },
      (payload) => {
        const row = (payload.new ?? payload.old ?? null) as Record<string, unknown> | null;
        if (!doorbellWants(row)) return;
        const key = doorbellKey(row);
        for (const listener of [...listeners]) listener(key);
      }
    );
  channel = ch;
  ch.subscribe((status) => {
    // a channel being replaced still reports CLOSED as it dies; only the
    // current one gets to say whether the socket is up
    if (channel !== ch) return;
    connected = status === 'SUBSCRIBED';
  });
}

// Lazy: the channel exists only once a board actually wants the doorbell, and
// follows the session from then on. supabase-js refreshes the socket's token
// itself, so a refresh keeps the same uid and nothing here moves.
function ensureStarted(): void {
  if (started || !supabase) return;
  started = true;
  void supabase.auth.getSession().then(({ data }) => {
    const uid = data.session?.user.id;
    if (uid && !channel) connect(uid);
  });
  supabase.auth.onAuthStateChange((_event, session) => {
    const uid = session?.user.id ?? null;
    if (!uid) teardown();
    else if (uid !== channelUid) connect(uid);
  });
}

export function onDoorbell(listener: Listener): () => void {
  ensureStarted();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
