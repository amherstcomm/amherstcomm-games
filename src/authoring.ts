// Building a session, from the browser's side.
//
// Same shape as live.ts and for the same reason: every call is an RPC into a
// security-definer function, because the tables these functions write have no
// grant to any web role. The answer in particular lives in `item_answers`,
// which `authenticated` cannot select — so an editor setting a correct answer
// and a participant trying to read one go through completely different doors,
// rather than through one door with a check on it.
//
// Nothing here decides who may author. `can('games.setup')` decides, in the
// database, on every call. What the client knows is only which buttons to draw.
import { supabase } from '@/supabase';

/** One question, as its author sees it — including the answer, which the play
 *  view is not given until the presenter reveals it. */
export type SheetItem = {
  id: string;
  position: number;
  kind: string;
  prompt: string;
  payload: Record<string, unknown>;
  state: 'pending' | 'open' | 'locked' | 'revealed';
  answer: unknown;
  /** how many people have answered — the reason an item can be deleted but not
   *  edited once it has been shown */
  responses: number;
};

export type ItemKind = { kind: string; description: string; scored: boolean };

export type Sheet = {
  ok: boolean;
  reason?: string;
  session?: {
    id: string;
    title: string;
    state: 'draft' | 'live' | 'closed';
    late_join: 'strict' | 'open';
    current_item: string | null;
    /** the four characters that go on the slide */
    code: string | null;
    mode: SessionMode;
    qa: boolean;
    shared: boolean;
  };
  kinds?: ItemKind[];
  items?: SheetItem[];
};

/** Whether there is somebody at the front.
 *
 *  `live` is one clock and one screen: the presenter opens a question and the
 *  room answers it together. `open` has nobody at the front — you join
 *  whenever, get the questions one at a time, and answer at your own pace, with
 *  your clock starting when each question reaches *you*. The two land on the
 *  same scoreboard because the timing means the same thing in both. */
export type SessionMode = 'live' | 'open';

export type SessionSummary = {
  id: string;
  title: string;
  state: 'draft' | 'live' | 'closed';
  late_join: 'strict' | 'open';
  mode: SessionMode;
  qa: boolean;
  shared: boolean;
  code: string | null;
  items: number;
  created_at: string;
};

/** The kinds this build can actually put in front of a room.
 *
 *  `item_kinds` is a table so the server can learn a new kind before the site
 *  can draw it, which is the right way round — but it means the authoring
 *  screen must not offer everything it finds there. A question nobody can
 *  answer is worse than a missing feature: it fails in front of the room, at
 *  the one moment there is no way to fix it.
 *
 *  LiveSession renders exactly these three. When it grows match, number and
 *  rank, this list is the thing that has to move with it — which is why it sits
 *  next to the type rather than inside a component. */
export const AUTHORABLE = [
  'choice',
  'survey',
  'open',
  'match',
  'number',
  'rank',
  'game',
] as const;

/** What each one is called on screen. A table rather than a chain of ternaries
 *  so adding a kind to AUTHORABLE without naming it fails to compile. */
export const KIND_LABEL: Record<(typeof AUTHORABLE)[number], string> = {
  choice: 'Multiple choice',
  survey: 'Survey',
  open: 'Open question',
  match: 'Matching',
  number: 'Closest guess',
  rank: 'Ranking',
  game: 'Word game',
};

/** The word games a session can actually run.
 *
 *  One so far. The other nine each need a play function in the schema — the
 *  server marks, so every game's rule has to exist there — and a board of
 *  their own for the room, because embedding the daily component would mean a
 *  round in a session writing over somebody's daily progress and its streak.
 *
 *  This is the list that moves when one arrives, and it is next to the type
 *  rather than inside a component for the same reason AUTHORABLE is: offering
 *  a game the room cannot play fails on the projector. */
export const GAME_PLAYABLE = ['guess'] as const;

/** What the room is shown to start a word game. Deliberately not the answer:
 *  `payload` goes to the room, and the word lives in item_answers where no web
 *  role can read it — see the note above guess_word in the schema. */
export type GamePayload = { slug: string; length: number; tries: number; seconds?: number };
export type GameAnswer = { word: string };

const fail = (reason: string) => ({ ok: false as const, reason });

export async function readSessions(): Promise<SessionSummary[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc('my_sessions');
  if (error || !Array.isArray(data)) return [];
  return data as SessionSummary[];
}

export async function readSheet(session: string): Promise<Sheet> {
  if (!supabase) return fail('not connected');
  const { data, error } = await supabase.rpc('session_sheet', { p_session: session });
  if (error || !data) return fail(error?.message ?? 'unavailable');
  return data as Sheet;
}

export async function createSession(
  title: string,
  lateJoin: 'strict' | 'open',
  mode: SessionMode = 'live',
  qa = true
): Promise<{ ok: boolean; id?: string; reason?: string }> {
  if (!supabase) return fail('not connected');
  const { data, error } = await supabase.rpc('create_session', {
    p_title: title,
    p_late_join: lateJoin,
    p_mode: mode,
    p_qa: qa,
  });
  if (error) return fail(error.message);
  return (data as { ok: boolean; id?: string; reason?: string }) ?? fail('no answer');
}

/** Create when `item` is undefined, update when it is not. One call, because
 *  the answer has to be written in the same breath as the question that owns
 *  it — see the note on save_item in schema.sql. */
export async function saveItem(args: {
  session: string;
  item?: string;
  kind: string;
  prompt: string;
  payload: Record<string, unknown>;
  answer: unknown;
}): Promise<{ ok: boolean; id?: string; reason?: string }> {
  if (!supabase) return fail('not connected');
  const { data, error } = await supabase.rpc('save_item', {
    p_session: args.session,
    p_item: args.item ?? null,
    p_kind: args.kind,
    p_prompt: args.prompt,
    p_payload: args.payload,
    p_answer: args.answer ?? null,
  });
  if (error) return fail(error.message);
  return (data as { ok: boolean; id?: string; reason?: string }) ?? fail('no answer');
}

export async function deleteItem(item: string): Promise<{ ok: boolean; reason?: string }> {
  if (!supabase) return fail('not connected');
  const { data, error } = await supabase.rpc('delete_item', { p_item: item });
  if (error) return fail(error.message);
  return (data as { ok: boolean; reason?: string }) ?? fail('no answer');
}

export async function moveItem(
  item: string,
  delta: -1 | 1
): Promise<{ ok: boolean; reason?: string }> {
  if (!supabase) return fail('not connected');
  const { data, error } = await supabase.rpc('move_item', { p_item: item, p_delta: delta });
  if (error) return fail(error.message);
  return (data as { ok: boolean; reason?: string }) ?? fail('no answer');
}

/** What a deletion would cost, when the server asks for confirmation. */
export type DeleteCost = { items?: number; answers?: number; people?: number };

/** Delete a session, for good.
 *
 *  A draft goes on the first call. Anything that has run comes back with
 *  `reason: 'confirm'` and the counts, so the interface can ask about a known
 *  quantity rather than saying "are you sure?" about an unknown one; calling
 *  again with `confirm` does it.
 *
 *  The responses go with it. That is the point rather than a side effect —
 *  half-deleting would leave answers to questions that no longer exist. */
export async function deleteSession(
  session: string,
  confirm = false
): Promise<{ ok: boolean; reason?: string } & DeleteCost> {
  if (!supabase) return fail('not connected');
  const { data, error } = await supabase.rpc('delete_session', {
    p_session: session,
    p_confirm: confirm,
  });
  if (error) return fail(error.message);
  return (data as { ok: boolean; reason?: string }) ?? fail('no answer');
}

/** Run the same questions again with nobody's answers in the way.
 *
 *  A weekly quiz is the same shape every week, and rebuilding it by hand is the
 *  part that stops it happening. The copy is a draft with its own join code,
 *  and none of what happened: no answers, no board, no questions anybody asked.
 *
 *  Pass a title or take `"<name> (copy)"` — there is no rename anywhere else,
 *  so the name it is created with is the name it keeps. */
export async function duplicateSession(
  session: string,
  title?: string
): Promise<{ ok: boolean; reason?: string; id?: string; items?: number }> {
  if (!supabase) return fail('not connected');
  const { data, error } = await supabase.rpc('duplicate_session', {
    p_session: session,
    p_title: title ?? null,
  });
  if (error) return fail(error.message);
  return (data as { ok: boolean; reason?: string }) ?? fail('no answer');
}

/** The sentence to put in front of somebody before it goes. Numbers, because
 *  "are you sure?" about an unknown quantity is not a question anybody can
 *  answer well. */
export function deletionWarning(title: string, cost: DeleteCost): string {
  const parts = [
    `${cost.items ?? 0} ${cost.items === 1 ? 'question' : 'questions'}`,
    `${cost.answers ?? 0} ${cost.answers === 1 ? 'answer' : 'answers'}`,
  ];
  if ((cost.people ?? 0) > 0) {
    parts.push(`from ${cost.people} ${cost.people === 1 ? 'person' : 'people'}`);
  }
  return `Delete "${title}" for good? It has ${parts.join(', ')}. This cannot be undone.`;
}

// ---------------------------------------------------------------------------
// The shapes a payload and an answer take, in one place.
//
// These are the contract between what the editor writes and what LiveSession
// reads, and they were previously written twice — once in each — as object
// literals that happened to agree. Naming them does not make the database
// enforce them (payload is jsonb, deliberately, so a new kind needs no
// migration), but it does mean a change here fails to compile there.
// ---------------------------------------------------------------------------

/** choice and survey: the options the room sees, and whether more than one may
 *  be picked. */
export type ChoicePayload = { options: string[]; multi?: boolean; seconds?: number };

/** How long a question stays open, or absent for no clock. In `payload` rather
 *  than a column of its own because the rule for payload is "what the room is
 *  shown", and a countdown is literally on their screen — so it reaches them
 *  through current_item() with no new field anywhere.
 *
 *  The bounds match item_seconds() in the schema, which is where the rule
 *  actually lives: outside this range the server reads it as no clock at all,
 *  so offering a value it would ignore would be offering a timer that silently
 *  is not one. */
export const SECONDS_MIN = 5;
export const SECONDS_MAX = 3600;

/** Read a timer out of a payload the way the server does, so the editor and the
 *  database cannot disagree about whether a question has one. */
export function secondsOf(payload: Record<string, unknown> | undefined): number | null {
  const raw = payload?.seconds;
  const n = typeof raw === 'string' ? Number(raw) : raw;
  if (typeof n !== 'number' || !Number.isInteger(n)) return null;
  return n >= SECONDS_MIN && n <= SECONDS_MAX ? n : null;
}
/** choice: which of those options are correct. Survey has no answer at all —
 *  the server drops one if it is sent, rather than storing a right answer to a
 *  question that did not have one. */
export type ChoiceAnswer = { correct: string[] };

/** match: two columns. `right` is stored shuffled — save_item does it, because
 *  the payload goes to the room and right[i] beside left[i] is the answer laid
 *  out in two columns. */
export type MatchPayload = { left: string[]; right: string[]; seconds?: number };
export type MatchAnswer = { pairs: Record<string, string> };

/** number: closest wins. `unit` is shown to the room so nobody guesses in the
 *  wrong denomination. */
export type NumberPayload = {
  /** an ISO 4217 code — Intl places the symbol wherever the locale puts it */
  currency?: string;
  percent?: boolean;
  /** an Intl unit identifier, or any words at all, in which case it is a plain
   *  suffix — see src/guessFormat.ts */
  unit?: string;
  seconds?: number;
};
export type NumberAnswer = { value: number };

/** rank: `options` is the pool, stored shuffled for the same reason as match. */
export type RankPayload = { options: string[]; seconds?: number };
export type RankAnswer = { order: string[] };

/** Split a textarea into options: one per line, blanks dropped, duplicates
 *  dropped. Duplicates are not a typo to preserve — the tally counts by value,
 *  so two identical options would be one bar in the results and an unwinnable
 *  choice on screen. */
export function parseOptions(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of text.split('\n')) {
    const option = line.trim();
    if (option.length === 0 || seen.has(option)) continue;
    seen.add(option);
    out.push(option);
  }
  return out;
}

/** What is wrong with this question, or null. Checked here so the editor can
 *  say so before the round rather than after — the server rejects the empty
 *  cases too, but it does not know that a choice with one option is a question
 *  with nothing to decide. */
export function problemWith(args: {
  kind: string;
  prompt: string;
  options: string[];
  correct: string[];
  /** match only: the two columns and the pairing so far */
  left?: string[];
  right?: string[];
  pairs?: Record<string, string>;
  /** number only: the value as typed, so "not a number" is distinguishable
   *  from "not filled in yet" */
  value?: string;
  /** game only: the solution word, as typed */
  word?: string;
}): string | null {
  if (args.prompt.trim().length === 0) return 'The question needs some words.';
  if (args.kind === 'open') return null;

  if (args.kind === 'game') {
    const word = (args.word ?? '').trim();
    if (word.length === 0) return 'Give it a word to find.';
    if (!/^[A-Za-z]+$/.test(word)) return 'Letters only.';
    // Three is the shortest that leaves anything to work out; eight is where a
    // six-guess board stops being winnable in a room against a clock.
    if (word.length < 3 || word.length > 8) return 'Between 3 and 8 letters.';
    return null;
  }

  if (args.kind === 'number') {
    if ((args.value ?? '').trim() === '') return 'Give it the value people are guessing at.';
    if (!Number.isFinite(Number(args.value))) return 'That value is not a number.';
    return null;
  }

  if (args.kind === 'match') {
    const left = args.left ?? [];
    const right = args.right ?? [];
    if (left.length === 0) return 'Add the things being matched.';
    if (right.length < 2) return 'Give it at least two things to match them to.';
    const pairs = args.pairs ?? {};
    const unpaired = left.filter((l) => !pairs[l]);
    if (unpaired.length > 0)
      return `Say what ${unpaired[0]} pairs with${
        unpaired.length > 1 ? ` (and ${unpaired.length - 1} more)` : ''
      }.`;
    return null;
  }

  if (args.options.length < 2) return 'Give it at least two options.';
  if (args.kind === 'rank' || args.kind === 'survey') return null;
  if (args.correct.length === 0) return 'Mark which option is correct.';
  if (args.correct.some((c) => !args.options.includes(c)))
    return 'A correct answer is not one of the options.';
  return null;
}
