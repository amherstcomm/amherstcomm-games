// Setting your own avatar, on the account page: a photo, a picture from the
// set on a colour, or your initials.
import { useCallback, useEffect, useRef, useState } from 'react';
import Avatar from '@/Avatar';
import {
  COLORS,
  PRESETS,
  dropPhoto,
  readMyAvatar,
  setMyAvatar,
  uploadAvatarPhoto,
  type Avatar as AvatarData,
} from '@/avatars';

const BUTTON =
  'inline-flex items-center px-4 h-10 rounded-lg text-sm font-semibold bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 hover:text-white transition-colors disabled:opacity-50';

export default function AvatarSettings({ name, user }: { name: string | null; user: string | null }) {
  const [mine, setMine] = useState<{ avatar: AvatarData | null; blocked: boolean; off: boolean } | null>(null);
  const [picking, setPicking] = useState(false);
  const [color, setColor] = useState(COLORS[0]);
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState('');
  const file = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const got = await readMyAvatar();
    if (got.ok) {
      setMine({ avatar: got.avatar, blocked: got.blocked, off: got.off });
      if (got.avatar?.kind === 'preset' && got.avatar.color) setColor(got.avatar.color);
    }
  }, []);
  useEffect(() => void load(), [load]);

  if (!mine) return null;
  const locked = mine.blocked || mine.off;

  async function run(work: () => Promise<{ ok: boolean; reason?: string }>, done: string) {
    setBusy(true);
    setSaid('');
    const res = await work();
    setBusy(false);
    setSaid(res.ok ? done : (res.reason ?? 'That did not work'));
    if (res.ok) {
      setPicking(false);
      await load();
    }
  }

  return (
    <div data-avatar>
      <p className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Avatar</p>
      <div className="flex flex-wrap items-center gap-4">
        <Avatar avatar={mine.blocked ? null : mine.avatar} name={name} seed={user} size="lg" />
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-xs text-slate-400">
            {mine.blocked
              ? 'An organiser has turned off your avatar, so you show as your initials.'
              : mine.off
                ? 'Avatars are switched off for the site just now, so everybody shows as their initials.'
                : 'Shown beside your answers in trivia that shows who picked what. Without one, you are your initials.'}
          </p>
          {!locked && (
            <div className="flex flex-wrap gap-2">
              <button type="button" className={BUTTON} disabled={busy} onClick={() => file.current?.click()}>
                {busy ? 'Saving…' : 'Upload a photo'}
              </button>
              <button type="button" className={BUTTON} disabled={busy} onClick={() => setPicking((p) => !p)}
                      aria-expanded={picking}>
                Pick a picture
              </button>
              {mine.avatar && (
                <button type="button" className={BUTTON} disabled={busy}
                        onClick={() => void run(async () => {
                          const res = await setMyAvatar(null);
                          if (res.ok) await dropPhoto(mine.avatar);
                          return res;
                        }, 'Back to your initials.')}>
                  Use my initials
                </button>
              )}
            </div>
          )}
          <input ref={file} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
                 aria-label="Avatar photo"
                 onChange={(e) => {
                   const f = e.target.files?.[0];
                   e.target.value = '';
                   if (f) void run(() => uploadAvatarPhoto(f, mine.avatar), 'Photo saved.');
                 }} />
        </div>
      </div>

      {picking && !locked && (
        <div className="mt-3 space-y-3 rounded-xl border border-white/10 p-3">
          <fieldset>
            <legend className="text-xs text-slate-400 mb-1">Colour</legend>
            <div className="flex flex-wrap gap-2">
              {COLORS.map((c) => (
                <button key={c} type="button" aria-label={`Colour ${c}`} aria-pressed={color === c}
                        onClick={() => setColor(c)}
                        className={`w-7 h-7 rounded-full border-2 ${color === c ? 'border-white' : 'border-transparent'}`}
                        style={{ background: c }} />
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="text-xs text-slate-400 mb-1">Picture</legend>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(2.75rem,1fr))] gap-2">
              {PRESETS.map((p) => (
                <button key={p.id} type="button" aria-label={p.label} disabled={busy}
                        aria-pressed={mine.avatar?.kind === 'preset' && mine.avatar.value === p.id}
                        onClick={() => void run(async () => {
                          const res = await setMyAvatar({ kind: 'preset', value: p.id, color });
                          if (res.ok) await dropPhoto(mine.avatar);
                          return res;
                        }, `${p.label} it is.`)}
                        className={`h-11 rounded-full text-xl flex items-center justify-center hover:ring-2 hover:ring-white/60
                          ${mine.avatar?.kind === 'preset' && mine.avatar.value === p.id ? 'ring-2 ring-white' : ''}`}
                        style={{ background: color }}>
                  <span aria-hidden="true">{p.emoji}</span>
                </button>
              ))}
            </div>
          </fieldset>
        </div>
      )}
      {said && <p className="mt-2 text-xs text-slate-400" role="status">{said}</p>}
    </div>
  );
}
