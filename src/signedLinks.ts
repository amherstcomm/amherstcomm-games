// Signed links for pictures in a private bucket, asked for together: a page
// drawing thirty avatars, or a strip of cards, is one request rather than
// thirty. Each link is good for an hour and kept for a little less.
import { supabase } from '@/supabase';

export function signedLinker(bucket: string): (path: string) => Promise<string | null> {
  const links = new Map<string, { url: string; until: number }>();
  let queued = new Set<string>();
  let waiting: Promise<void> | null = null;

  const flush = (): Promise<void> => {
    waiting ??= new Promise<void>((done) => {
      queueMicrotask(async () => {
        const want = [...queued];
        queued = new Set();
        waiting = null;
        if (supabase && want.length > 0) {
          const { data } = await supabase.storage.from(bucket).createSignedUrls(want, 3600);
          for (const d of data ?? []) {
            if (d.path && d.signedUrl) links.set(d.path, { url: d.signedUrl, until: Date.now() + 3300_000 });
          }
        }
        done();
      });
    });
    return waiting;
  };

  return async (path: string) => {
    const have = links.get(path);
    if (have && have.until > Date.now()) return have.url;
    queued.add(path);
    await flush();
    const got = links.get(path)?.url ?? null;
    // Only a link an <img> can safely be pointed at, as with contest photos.
    return got && /^(https:|blob:)/.test(got) ? got : null;
  };
}

/** A picture cropped to `width` by `height` from its middle, and written as
 *  webp (or jpeg, for a browser that cannot write webp): whatever the camera
 *  made, a few tens of kilobytes. */
export async function cropped(file: File, width: number, height: number): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const want = width / height;
  const have = bitmap.width / bitmap.height;
  const sw = have > want ? bitmap.height * want : bitmap.width;
  const sh = have > want ? bitmap.height : bitmap.width / want;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no canvas');
  ctx.drawImage(bitmap, (bitmap.width - sw) / 2, (bitmap.height - sh) / 2, sw, sh, 0, 0, width, height);
  bitmap.close?.();
  const webp = await new Promise<Blob | null>((done) => canvas.toBlob(done, 'image/webp', 0.85));
  if (webp && webp.type === 'image/webp') return webp;
  const jpeg = await new Promise<Blob | null>((done) => canvas.toBlob(done, 'image/jpeg', 0.85));
  if (!jpeg) throw new Error('could not encode');
  return jpeg;
}
