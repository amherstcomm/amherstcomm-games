// The rails either side of a game (the layout spec, November 2026).
//
// Left: today's games, each with its state, the one you are on marked -- the
// way to move between them without the menu. Right: this game's board at the
// difficulty being played, top three and you, and the way to the full boards
// and to report a problem with the puzzle. What the game itself has to say --
// your progress, its hints, sharing -- moves here game by game after this.
import { useEffect, useState, type ReactNode } from 'react';
import { ArrowRight, Trophy } from 'lucide-react';
import RouteLink from '@/RouteLink';
import GameTile from '@/GameTile';
import { BOARD_LABELS, fetchBoards, fetchDisplayName, type BoardGame, type Boards } from '@/leaderboard';
import type { Difficulty } from '@/difficulty';
import type { Slug } from '@/games';

type Go = { to: string; onGo: () => void };

export type RailGame = {
  key: string;
  slug: Slug;
  label: string;
  status: 'done' | 'started' | 'none';
  current: boolean;
  go: Go;
};

const STATUS_WORD = { done: 'Done', started: 'In progress', none: 'Not started' } as const;
const STATUS_DOT = { done: 'bg-emerald-400', started: 'bg-amber-400', none: 'bg-slate-700' } as const;
const CARD = 'rounded-2xl border border-white/10 bg-slate-900 p-4';
const LABEL = 'text-xs font-semibold text-slate-400 uppercase tracking-wider';

export function GameRail({ games }: { games: RailGame[] }) {
  return (
    <nav aria-labelledby="rail-today">
      <h2 id="rail-today" className={`${LABEL} px-3 mb-2`}>Today</h2>
      <ul className="space-y-0.5">
        {games.map((g) => (
          <li key={g.key}>
            <RouteLink
              {...g.go}
              className={`flex items-center gap-2.5 rounded-lg px-3 h-10 text-sm transition-colors ${
                g.current ? 'bg-accent/15 text-accent font-semibold' : 'text-slate-300 hover:bg-white/5 hover:text-white'
              }`}
            >
              <GameTile slug={g.slug} size="sm" />
              <span className="flex-1 min-w-0 truncate" aria-current={g.current ? 'page' : undefined}>{g.label}</span>
              <span className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[g.status]}`} aria-hidden="true" />
              <span className="sr-only">{STATUS_WORD[g.status]}</span>
            </RouteLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** This game's board(s) at this difficulty, and what to do about the puzzle. */
export function GameSide({ boards: which, level, levelWord, onBoards, report }: {
  boards: BoardGame[];
  level: Difficulty;
  levelWord: string;
  onBoards: () => void;
  /** the report-a-problem control, which knows which puzzle this is */
  report: ReactNode;
}) {
  const [boards, setBoards] = useState<Boards | null>(null);
  const [me, setMe] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    fetchBoards(1, level).then((b) => alive && setBoards(b));
    fetchDisplayName().then((n) => alive && setMe(n));
    return () => {
      alive = false;
    };
  }, [level]);

  return (
    <div className="space-y-4">
      {which.map((g) => {
        const rows = boards?.[g] ?? [];
        const label = BOARD_LABELS[g];
        const mine = me ? rows.findIndex((r) => r.name === me) : -1;
        const below = mine >= 3 ? rows[mine] : null;
        return (
          <section key={g} aria-labelledby={`side-${g}`} className={CARD}>
            <h2 id={`side-${g}`} className={`${LABEL} flex items-center gap-2`}>
              <Trophy className="w-3.5 h-3.5 text-accent" aria-hidden="true" />
              {label.label} board · {levelWord}
            </h2>
            {boards && rows.length === 0 && (
              <p className="mt-2 text-sm text-slate-400">Nobody has finished this one today. Be first.</p>
            )}
            {rows.length > 0 && (
              <ol className="mt-2 space-y-1">
                {rows.slice(0, 3).map((r, i) => (
                  <li key={r.name} className={`flex items-baseline gap-2 text-sm ${i === mine ? 'text-accent font-semibold' : 'text-slate-300'}`}>
                    <span className="w-4 shrink-0 text-xs text-slate-500 tabular-nums">{i + 1}</span>
                    <span className="flex-1 min-w-0 truncate">
                      {r.name}
                      {i === mine && <span className="text-xs font-normal"> (you)</span>}
                    </span>
                    <span className="tabular-nums shrink-0">{label.value(r.value)}</span>
                    {label.detail(r.detail ?? 0) !== '' && (
                      <span className="text-xs text-slate-500 tabular-nums shrink-0">{label.detail(r.detail ?? 0)}</span>
                    )}
                  </li>
                ))}
                {below && (
                  <li className="flex items-baseline gap-2 text-sm text-accent font-semibold border-t border-white/10 pt-1 mt-1">
                    <span className="w-4 shrink-0 text-xs text-slate-500 tabular-nums">{mine + 1}</span>
                    <span className="flex-1 min-w-0 truncate">{below.name}<span className="text-xs font-normal"> (you)</span></span>
                    <span className="tabular-nums shrink-0">{label.value(below.value)}</span>
                  </li>
                )}
              </ol>
            )}
            <button type="button" onClick={onBoards}
                    className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:underline">
              Full board <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </button>
          </section>
        );
      })}
      <div className="text-sm">{report}</div>
    </div>
  );
}
