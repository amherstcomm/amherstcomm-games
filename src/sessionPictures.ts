// Pictures in a session's questions -- a comparison's picture rows (the survey
// spec, November 2026). A private bucket: uploaded by whoever builds sessions,
// into their own folder, and read by anybody signed in through a link that
// expires. The same shape as the auction pictures.
import { supabase } from '@/supabase';
import { signedLinker } from '@/signedLinks';

export const BUCKET = 'session-pictures';
export const sessionPictureLink = signedLinker(BUCKET);

const TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const PICTURE_ACCEPT = TYPES.join(',');

/** Into the uploader's own folder, which is what the bucket's policy checks. */
export async function uploadSessionPicture(file: File): Promise<{ ok: true; path: string } | { ok: false; reason: string }> {
  if (!supabase) return { ok: false, reason: 'not connected' };
  if (!TYPES.includes(file.type)) return { ok: false, reason: 'A JPEG, PNG or WebP picture, please.' };
  if (file.size > 10 * 1024 * 1024) return { ok: false, reason: 'That picture is over 10 MB.' };
  const { data: u } = await supabase.auth.getUser();
  const uid = u.user?.id;
  if (!uid) return { ok: false, reason: 'not signed in' };
  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
  const path = `${uid}/compare-${crypto.randomUUID()}.${ext}`;
  const up = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false });
  if (up.error) return { ok: false, reason: up.error.message };
  return { ok: true, path };
}
