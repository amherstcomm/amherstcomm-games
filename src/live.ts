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
import type { Door } from '@/presenting';

/** What the room is looking at. `answer` is null until the presenter reveals
 *  it — the server withholds it, this type just admits that it might not be
 *  there. */
export type LiveItem = {
  /** `done` is open-mode only: they have answered everything there is. */
  state: 'not-live' | 'waiting' | 'open' | 'locked' | 'revealed' | 'done';
  /** which kind of session this came from — the screen differs, so it has to
   *  be told rather than inferred from what happens to be on it */
  mode?: 'live' | 'open';
  /** open mode: where they are in it, which nobody else's progress affects */
  total?: number;
  done?: number;
  id?: string;
  kind?: string;
  prompt?: string;
  payload?: Record<string, unknown>;
  position?: number;
  opened_at?: string | null;
  /** this browser's own answer, so a reload does not look like you never sent one */
  mine?: unknown;
  answer?: unknown;
  /** how long the question is open for, or absent for no clock */
  seconds?: number | null;
  /** the server's own clock, so a countdown is drawn against the clock that
   *  decides whether an answer counts rather than against this laptop's */
  now?: string;
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
 *  characters would put the answers on the wire for nothing. It also carries
 *  where the run is up to — which question, how many are left, what state it is
 *  in — which is what lets the controls offer one move instead of five. */
export async function readSessionDoor(session: string): Promise<Door> {
  if (!supabase) return { ok: false };
  const { data, error } = await supabase.rpc('session_door', { p_session: session });
  if (error || !data) return { ok: false };
  return data as Door;
}

/** One line of the standings. Names, not ids — the anonymity promise is about
 *  what an open question shows the room, never about who won the quiz. */
export type Standing = { place: number; name: string; points: number; seconds: number | null };

export type Leaderboard = {
  ok: boolean;
  reason?: string;
  /** how many scored questions have been revealed, so "3 of 5" can be said */
  scored?: number;
  standings?: Standing[];
};

/** The board. Gated on winners.view in the database, so this is the presenter's
 *  read — it is what goes on the projector. */
export async function readLeaderboard(session: string): Promise<Leaderboard> {
  if (!supabase) return { ok: false };
  const { data, error } = await supabase.rpc('session_leaderboard', { p_session: session });
  if (error || !data) return { ok: false, reason: error?.message };
  return data as Leaderboard;
}

/** Your own score, for anybody playing. Deliberately not the whole board: a
 *  scoreboard is a thing a room looks at together on one screen, and putting
 *  everyone's position on everyone's phone is a different event from the one
 *  being run. */
export async function readMyStanding(
  session: string
): Promise<{ ok: boolean; points?: number; scored?: number }> {
  if (!supabase) return { ok: false };
  const { data, error } = await supabase.rpc('my_standing', { p_session: session });
  if (error || !data) return { ok: false };
  return data as { ok: boolean; points?: number; scored?: number };
}

/** Who got there first, for the moment after the reveal — the tiebreak made
 *  visible, and the one part of the scoring the room can check against its own
 *  memory of what just happened. */
export async function readItemWinner(
  item: string
): Promise<{ ok: boolean; name?: string | null; seconds?: number | null; correct?: number }> {
  if (!supabase) return { ok: false };
  const { data, error } = await supabase.rpc('item_winner', { p_item: item });
  if (error || !data) return { ok: false };
  return data as { ok: boolean; name?: string | null; seconds?: number | null; correct?: number };
}

/** The board for the wall: every revealed question, everybody, and what each
 *  of them scored on each of them. Same gate as the standings. */
export type SessionScores = {
  ok: boolean;
  reason?: string;
  title?: string;
  state?: 'draft' | 'live' | 'closed';
  questions?: { id: string; position: number; kind: string; prompt: string }[];
  standings?: (Standing & {
    /** keyed by question position; absent means they did not answer it, which
     *  is a different thing from answering it wrongly */
    marks?: Record<string, number>;
  })[];
};

export async function readSessionScores(session: string): Promise<SessionScores> {
  if (!supabase) return { ok: false };
  const { data, error } = await supabase.rpc('session_scores', { p_session: session });
  if (error || !data) return { ok: false, reason: error?.message };
  return data as SessionScores;
}

/** One row of a word game board: what was typed, and how the server marked it.
 *  The marking is the server's because a client that could colour the tiles
 *  would be a client that had been sent the word. */
export type GuessRow = { word: string; marks: string[] };

export async function playGuess(
  item: string,
  word: string
): Promise<{
  ok: boolean;
  reason?: string;
  marks?: string[];
  solved?: boolean;
  left?: number;
  /** only once it is out of reach — solved, or out of guesses */
  word?: string | null;
}> {
  if (!supabase) return { ok: false, reason: 'not connected' };
  const { data, error } = await supabase.rpc('guess_word', { p_item: item, p_guess: word });
  if (error) return { ok: false, reason: error.message };
  return (data as { ok: boolean }) ?? { ok: false, reason: 'no answer' };
}

/** The board as it stands, so a reload mid-round is not a fresh start. */
export async function readGameState(
  item: string
): Promise<{ ok: boolean; guesses?: GuessRow[]; solved?: boolean; word?: string | null }> {
  if (!supabase) return { ok: false };
  const { data, error } = await supabase.rpc('game_state', { p_item: item });
  if (error || !data) return { ok: false };
  return data as { ok: boolean; guesses?: GuessRow[]; solved?: boolean; word?: string | null };
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
): Promise<{ ok: boolean; reason?: string; answer?: unknown }> {
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
export function onSessionMoved(
  session: string,
  listener: () => void,
  onStatus?: (connected: boolean) => void
): () => void {
  if (!supabase) {
    onStatus?.(false);
    return () => {};
  }
  const channel: RealtimeChannel = supabase
    .channel(`live:${session}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'sessions', filter: `id=eq.${session}` },
      () => listener()
    )
    // The status was thrown away before, which is most of why the room going
    // deaf was invisible: a channel that never subscribes and a channel with
    // nothing to say look identical from here. CHANNEL_ERROR and TIMED_OUT are
    // both real outcomes — a websocket that a proxy will not upgrade produces
    // one of them — and the caller needs to know so it can fall back and say
    // so.
    .subscribe((status) => onStatus?.(status === 'SUBSCRIBED'));
  return () => {
    void supabase?.removeChannel(channel);
  };
}
