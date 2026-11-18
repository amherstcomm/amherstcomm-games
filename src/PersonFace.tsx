// Somebody's picture on a board, as a button: hover it (or tap it, on a phone)
// and it grows, with a card above it showing the picture large and their
// name. Tapped, the card stays, and carries what the reader may do about it --
// an organiser's "take the answer down", an administrator's "take the picture
// down", and for anybody else "report this picture".
//
// The card is kept on the screen: near either edge it slides inward rather
// than hanging off it, which on a phone would make the page scroll sideways.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import Avatar from '@/Avatar';
import { reportAvatar, setPersonAvatar, type Avatar as AvatarData } from '@/avatars';

const EDGE = 8;

export default function PersonFace({
  user,
  name,
  avatar,
  actions,
}: {
  user: string;
  name: string;
  avatar: AvatarData | null;
  /** what the card offers once tapped; handed a way to close it */
  actions?: (close: () => void) => ReactNode;
}) {
  const [hover, setHover] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [shift, setShift] = useState(0);
  const wrap = useRef<HTMLSpanElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const open = hover || pinned;

  // Measured before it paints, so it never shows hanging off the edge.
  useLayoutEffect(() => {
    if (!open || !card.current) {
      setShift(0);
      return;
    }
    const r = card.current.getBoundingClientRect();
    const left = r.left - shift;
    const right = r.right - shift;
    let dx = 0;
    if (left < EDGE) dx = EDGE - left;
    else if (right > window.innerWidth - EDGE) dx = window.innerWidth - EDGE - right;
    if (dx !== shift) setShift(dx);
    // shift is what this sets; measuring again on it would chase itself
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // A tapped card closes on a tap anywhere else, or Escape.
  useEffect(() => {
    if (!pinned) return;
    const away = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) {
        setPinned(false);
        setHover(false);
      }
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPinned(false);
        setHover(false);
      }
    };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [pinned]);

  const close = () => {
    setPinned(false);
    setHover(false);
  };

  return (
    <span ref={wrap} className="relative inline-flex"
          onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <button
        type="button"
        aria-label={name}
        aria-expanded={pinned}
        onFocus={() => setHover(true)}
        onBlur={() => !pinned && setHover(false)}
        onClick={() => {
          if (pinned) close();
          else setPinned(true);
        }}
        className={`rounded-full transition-transform duration-150 motion-reduce:transition-none ${
          open ? 'scale-125 relative z-10' : ''
        }`}
      >
        <Avatar avatar={avatar} name={name} seed={user} size="md" />
      </button>
      {open && (
        <div
          ref={card}
          role={pinned ? 'dialog' : 'tooltip'}
          aria-label={name}
          style={{ transform: `translateX(calc(-50% + ${shift}px))` }}
          className={`absolute left-1/2 bottom-full mb-3 z-30 w-48 rounded-xl border border-white/15 bg-slate-900 p-3 shadow-2xl
                      flex flex-col items-center gap-2 text-center ${pinned ? '' : 'pointer-events-none'}`}
        >
          <Avatar avatar={avatar} name={name} seed={user} size="xl" />
          <p className="text-sm font-semibold text-white break-words">{name}</p>
          {pinned && actions && <div className="flex flex-col items-center gap-1">{actions(close)}</div>}
        </div>
      )}
    </span>
  );
}

// --- doing something about a picture -------------------------------------------

const ACTION = 'text-xs font-semibold hover:underline';

/** For a picture, not initials: an administrator takes it down, anybody else
 *  reports it. Nothing for somebody showing initials -- there is nothing to
 *  object to. */
export function PictureActions({ user, name, avatar, admin, close, onTakenDown }: {
  user: string;
  name: string;
  avatar: AvatarData | null;
  admin: boolean;
  close: () => void;
  onTakenDown?: () => void;
}) {
  if (!avatar) return null;
  if (admin) {
    return (
      <button type="button" className={`${ACTION} text-rose-300`}
              onClick={async () => {
                if (!window.confirm(`Take ${name}’s picture down? They will not be able to set another until you allow it on the people page.`)) return;
                const res = await setPersonAvatar(user, true);
                close();
                if (!res.ok) return window.alert(res.reason ?? 'That did not work');
                onTakenDown?.();
              }}>
        Take the picture down
      </button>
    );
  }
  return (
    <button type="button" className={`${ACTION} text-slate-300`}
            onClick={async () => {
              const why = window.prompt(`What is wrong with ${name}’s picture? (optional) It goes to the site’s administrators, and your name is not shown to anybody.`);
              if (why === null) return;
              const res = await reportAvatar(user, why.trim() || null);
              close();
              window.alert(res.ok ? 'Reported. Thank you; an administrator will look at it.' : (res.reason ?? 'That did not go in'));
            }}>
      Report this picture
    </button>
  );
}
