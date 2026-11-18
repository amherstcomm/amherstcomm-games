// The front page, after the layout spec (November 2026).
//
// A strip saying where you are with today -- the event, a greeting, how many
// puzzles are done and the one to do next -- then, in the main column, what is
// happening (the whiteboard, and whatever organisers have featured) and today's
// puzzles as tiles; and down the right, recognition, the boards and the
// suggestion box. On a phone the right column follows the main one.
//
// Regulars who don't want a lobby can set Settings -> Site -> Start on to a
// game and never see this again.

import { useEffect, useState, type ReactNode } from 'react';
import { ArrowRight, Award, Inbox, Trophy } from 'lucide-react';
import GameTile from '@/GameTile';
import { MODE_SLUG, pathOf, type Slug } from '@/routes';
import { GAME_NAME } from '@/games';
import { difficulty, onDifficultyChange } from '@/difficulty';
import RouteLink from '@/RouteLink';
import DifficultyTabs from '@/DifficultyTabs';
import type { Difficulty } from '@/difficulty';
import { allDailyStatus, type DailyState } from '@/dailyStatus';
import { fetchFriendNames } from '@/friends';
import { boardsToShow, fetchBoards, fetchDisplayName, BOARD_LABELS, type Boards } from '@/leaderboard';
import ScrollRow, { RowItem } from '@/ScrollRow';
import { readRecognition, type WallCard } from '@/recognition';
import { officeZone } from '@/schedule';
import type { Mode } from '@/storage';

type Go = { to: string; onGo: () => void };

const STATE_LABEL: Record<DailyState, string> = {
  none: 'Not started',
  started: 'In progress',
  done: 'Done',
};

const STATE_STYLE: Record<DailyState, string> = {
  none: 'text-slate-500',
  started: 'text-amber-300',
  done: 'text-emerald-300',
};

const TILE_EDGE: Record<DailyState, string> = {
  none: 'border-white/10',
  started: 'border-amber-400/40',
  done: 'border-emerald-400/30',
};

const SEGMENT: Record<DailyState, string> = {
  none: 'bg-white/10',
  started: 'bg-amber-400',
  done: 'bg-emerald-400',
};

const RAIL = 'rounded-2xl border border-white/10 bg-slate-900 p-4';
const LABEL = 'text-xs font-semibold text-slate-400 uppercase tracking-wider';

/** Morning, afternoon or evening on the company clock. */
function partOfDay(now = new Date()): string {
  const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: officeZone(), hour: 'numeric', hourCycle: 'h23' }).format(now));
  return hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
}

export default function HomeView({
  modes,
  onOpen,
  onBoards,
  name,
  subtitle,
  happening,
  notice,
  recognition,
  suggestions,
}: {
  /** the games actually on show, in nav order */
  modes: Mode[];
  onOpen: (mode: Mode) => void;
  onBoards: () => void;
  /** who is signed in, for the greeting; null signed out */
  name: string | null;
  /** the event this run is for, or empty */
  subtitle: string;
  /** what is happening: the whiteboard and what organisers featured */
  happening: ReactNode;
  /** a line under the strip -- a tournament round being on */
  notice?: ReactNode;
  /** where the rail's recognition and suggestion box go; null signed out */
  recognition: Go | null;
  suggestions: Go | null;
}) {
  const [status, setStatus] = useState<Record<string, DailyState>>({});
  useEffect(() => setStatus(allDailyStatus(modes)), [modes]);

  const stateOf = (m: Mode): DailyState => (status[m] as DailyState | undefined) ?? 'none';
  const done = modes.filter((m) => stateOf(m) === 'done').length;
  // Where to go next: the first game started and not finished, else the first
  // not started; nothing left, the day's results.
  const next = modes.find((m) => stateOf(m) === 'started') ?? modes.find((m) => stateOf(m) === 'none') ?? null;
  const first = name ? name.trim().split(/\s+/)[0] : null;

  return (
    <div className="text-left">
      {/* ---- today ---- */}
      <section aria-labelledby="today-heading"
               className="rounded-2xl border border-accent/30 bg-accent/10 px-5 py-5 sm:px-6 flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="min-w-0 flex-1">
          {subtitle && <p className="text-xs font-semibold uppercase tracking-[0.12em] text-accent">{subtitle}</p>}
          <h1 id="today-heading" className="mt-1 text-xl sm:text-2xl font-bold text-white text-balance">
            Good {partOfDay()}{first ? `, ${first}` : ''}.{' '}
            {modes.length > 0 && (
              <span className="whitespace-nowrap">{done} of {modes.length} puzzles done.</span>
            )}
          </h1>
          {modes.length > 0 && (
            <div className="mt-3 flex gap-1 max-w-sm" aria-hidden="true">
              {modes.map((m) => <span key={m} className={`h-1.5 flex-1 rounded-full ${SEGMENT[stateOf(m)]}`} />)}
            </div>
          )}
        </div>
        {modes.length > 0 && (
          next ? (
            <RouteLink
              to={pathOf({ kind: 'game', view: 'play', slug: MODE_SLUG[next], daily: true })}
              onGo={() => onOpen(next)}
              className="shrink-0 inline-flex items-center justify-center gap-2 h-11 px-5 rounded-xl bg-accent text-slate-950 text-sm font-bold hover:brightness-110"
            >
              {stateOf(next) === 'started' ? 'Continue' : 'Play'} {GAME_NAME[next].short}
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </RouteLink>
          ) : (
            <button type="button" onClick={onBoards}
                    className="shrink-0 inline-flex items-center justify-center gap-2 h-11 px-5 rounded-xl bg-accent text-slate-950 text-sm font-bold hover:brightness-110">
              See today&apos;s results
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </button>
          )
        )}
      </section>

      {notice && <div className="mt-4">{notice}</div>}

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {/* ---- the main column ---- */}
        <div className="lg:col-span-2 space-y-8 min-w-0">
          {happening}

          <section aria-labelledby="puzzles-heading">
            <h2 id="puzzles-heading" className={`${LABEL} mb-3`}>Today&apos;s puzzles</h2>
            {modes.length === 0 ? (
              // Every game switched off, which is a real thing to want: a
              // deployment can run sessions alone for an event.
              <p className="text-sm text-slate-300">
                The word games are switched off at the moment. Anything you have been invited to join is still here.
              </p>
            ) : (
              <ul className="grid gap-2 grid-cols-2 min-[360px]:grid-cols-3 sm:grid-cols-5">
                {modes.map((m) => {
                  const slug: Slug = MODE_SLUG[m];
                  const state = stateOf(m);
                  return (
                    <li key={m}>
                      <RouteLink
                        to={pathOf({ kind: 'game', view: 'play', slug, daily: true })}
                        onGo={() => onOpen(m)}
                        className={`h-full flex flex-col items-center gap-2 text-center rounded-xl border bg-slate-900 px-2 py-4 hover:bg-white/5 transition-colors ${TILE_EDGE[state]}`}
                      >
                        <GameTile slug={slug} />
                        {/* Hyphenated if it must: with the largest text on a narrow phone,
                            "Cryptogram" is wider than its tile. */}
                        <span className="max-w-full text-sm font-semibold text-white leading-tight hyphens-auto [overflow-wrap:anywhere]">
                          {GAME_NAME[m].short}
                        </span>
                        <span className={`text-xs ${STATE_STYLE[state]}`}>{STATE_LABEL[state]}</span>
                      </RouteLink>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        {/* ---- the rail ---- */}
        <div className="space-y-4 min-w-0">
          {recognition && <RecognitionRail go={recognition} />}
          {modes.length > 0 && <BoardsRail modes={modes} status={status} onBoards={onBoards} />}
          {suggestions && (
            <RouteLink {...suggestions} className={`${RAIL} flex items-center gap-3 hover:bg-white/5`}>
              <Inbox className="w-5 h-5 text-accent shrink-0" aria-hidden="true" />
              <span className="flex-1 text-sm text-slate-200">
                Got an idea or a gripe? <span className="text-slate-400">Anonymous if you want.</span>
              </span>
              <span className="text-sm font-semibold text-accent whitespace-nowrap">Suggestion box →</span>
            </RouteLink>
          )}
        </div>
      </div>
    </div>
  );
}

/** The latest two on the recognition wall, and the way to nominate. */
function RecognitionRail({ go }: { go: Go }) {
  const [wall, setWall] = useState<WallCard[] | null>(null);
  useEffect(() => {
    let alive = true;
    void readRecognition().then((p) => alive && setWall(p.ok ? (p.wall ?? []).slice(0, 2) : []));
    return () => {
      alive = false;
    };
  }, []);
  return (
    <section aria-labelledby="rail-recognition" className={RAIL}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="rail-recognition" className={LABEL}>Recognition</h2>
        <RouteLink {...go} className="text-sm font-semibold text-accent hover:underline">Nominate</RouteLink>
      </div>
      {wall && wall.length === 0 && (
        <p className="mt-2 text-sm text-slate-400">Nothing on the wall yet. Seen somebody acting like an owner?</p>
      )}
      {wall && wall.length > 0 && (
        <ul className="mt-2 divide-y divide-white/10">
          {wall.map((c) => (
            <li key={c.id} className="py-2">
              <RouteLink {...go} className="flex items-start gap-2 text-sm text-slate-300 hover:text-white">
                <Award className="w-4 h-4 mt-0.5 text-accent shrink-0" aria-hidden="true" />
                <span className="min-w-0">
                  {c.from ? <><strong className="text-white">{c.from.name}</strong> recognized </> : null}
                  <strong className="text-white">{c.who.name}</strong>
                  {c.from ? '' : ' was recognized'}
                  <span className="block text-slate-400 line-clamp-2">{c.story}</span>
                </span>
              </RouteLink>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Today's boards, a card at a time, yours first. */
function BoardsRail({ modes, status, onBoards }: { modes: Mode[]; status: Record<string, DailyState>; onBoards: () => void }) {
  const [boardLevel, setBoardLevel] = useState<Difficulty>(difficulty);
  useEffect(() => onDifficultyChange(() => setBoardLevel(difficulty())), []);
  const [boards, setBoards] = useState<Boards | null>(null);
  // so you can find yourself in the column; null when signed out or unnamed
  const [me, setMe] = useState<string | null>(null);
  // and your friends in theirs; empty for everyone else
  const [friends, setFriends] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    let alive = true;
    fetchBoards(1, boardLevel).then((b) => alive && setBoards(b));
    fetchDisplayName().then((n) => alive && setMe(n));
    fetchFriendNames().then((f) => alive && setFriends(f));
    return () => {
      alive = false;
    };
  }, [boardLevel]);

  // Shown whenever the boards have loaded, not only when this difficulty has
  // entries: hiding it took the tabs with it, and a difficulty nobody had
  // played left no way back but a reload.
  if (!boards) return null;
  const shown = boardsToShow(boards, modes, status);
  return (
    <section aria-labelledby="rail-boards" className={RAIL}>
      <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
        <h2 id="rail-boards" className={LABEL}>On the boards today</h2>
        <DifficultyTabs value={boardLevel} onChange={setBoardLevel} label="Which difficulty's boards to show" />
      </div>
      {shown.length === 0 ? (
        <p className="text-sm text-slate-400">Nobody has finished a puzzle at this difficulty today. Be first.</p>
      ) : (
        <ScrollRow label="Today's boards">
          {shown.map((g) => {
            const rows = boards[g];
            const label = BOARD_LABELS[g];
            const myIndex = me ? rows.findIndex((r) => r.name === me) : -1;
            // your own line, kept even when the top three don't include it
            const below = myIndex >= 3 ? rows[myIndex] : null;
            return (
              <RowItem key={g} width="w-[85%]">
                <button onClick={onBoards}
                        className="w-full h-full flex flex-col justify-start text-left rounded-xl bg-white/5 border border-white/10 p-4 hover:bg-white/10 hover:border-white/20 transition-colors">
                  <span className="flex items-center gap-2 mb-2 text-sm font-semibold text-white">
                    <Trophy className="w-4 h-4 text-accent shrink-0" />
                    {label.label}
                  </span>
                  <ol className="w-full space-y-1">
                    {rows.slice(0, 3).map((r, i) => {
                      const friend = i !== myIndex && friends.has(r.name.toLowerCase());
                      return (
                        <li key={r.name}
                            className={`flex items-baseline gap-2 text-sm ${
                              i === myIndex ? 'text-accent font-semibold' : friend ? 'text-sky-300' : 'text-slate-300'
                            }`}>
                          <span className="w-4 shrink-0 text-xs text-slate-500 tabular-nums">{i + 1}</span>
                          <span className="flex-1 min-w-0 truncate">
                            {r.name}
                            {i === myIndex && <span className="text-xs font-normal"> (you)</span>}
                            {friend && <span className="text-xs font-normal"> (friend)</span>}
                          </span>
                          <span className="tabular-nums shrink-0">{label.value(r.value)}</span>
                          {/* What the row was ranked on, where there is such a
                              thing: two people on "1 solved" in a deliberate
                              order otherwise read as a tie. The name gives way
                              before this does. */}
                          {label.detail(r.detail ?? 0) !== '' && (
                            <span className="text-xs text-slate-500 tabular-nums shrink-0">{label.detail(r.detail ?? 0)}</span>
                          )}
                        </li>
                      );
                    })}
                    {below && (
                      <li className="flex items-baseline gap-2 text-sm text-accent font-semibold border-t border-white/10 pt-1 mt-1">
                        <span className="w-4 shrink-0 text-xs text-slate-500 tabular-nums">{myIndex + 1}</span>
                        <span className="flex-1 min-w-0 truncate">
                          {below.name}
                          <span className="text-xs font-normal"> (you)</span>
                        </span>
                        <span className="tabular-nums shrink-0">{label.value(below.value)}</span>
                      </li>
                    )}
                  </ol>
                </button>
              </RowItem>
            );
          })}
          <RowItem width="w-[85%]">
            <button onClick={onBoards}
                    className="w-full h-full min-h-28 flex flex-col justify-end gap-1 text-left rounded-xl border border-white/15 p-4 text-accent font-semibold hover:bg-white/5 transition-colors">
              See all the boards
              <span className="text-xs font-normal text-slate-400">and the week and month behind them</span>
            </button>
          </RowItem>
        </ScrollRow>
      )}
    </section>
  );
}
