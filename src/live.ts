// Live sessions, from the browser's side.
//
// The shape is the one realtimeSync already uses for daily progress, and for
// the same reason twice over. A Realtime channel says *that* the session moved
// and carries nothing about how; every client then re-reads through
// `current_item`, which is a security-definer function that decides what this
// caller is allowed to see.
//
// The first reason is the one that applies there: one set of rules rather than
// two, so the read that runs on a notification is the same read that runs on a
// reload. The second is specific to this — the correct answer is a thing the
// server refuses to send before the reveal, and a payload broadcast to the
// room would go around that refusal entirely. There is nothing in the event to
// leak.
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/supabase';

/** What the room is looking at. `answer` is null until the presenter reveals
 *  it — the server withholds it, this type just admits that it might not be
 *  there. */
export type LiveItem = {
  state: 'not-live' | 'waiting' | 'open' | 'locked' | 'revealed';
  id?: string;
  kind?: string;
  prompt?: string;
  payload?: Record<string, unknown>;
  position?: number;
  opened_at?: string | null;
  /** this browser's own answer, so a reload does not look like you never sent one */
  mine?: unknown;
  answer?: unknown;
};

/** The presenter's read: a live count while answers arrive, the answer so they
 *  can run the reveal, and the responses themselves — with `who` null for
 *  anyone who asked to be anonymous, because that promise is to the room and
 *  to the person holding the microphone. */
export type PresenterView = {
  ok: boolean;
  reason?: string;
  answered?: number;
  answer?: unknown;
  responses?: { value: unknown; at: string; who: string | null }[];
};

/** A session somebody can join: the door, not the room. No questions in it —
 *  that is `current_item`'s job, and it checks the session is running first. */
export type LiveSessionSummary = { id: string; title: string; code: string };

/** What is running now, for anybody signed in.
 *
 *  This exists because the mechanism worked and nobody could reach it: the only
 *  links to /live/<id> were on the authoring screen, so the room's way in was
 *  somebody pasting a URL with a raw UUID in it. */
export async function readLiveSessions(): Promise<LiveSessionSummary[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc('live_sessions');
  if (error || !Array.isArray(data)) return [];
  return data as LiveSessionSummary[];
}

/** A code typed off a slide. Case, spaces and dashes are the server's problem —
 *  none of them is allowed to be the reason somebody cannot get in. */
export async function resolveCode(
  code: string
): Promise<{ ok: boolean; id?: string; title?: string; reason?: string }> {
  if (!supabase) return { ok: false, reason: 'not connected' };
  const { data, error } = await supabase.rpc('session_by_code', { p_code: code });
  if (error) return { ok: false, reason: error.message };
  return (data as { ok: boolean; id?: string; reason?: string }) ?? { ok: false, reason: 'no answer' };
}

/** The presenter's header — the session's name and the code to read out. A
 *  separate call from the sheet because it is wanted before a session starts
 *  and on every load, and pulling every question and answer to show four
 *  characters would put the answers on the wire for nothing. */
export async function readSessionDoor(
  session: string
): Promise<{ ok: boolean; title?: string; code?: string | null; state?: string }> {
  if (!supabase) return { ok: false };
  const { data, error } = await supabase.rpc('session_door', { p_session: session });
  if (error || !data) return { ok: false };
  return data as { ok: boolean; title?: string; code?: string | null; state?: string };
}

export async function readCurrentItem(session: string): Promise<LiveItem> {
  if (!supabase) return { state: 'not-live' };
  const { data, error } = await supabase.rpc('current_item', { p_session: session });
  if (error || !data) return { state: 'not-live' };
  return data as LiveItem;
}

export async function readPresenterView(item: string): Promise<PresenterView> {
  if (!supabase) return { ok: false, reason: 'not connected' };
  const { data, error } = await supabase.rpc('presenter_view', { p_item: item });
  if (error || !data) return { ok: false, reason: error?.message ?? 'unavailable' };
  return data as PresenterView;
}

/** Send an answer. The server decides whether it counts — that it is the item
 *  on screen, that the item is still open — and says why when it does not, so
 *  the interface can tell somebody their answer did not land rather than
 *  showing a tick over nothing. */
export async function sendAnswer(
  item: string,
  value: unknown,
  anonymous = false
): Promise<{ ok: boolean; reason?: string }> {
  if (!supabase) return { ok: false, reason: 'not connected' };
  const { data, error } = await supabase.rpc('answer_item', {
    p_item: item,
    p_value: value,
    p_anonymous: anonymous,
  });
  if (error) return { ok: false, reason: error.message };
  return (data as { ok: boolean; reason?: string }) ?? { ok: false, reason: 'no answer' };
}

/** Presenter controls. One call, because the states are a sequence and the
 *  interesting part is which moves the server refuses. */
export async function advance(
  session: string,
  action: 'start' | 'show' | 'lock' | 'reveal' | 'close',
  item?: string
): Promise<{ ok: boolean; reason?: string }> {
  if (!supabase) return { ok: false, reason: 'not connected' };
  const { data, error } = await supabase.rpc('advance_session', {
    p_session: session,
    p_action: action,
    p_item: item ?? null,
  });
  if (error) return { ok: false, reason: error.message };
  return (data as { ok: boolean; reason?: string }) ?? { ok: false, reason: 'no answer' };
}

/** The tally, which the server withholds until the item is revealed — a live
 *  count of a scored question tells a late answerer what everyone else
 *  picked. */
export async function readTally(
  item: string
): Promise<{ ok: boolean; total?: number; counts?: Record<string, number> }> {
  if (!supabase) return { ok: false };
  const { data, error } = await supabase.rpc('item_tally', { p_item: item });
  if (error || !data) return { ok: false };
  return data as { ok: boolean; total?: number; counts?: Record<string, number> };
}

/** The doorbell. Fires when the session row moves — which is what `show`,
 *  `lock`, `reveal`, `start` and `close` all do — and carries nothing.
 *
 *  postgres_changes rather than Broadcast, deliberately. Broadcast is the
 *  better fit for a room's chatter and would be right if the payload mattered,
 *  but here the payload must not exist: the event is a nudge to re-read, and a
 *  channel that can only say "the row changed" cannot accidentally grow a
 *  field with the answer in it. The traffic is one row per presenter click,
 *  not one per participant, so the WAL is not carrying the room. */
export function onSessionMoved(session: string, listener: () => void): () => void {
  if (!supabase) return () => {};
  const channel: RealtimeChannel = supabase
    .channel(`live:${session}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'sessions', filter: `id=eq.${session}` },
      () => listener()
    )
    .subscribe();
  return () => {
    void supabase?.removeChannel(channel);
  };
}
