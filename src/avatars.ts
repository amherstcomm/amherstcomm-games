// Avatars: a photo of your own, or a picture from the set on a colour, or --
// with neither, or taken down by an organiser, or with avatars switched off
// for the site -- your initials. The server decides which of those anybody
// sees (avatar_json); this draws what it says.
//
// Photos are in a private bucket and read through signed links, asked for in
// one batch for however many avatars a screen is about to draw.
import { supabase } from '@/supabase';
import { cropped, signedLinker } from '@/signedLinks';

export type Avatar = { kind: 'photo' | 'preset'; value: string; color: string | null };

/** Pictures to pick from, by the name the server stores. */
export const PRESETS: { id: string; emoji: string; label: string }[] = [
  { id: 'badger', emoji: '🦡', label: 'Badger' },
  { id: 'cow', emoji: '🐄', label: 'Cow' },
  { id: 'llama', emoji: '🦙', label: 'Llama' },
  { id: 'cheese', emoji: '🧀', label: 'Cheese' },
  { id: 'fox', emoji: '🦊', label: 'Fox' },
  { id: 'owl', emoji: '🦉', label: 'Owl' },
  { id: 'cat', emoji: '🐱', label: 'Cat' },
  { id: 'dog', emoji: '🐶', label: 'Dog' },
  { id: 'bear', emoji: '🐻', label: 'Bear' },
  { id: 'panda', emoji: '🐼', label: 'Panda' },
  { id: 'koala', emoji: '🐨', label: 'Koala' },
  { id: 'tiger', emoji: '🐯', label: 'Tiger' },
  { id: 'lion', emoji: '🦁', label: 'Lion' },
  { id: 'frog', emoji: '🐸', label: 'Frog' },
  { id: 'monkey', emoji: '🐵', label: 'Monkey' },
  { id: 'penguin', emoji: '🐧', label: 'Penguin' },
  { id: 'octopus', emoji: '🐙', label: 'Octopus' },
  { id: 'turtle', emoji: '🐢', label: 'Turtle' },
  { id: 'unicorn', emoji: '🦄', label: 'Unicorn' },
  { id: 'bee', emoji: '🐝', label: 'Bee' },
  { id: 'butterfly', emoji: '🦋', label: 'Butterfly' },
  { id: 'whale', emoji: '🐳', label: 'Whale' },
  { id: 'rabbit', emoji: '🐰', label: 'Rabbit' },
  { id: 'hedgehog', emoji: '🦔', label: 'Hedgehog' },
  { id: 'otter', emoji: '🦦', label: 'Otter' },
  { id: 'sloth', emoji: '🦥', label: 'Sloth' },
  { id: 'pizza', emoji: '🍕', label: 'Pizza' },
  { id: 'taco', emoji: '🌮', label: 'Taco' },
  { id: 'pretzel', emoji: '🥨', label: 'Pretzel' },
  { id: 'coffee', emoji: '☕', label: 'Coffee' },
  { id: 'rocket', emoji: '🚀', label: 'Rocket' },
  { id: 'star', emoji: '⭐', label: 'Star' },
  { id: 'rainbow', emoji: '🌈', label: 'Rainbow' },
  { id: 'cactus', emoji: '🌵', label: 'Cactus' },
  { id: 'mushroom', emoji: '🍄', label: 'Mushroom' },
  { id: 'ghost', emoji: '👻', label: 'Ghost' },
  { id: 'robot', emoji: '🤖', label: 'Robot' },
  { id: 'alien', emoji: '👽', label: 'Alien' },
  { id: 'wizard', emoji: '🧙', label: 'Wizard' },
  { id: 'crown', emoji: '👑', label: 'Crown' },
  { id: 'trophy', emoji: '🏆', label: 'Trophy' },
  { id: 'baseball', emoji: '⚾', label: 'Baseball' },
  { id: 'football', emoji: '🏈', label: 'Football' },
  { id: 'guitar', emoji: '🎸', label: 'Guitar' },
  { id: 'phone', emoji: '☎️', label: 'Telephone' },
];

/** Backgrounds for a picture, and for initials. Mid-tones, so white initials
 *  and a coloured emoji both read on them in either theme. */
export const COLORS = [
  '#2563eb', '#0891b2', '#059669', '#65a30d', '#ca8a04',
  '#ea580c', '#dc2626', '#db2777', '#9333ea', '#475569',
];

export const presetEmoji = (id: string) => PRESETS.find((p) => p.id === id)?.emoji ?? '🙂';

/** Up to two letters of a name: the first of the first and last words. */
export function initials(name: string | null | undefined): string {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  const first = [...words[0]][0] ?? '';
  const last = words.length > 1 ? ([...words[words.length - 1]][0] ?? '') : '';
  return (first + last).toUpperCase();
}

/** The same colour for the same person every time, from their id. */
export function colorFor(seed: string | null | undefined): string {
  let h = 0;
  for (const ch of seed ?? '') h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return COLORS[h % COLORS.length];
}

type Answer<T = object> = ({ ok: true } & T) | { ok: false; reason: string };

async function call<T = object>(fn: string, args?: Record<string, unknown>): Promise<Answer<T>> {
  if (!supabase) return { ok: false, reason: 'not connected' };
  const { data, error } = await supabase.rpc(fn, args);
  if (error) return { ok: false, reason: error.message };
  // An array, or anything else that is not one of our answers, is no answer:
  // a stub or an older database, and a page should not trust its fields.
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { ok: false, reason: 'no answer' };
  const d = data as { ok?: boolean; reason?: string };
  return d.ok === false ? { ok: false, reason: d.reason ?? 'refused' } : ({ ok: true, ...(data as T) } as Answer<T>);
}

export const readMyAvatar = () =>
  call<{ avatar: Avatar | null; blocked: boolean; off: boolean }>('my_avatar');

export const setMyAvatar = (avatar: { kind: 'preset' | 'photo'; value: string; color?: string | null } | null) =>
  call('set_my_avatar', {
    p_kind: avatar?.kind ?? null,
    p_value: avatar?.value ?? null,
    p_color: avatar?.color ?? null,
  });

/** An organiser taking someone's avatar down and stopping them setting
 *  another, or allowing them again. */
export const setPersonAvatar = (user: string, blocked: boolean) =>
  call('set_person_avatar', { p_user: user, p_blocked: blocked });

export type Pick = { option: string; user: string; name: string | null; avatar: Avatar | null };

/** Who picked what on a choice question, in a trivia set to show it. */
export const readItemAvatars = (item: string) =>
  call<{ picks: Pick[]; anonymous: number }>('item_avatars', { p_item: item });

// ---------------------------------------------------------------------------
// Photos
// ---------------------------------------------------------------------------

export const BUCKET = 'avatars';
const SIDE = 256;

/** Upload a photo and make it your avatar. The previous photo, if there was
 *  one, is taken down after. */
export async function uploadAvatarPhoto(file: File, previous: Avatar | null): Promise<Answer> {
  if (!supabase) return { ok: false, reason: 'not connected' };
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    return { ok: false, reason: 'A JPEG, PNG or WebP photo, please.' };
  }
  if (file.size > 20 * 1024 * 1024) return { ok: false, reason: 'That photo is over 20 MB.' };
  const { data: u } = await supabase.auth.getUser();
  const uid = u.user?.id;
  if (!uid) return { ok: false, reason: 'not signed in' };
  let blob: Blob;
  try {
    blob = await cropped(file, SIDE, SIDE);
  } catch {
    return { ok: false, reason: 'That photo could not be read.' };
  }
  const ext = blob.type === 'image/webp' ? 'webp' : 'jpg';
  const path = `${uid}/avatar-${crypto.randomUUID()}.${ext}`;
  const up = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: blob.type, upsert: false });
  if (up.error) return { ok: false, reason: up.error.message };
  const set = await setMyAvatar({ kind: 'photo', value: path });
  if (!set.ok) {
    void supabase.storage.from(BUCKET).remove([path]);
    return set;
  }
  if (previous?.kind === 'photo') void supabase.storage.from(BUCKET).remove([previous.value]);
  return { ok: true };
}

/** Back to initials, or to a picture from the set, taking a photo down. */
export async function dropPhoto(previous: Avatar | null): Promise<void> {
  if (supabase && previous?.kind === 'photo') await supabase.storage.from(BUCKET).remove([previous.value]);
}

/** A drawable link for a photo path, or null while it cannot be had. */
export const photoLink = signedLinker(BUCKET);
