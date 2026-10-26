// Drawing an avatar: a photo, a picture on its colour, or initials.
import { useEffect, useState } from 'react';
import { colorFor, initials, photoLink, presetEmoji, type Avatar as AvatarData, type Pick } from '@/avatars';

const SIZE = { sm: 'w-7 h-7 text-[11px]', md: 'w-10 h-10 text-sm', lg: 'w-16 h-16 text-2xl' } as const;
const EMOJI = { sm: 'text-sm', md: 'text-xl', lg: 'text-4xl' } as const;

export default function Avatar({
  avatar,
  name,
  seed,
  size = 'md',
  className = '',
}: {
  avatar: AvatarData | null;
  name: string | null;
  /** what picks the initials' colour: the person's id */
  seed?: string | null;
  size?: keyof typeof SIZE;
  className?: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const photo = avatar?.kind === 'photo' ? avatar.value : null;
  useEffect(() => {
    let alive = true;
    setUrl(null);
    if (photo) void photoLink(photo).then((u) => alive && setUrl(u));
    return () => {
      alive = false;
    };
  }, [photo]);

  const base = `inline-flex items-center justify-center rounded-full shrink-0 overflow-hidden select-none ${SIZE[size]} ${className}`;
  if (photo && url) {
    return <img src={url} alt="" className={`${base} object-cover bg-white/10`} />;
  }
  if (avatar?.kind === 'preset') {
    return (
      <span aria-hidden="true" className={base} style={{ background: avatar.color ?? colorFor(seed) }}>
        <span className={EMOJI[size]}>{presetEmoji(avatar.value)}</span>
      </span>
    );
  }
  return (
    <span aria-hidden="true" className={`${base} font-semibold text-white`} style={{ background: colorFor(seed ?? name) }}>
      {initials(name)}
    </span>
  );
}

/** The people who picked one answer, overlapped, with a count past the first
 *  few. Named in full for a screen reader and on hover. */
export function AvatarStack({ picks, max = 8 }: { picks: Pick[]; max?: number }) {
  if (picks.length === 0) return null;
  const shown = picks.slice(0, max);
  const more = picks.length - shown.length;
  const names = picks.map((p) => p.name ?? 'Somebody').join(', ');
  return (
    <span className="flex items-center" role="img" aria-label={`Picked by ${names}`} title={names}
          // overlapped on purpose, a stack of faces
          data-joined>
      {shown.map((p, i) => (
        <Avatar key={p.user} avatar={p.avatar} name={p.name} seed={p.user} size="sm"
                className={`ring-2 ring-ink ${i > 0 ? '-ml-2' : ''}`} />
      ))}
      {more > 0 && <span className="ml-1 text-xs text-slate-300 tabular-nums">+{more}</span>}
    </span>
  );
}
