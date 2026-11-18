// The shell: the bar across the top of every page, and on a phone a bar at the
// top and a row of tabs at the bottom (the layout spec, November 2026).
//
// Desktop: the logo, which goes home; Today, Games, Together, Events and
// Boards; and on the right, Join a session, the admin menu for those who have
// one, and the avatar menu. A phone: the logo, the page's name (a tap on it
// switches game when there is one to switch), the avatar; and Today, Games,
// Together, Events and Me along the bottom, each but Today opening a sheet.
//
// App decides what is in each menu -- what is switched on, what is running,
// who may see what -- and hands the lists here. A menu with nothing in it is
// not drawn, rather than drawn empty or greyed: Events with nothing on is not
// a section of the site that week.
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { CalendarDays, ChevronDown, Gamepad2, Settings as Gear, Sparkles, UserRound, Users, X } from 'lucide-react';
import RouteLink from '@/RouteLink';
import Avatar from '@/Avatar';
import GameTile from '@/GameTile';
import type { Avatar as AvatarData } from '@/avatars';
import type { Slug } from '@/games';

export type Go = { to: string; onGo: () => void };

export type BarItem = {
  key: string;
  label: string;
  go: Go;
  icon?: ReactNode;
  /** a game's tile in place of an icon */
  tile?: Slug;
  /** a count of what waits there, shown as a badge */
  badge?: number;
  /** what the badge counts, for a screen reader */
  badgeWhat?: string;
  /** today's state of a game, said in a word as well as a dot */
  status?: 'done' | 'started' | 'none';
  /** a line under the label */
  note?: string;
};

export type Section = 'today' | 'games' | 'together' | 'events' | 'boards' | null;

export type BarProps = {
  siteName: string;
  home: Go;
  boards: Go;
  current: Section;
  /** the page's name, for the phone's bar */
  title: string;
  /** whether a tap on the phone's title opens the game switcher */
  titleSwitchesGame: boolean;
  games: BarItem[];
  together: BarItem[];
  events: BarItem[];
  admin: BarItem[];
  me: BarItem[];
  join: Go | null;
  /** signed out: the way in, in place of the avatar */
  signIn: Go | null;
  you: { avatar: AvatarData | null; name: string; seed: string } | null;
  /** a tournament holding the site: no way out to the games but its own */
  locked: boolean;
};

const STATUS_WORD = { done: 'Done', started: 'In progress', none: '' } as const;
const STATUS_DOT = { done: 'bg-emerald-400', started: 'bg-amber-400', none: 'bg-slate-700' } as const;

const total = (items: BarItem[]) => items.reduce((n, i) => n + (i.badge ?? 0), 0);

export function Badge({ n, what }: { n: number; what?: string }) {
  if (n <= 0) return null;
  return (
    // Fixed colours: a badge is the same red in either theme; white on it is 6.6:1.
    <span className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full text-[11px] font-bold leading-none tabular-nums"
          style={{ background: '#be123c', color: '#ffffff' }}>
      {n > 99 ? '99+' : n}
      {what && <span className="sr-only"> {what}</span>}
    </span>
  );
}

function ItemRow({ item, onPick }: { item: BarItem; onPick: () => void }) {
  return (
    <RouteLink
      to={item.go.to}
      onGo={() => {
        onPick();
        item.go.onGo();
      }}
      className="flex items-center gap-3 rounded-lg px-3 py-2 min-h-11 text-sm text-slate-200 hover:bg-white/10"
    >
      {item.tile ? <GameTile slug={item.tile} size="sm" /> : item.icon && (
        <span className="w-7 h-7 shrink-0 inline-flex items-center justify-center text-slate-400" aria-hidden="true">{item.icon}</span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate">{item.label}</span>
        {item.note && <span className="block text-xs text-slate-400 truncate">{item.note}</span>}
      </span>
      {item.status && (
        <span className="flex items-center gap-1.5 shrink-0 text-xs text-slate-400">
          {STATUS_WORD[item.status]}
          <span className={`w-2 h-2 rounded-full ${STATUS_DOT[item.status]}`} aria-hidden="true" />
        </span>
      )}
      <Badge n={item.badge ?? 0} what={item.badgeWhat} />
    </RouteLink>
  );
}

/** Close on a click or tap outside, or Escape, while open. */
function useDismiss(open: boolean, close: () => void, inside: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!inside.current?.contains(e.target as Node)) close();
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open, close, inside]);
}

/** A button that opens a list of links beneath it. A disclosure rather than an
 *  ARIA menu: the items are ordinary links, reached with Tab. */
function DropMenu({ label, items, active, align = 'left', button, extra }: {
  label: string;
  items: BarItem[];
  active: boolean;
  align?: 'left' | 'right';
  button?: ReactNode;
  extra?: BarItem;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const id = useId();
  useDismiss(open, () => setOpen(false), wrap);
  if (items.length === 0) return null;
  const waiting = total(items);
  return (
    <div ref={wrap} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        aria-label={button ? label : undefined}
        onClick={() => setOpen((o) => !o)}
        className={button ? 'rounded-full' : `inline-flex items-center gap-1.5 h-10 px-3 rounded-lg text-sm font-medium transition-colors ${
          active ? 'bg-white/10 text-white' : 'text-slate-300 hover:text-white hover:bg-white/5'
        }`}
      >
        {button ?? (
          <>
            {label}
            <Badge n={waiting} what="waiting" />
            <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
          </>
        )}
      </button>
      {open && (
        <div id={id}
             className={`absolute top-full mt-2 z-50 w-72 max-h-[70vh] overflow-y-auto rounded-xl border border-white/15 bg-slate-900 p-1.5 shadow-2xl ${
               align === 'right' ? 'right-0' : 'left-0'
             }`}>
          <ul aria-label={label}>
            {items.map((i) => (
              <li key={i.key}>
                <ItemRow item={i} onPick={() => setOpen(false)} />
              </li>
            ))}
          </ul>
          {extra && (
            <div className="mt-1 pt-1 border-t border-white/10">
              <ItemRow item={extra} onPick={() => setOpen(false)} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function YouButton({ you }: { you: NonNullable<BarProps['you']> }) {
  return (
    <span className="inline-flex rounded-full ring-1 ring-white/15">
      <Avatar avatar={you.avatar} name={you.name} seed={you.seed} size="md" />
    </span>
  );
}

/** A phone's sheet: the same list, up from the bottom. */
function Sheet({ title, items, extra, onClose }: { title: string; items: BarItem[]; extra?: BarItem; onClose: () => void }) {
  const panel = useRef<HTMLDivElement>(null);
  useDismiss(true, onClose, panel);
  useEffect(() => {
    panel.current?.querySelector<HTMLElement>('a, button')?.focus();
  }, []);
  return (
    <div className="md:hidden fixed inset-0 z-[55] bg-black/50" role="presentation">
      <div ref={panel} role="dialog" aria-modal="true" aria-label={title}
           className="absolute inset-x-0 bottom-0 max-h-[80vh] overflow-y-auto rounded-t-2xl border-t border-white/15 bg-slate-900 p-3 pb-6 shadow-2xl">
        <div className="flex items-center justify-between px-2 pb-2">
          <h2 className="text-sm font-semibold text-white">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close"
                  className="w-10 h-10 inline-flex items-center justify-center rounded-lg text-slate-400 hover:bg-white/10">
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>
        <ul aria-label={title}>
          {items.map((i) => (
            <li key={i.key}>
              <ItemRow item={i} onPick={onClose} />
            </li>
          ))}
        </ul>
        {extra && (
          <div className="mt-1 pt-1 border-t border-white/10">
            <ItemRow item={extra} onPick={onClose} />
          </div>
        )}
      </div>
    </div>
  );
}

type Tab = 'games' | 'together' | 'events' | 'me';

export default function SiteBar(p: BarProps) {
  const [sheet, setSheet] = useState<Tab | null>(null);
  const boardsItem: BarItem = { key: 'boards', label: 'All the boards', go: p.boards, icon: <Sparkles className="w-4 h-4" /> };
  const meItems: BarItem[] = [
    ...(p.join ? [{ key: 'join', label: 'Join a session', go: p.join, icon: <Users className="w-4 h-4" /> }] : []),
    ...(p.signIn ? [{ key: 'sign-in', label: 'Sign in', go: p.signIn }] : []),
    ...p.me,
    ...p.admin,
  ];
  const games = p.locked ? [] : p.games;
  const navLink = (active: boolean) =>
    `inline-flex items-center h-10 px-3 rounded-lg text-sm font-medium transition-colors ${
      active ? 'bg-white/10 text-white' : 'text-slate-300 hover:text-white hover:bg-white/5'
    }`;

  return (
    <>
      {/* ---- desktop ---- */}
      <header className="hidden md:block sticky top-0 z-40 h-16 bg-slate-950/90 backdrop-blur border-b border-white/10">
        <div className="max-w-[82rem] mx-auto h-full px-5 flex items-center gap-6">
          <RouteLink {...p.home} label={`${p.siteName}, home`} className="flex items-center gap-2.5 shrink-0 rounded-lg">
            <img src="/mark.svg" alt="" width={500} height={500} className="w-8 h-8" />
            <span className="text-base font-bold text-white whitespace-nowrap">{p.siteName}</span>
          </RouteLink>
          <nav aria-label="Site" className="flex items-center gap-1 min-w-0">
            <RouteLink {...p.home} className={navLink(p.current === 'today')}>Today</RouteLink>
            <DropMenu label="Games" items={games} active={p.current === 'games'} extra={boardsItem} />
            <DropMenu label="Together" items={p.together} active={p.current === 'together'} />
            <DropMenu label="Events" items={p.events} active={p.current === 'events'} />
            {!p.locked && <RouteLink {...p.boards} className={navLink(p.current === 'boards')}>Boards</RouteLink>}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            {p.join && (
              <RouteLink {...p.join}
                         className="inline-flex items-center h-10 px-4 rounded-lg border border-white/20 text-sm font-semibold text-white hover:bg-white/5">
                Join a session
              </RouteLink>
            )}
            <DropMenu label="Admin" items={p.admin} active={false} align="right"
                      button={<span className="w-10 h-10 inline-flex items-center justify-center rounded-full border border-white/15 text-slate-300 hover:text-white">
                        <Gear className="w-4 h-4" aria-hidden="true" />
                      </span>} />
            {p.you ? (
              <DropMenu label={`${p.you.name}: your stats, settings and account`} items={p.me} active={false} align="right"
                        button={<YouButton you={p.you} />} />
            ) : (
              <>
                {/* Signed out, stats, settings and keys are still somebody's:
                    they live in this browser. */}
                <DropMenu label="Your stats and settings" items={p.me} active={false} align="right"
                          button={<span className="w-10 h-10 inline-flex items-center justify-center rounded-full border border-white/15 text-slate-300 hover:text-white">
                            <UserRound className="w-4 h-4" aria-hidden="true" />
                          </span>} />
                {p.signIn && (
                  <RouteLink {...p.signIn}
                             className="inline-flex items-center h-10 px-4 rounded-lg border border-white/20 text-sm font-semibold text-white hover:bg-white/5">
                    Sign in
                  </RouteLink>
                )}
              </>
            )}
          </div>
        </div>
      </header>

      {/* ---- phone: the top ---- */}
      <header className="md:hidden sticky top-0 z-40 h-14 bg-slate-950/90 backdrop-blur border-b border-white/10">
        <div className="h-full px-3 flex items-center gap-2">
          <RouteLink {...p.home} label={`${p.siteName}, home`} className="shrink-0 rounded-lg">
            <img src="/mark.svg" alt="" width={500} height={500} className="w-9 h-9" />
          </RouteLink>
          <div className="flex-1 min-w-0 flex justify-center">
            {p.titleSwitchesGame && games.length > 0 ? (
              <button type="button" onClick={() => setSheet('games')} aria-label={`${p.title}: switch game`}
                      className="inline-flex items-center gap-1 max-w-full h-10 px-2 rounded-lg text-base font-semibold text-white">
                <span className="truncate">{p.title}</span>
                <ChevronDown className="w-4 h-4 shrink-0" aria-hidden="true" />
              </button>
            ) : (
              <span className="truncate text-base font-semibold text-white">{p.title}</span>
            )}
          </div>
          {p.you ? (
            <button type="button" onClick={() => setSheet('me')} aria-label={`${p.you.name}: your stats, settings and account`}
                    className="shrink-0 rounded-full">
              <YouButton you={p.you} />
            </button>
          ) : p.signIn ? (
            <RouteLink {...p.signIn} className="shrink-0 inline-flex items-center h-9 px-3 rounded-lg border border-white/20 text-sm font-semibold text-white">
              Sign in
            </RouteLink>
          ) : <span className="w-9" />}
        </div>
      </header>

      {/* ---- phone: the tabs ---- */}
      <nav aria-label="Site" className="md:hidden fixed bottom-0 inset-x-0 z-40 h-16 bg-slate-950/95 backdrop-blur border-t border-white/10">
        <ul className="h-full flex">
          <li className="flex-1">
            <RouteLink {...p.home} className={tabClass(p.current === 'today')}>
              <CalendarDays className="w-5 h-5" aria-hidden="true" />
              Today
            </RouteLink>
          </li>
          {games.length > 0 && (
            <TabButton label="Games" icon={<Gamepad2 className="w-5 h-5" aria-hidden="true" />} active={p.current === 'games'}
                       onClick={() => setSheet('games')} />
          )}
          {p.together.length > 0 && (
            <TabButton label="Together" icon={<Users className="w-5 h-5" aria-hidden="true" />} active={p.current === 'together'}
                       badge={total(p.together)} onClick={() => setSheet('together')} />
          )}
          {p.events.length > 0 && (
            <TabButton label="Events" icon={<Sparkles className="w-5 h-5" aria-hidden="true" />} active={p.current === 'events'}
                       onClick={() => setSheet('events')} />
          )}
          {meItems.length > 0 && (
            <TabButton label="Me" icon={p.you ? <Avatar avatar={p.you.avatar} name={p.you.name} seed={p.you.seed} size="sm" /> : <Gear className="w-5 h-5" aria-hidden="true" />}
                       active={false} badge={total(p.admin)} onClick={() => setSheet('me')} />
          )}
        </ul>
      </nav>

      {sheet === 'games' && <Sheet title="Games" items={games} extra={p.locked ? undefined : boardsItem} onClose={() => setSheet(null)} />}
      {sheet === 'together' && <Sheet title="Together" items={p.together} onClose={() => setSheet(null)} />}
      {sheet === 'events' && <Sheet title="Events" items={p.events} onClose={() => setSheet(null)} />}
      {sheet === 'me' && <Sheet title={p.you ? p.you.name : 'You'} items={meItems} onClose={() => setSheet(null)} />}
    </>
  );
}

const tabClass = (active: boolean) =>
  `relative h-full w-full flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${
    active ? 'text-accent' : 'text-slate-400 hover:text-white'
  }`;

function TabButton({ label, icon, active, badge = 0, onClick }: {
  label: string; icon: ReactNode; active: boolean; badge?: number; onClick: () => void;
}) {
  return (
    <li className="flex-1">
      <button type="button" onClick={onClick} className={tabClass(active)}>
        <span className="relative inline-flex">
          {icon}
          {badge > 0 && (
            <span className="absolute -top-1.5 -right-3">
              <Badge n={badge} what="waiting" />
            </span>
          )}
        </span>
        {label}
      </button>
    </li>
  );
}
