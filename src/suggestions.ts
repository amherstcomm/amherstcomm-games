// Suggestion boxes: one per person, like the boxes outside the CEO's and COO's
// doors. The server holds the rules (suggestions.sql): only a box's readers
// read it, and an anonymous suggestion is stored with nothing leading back to
// its sender -- what brings it back is a key this file keeps for them.
import { supabase } from '@/supabase';
import { store } from '@/siteStorage';
import type { Avatar } from '@/avatars';

export type Reader = { user: string; name: string; avatar: Avatar | null };
export type Box = { id: string; name: string; blurb: string | null; readers: Reader[] };

export type Message = {
  id: string;
  author: 'reader' | 'sender';
  body: string;
  public: boolean;
  at: string;
  /** the reader who wrote it; never a sender */
  by: string | null;
};

export type BoardItem = {
  id: string;
  box: string;
  body: string;
  sent_at: string;
  at: string;
  replies: { body: string; at: string; by: string | null }[];
};

export type Page = {
  ok: boolean;
  reason?: string;
  can_set_up?: boolean;
  reads?: boolean;
  boxes?: Box[];
  board?: BoardItem[];
};

export type Mine = {
  id: string;
  box: string;
  body: string;
  at: string;
  anonymous: boolean;
  key: string | null;
  read: boolean;
  thread: Message[];
};

export type InboxItem = {
  id: string;
  body: string;
  at: string;
  from: string | null;
  anonymous: boolean;
  read: boolean;
  archived: boolean;
  thread: Message[];
};
export type InboxBox = { id: string; name: string; suggestions: InboxItem[] };

export type SetupBox = {
  id: string;
  name: string;
  blurb: string | null;
  active: boolean;
  position: number;
  readers: { user: string; name: string }[];
  count: number;
};

type Answer<T = object> = ({ ok: true } & T) | { ok: false; reason?: string };

async function call<T = object>(fn: string, args?: Record<string, unknown>): Promise<Answer<T>> {
  if (!supabase) return { ok: false, reason: 'not connected' };
  const { data, error } = await supabase.rpc(fn, args);
  if (error) return { ok: false, reason: error.message };
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { ok: false, reason: 'no answer' };
  return data as Answer<T>;
}

// --- keys for anonymous suggestions --------------------------------------------
//
// The key is the only thing that ties an anonymous suggestion to the person who
// left it, and the server never has it -- only its hash. So it lives here, in
// this browser (as the privacy setting allows), and in the link the sender is
// offered to keep. The link carries it after a #, which a browser never sends
// to a server, so it is not in anybody's access log either.

const KEYS = 'anagrimoire:suggestion-keys:v1';
const KEY_SHAPE = /^[0-9a-f]{64}$/;

export function keptKeys(): string[] {
  try {
    const raw = store.getItem(KEYS);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(list) ? list.filter((k): k is string => typeof k === 'string' && KEY_SHAPE.test(k)) : [];
  } catch {
    return [];
  }
}

export function keepKey(key: string): void {
  if (!KEY_SHAPE.test(key)) return;
  const keys = keptKeys();
  if (keys.includes(key)) return;
  try {
    store.setItem(KEYS, JSON.stringify([...keys, key]));
  } catch {
    // not kept: the link is the way back
  }
}

/** The private link back to an anonymous suggestion. */
export const keyLink = (key: string) => `${window.location.origin}/suggestions#key=${key}`;

/** A key arriving in the address, kept and then taken out of it, so it is not
 *  left in the address bar for whoever looks next. */
export function takeKeyFromAddress(): void {
  const m = window.location.hash.match(/key=([0-9a-f]{64})/);
  if (!m) return;
  keepKey(m[1]);
  window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search);
}

// --- calls ----------------------------------------------------------------------

export async function readPage(): Promise<Page> {
  return (await call<Page>('suggestion_page')) as Page;
}
export const readMine = () => call<{ suggestions: Mine[] }>('my_suggestions', { p_keys: keptKeys() });
export const readInbox = () => call<{ boxes: InboxBox[] }>('suggestion_inbox');

export async function readUnread(): Promise<number> {
  if (!supabase) return 0;
  const { data, error } = await supabase.rpc('suggestions_unread');
  return error || typeof data !== 'number' ? 0 : data;
}

export async function submit(box: string, body: string, anonymous: boolean) {
  const res = await call<{ id: string; key: string | null }>('submit_suggestion', {
    p_box: box,
    p_body: body,
    p_anonymous: anonymous,
  });
  if (res.ok && res.key) keepKey(res.key);
  return res;
}

export const followUp = (id: string, key: string | null, body: string) =>
  call('suggestion_follow_up', { p_id: id, p_key: key, p_body: body });
export const reply = (id: string, body: string, isPublic: boolean) =>
  call('reply_to_suggestion', { p_id: id, p_body: body, p_public: isPublic });
export const markSuggestion = (id: string, read: boolean | null, archived: boolean | null = null) =>
  call('mark_suggestion', { p_id: id, p_read: read, p_archived: archived });
export const deleteSuggestion = (id: string) => call('delete_suggestion', { p_id: id });
export const setReply = (message: string, isPublic: boolean | null, remove = false) =>
  call('set_suggestion_reply', { p_message: message, p_public: isPublic, p_delete: remove });

export const readSetup = () => call<{ boxes: SetupBox[] }>('suggestion_boxes_sheet');
export const saveBox = (b: { id: string | null; name: string; blurb: string; readers: string[]; active: boolean; position: number }) =>
  call<{ id: string }>('save_suggestion_box', {
    p_id: b.id,
    p_name: b.name,
    p_blurb: b.blurb || null,
    p_readers: b.readers,
    p_active: b.active,
    p_position: b.position,
  });
export const deleteBox = (id: string) => call('delete_suggestion_box', { p_id: id });

export const when = (at: string) =>
  new Date(at).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
