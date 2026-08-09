// The front page. Until now "/" meant "wherever you left off", which is not a
// thing a URL can mean — it rewrote itself the moment anything moved, and a
// visitor arriving from a search result or a shared card landed mid-game with
// no idea what the site was.
//
// Regulars who don't want a lobby can set Settings -> Site -> Start on to a
// game and never see this again.

import { Grid3x3, Hexagon, LayoutGrid, Puzzle, Shuffle, Square, Table2, Trophy } from 'lucide-react';
import { useEffect, useState } from 'react';
import { MODE_SLUG, pathOf, SLUG_NAME, type Slug } from '@/routes';
import RouteLink from '@/RouteLink';
import { allDailyStatus, type DailyState } from '@/dailyStatus';
import {
  boardsToShow,
  fetchBoards,
  fetchDisplayName,
  BOARD_LABELS,
  type Boards,
} from '@/leaderboard';
import type { Mode } from '@/storage';

const ICONS: Record<Slug, typeof Grid3x3> = {
  guess: Grid3x3,
  scramble: Shuffle,
  hive: Hexagon,
  grid: LayoutGrid,
  boxed: Square,
  weave: Puzzle,
  squares: Table2,
};

// One line each, written for somebody who has never seen the game.
const BLURB: Record<Slug, string> = {
  guess: 'Guess the hidden word in six tries, one letter of feedback at a time.',
  scramble: 'A rack of letters and a clock. Find as many words as you can before it runs out.',
  hive: 'Seven letters, one compulsory. Build as many words as you can from them.',
  grid: 'A grid of letters against the clock — trace words through neighbouring cells.',
  boxed: 'Twelve letters around a square. Chain words together and use every one.',
  weave: 'Find the words hiding in the board, all on a theme you have to work out.',
  squares: 'Fill the grid so every row and every column spells a word.',
};

const NUMBER_WORD: Record<number, string> = {
  1: 'One',
  2: 'Two',
  3: 'Three',
  4: 'Four',
  5: 'Five',
  6: 'Six',
  7: 'Seven',
};

const STATE_LABEL: Record<DailyState, string> = {
  none: 'Not started',
  started: 'In progress',
  done: 'Finished',
};

const STATE_STYLE: Record<DailyState, string> = {
  none: 'text-slate-500',
  started: 'text-amber-300',
  done: 'text-emerald-300',
};

export default function HomeView({
  modes,
  onOpen,
  onBoards,
}: {
  /** the games actually on show, in nav order */
  modes: Mode[];
  onOpen: (mode: Mode) => void;
  onBoards: () => void;
}) {
  const [status, setStatus] = useState<Record<string, DailyState>>({});
  const [boards, setBoards] = useState<Boards | null>(null);
  // so you can find yourself in the column; null when signed out or unnamed,
  // which is most people, and the boards read fine without it
  const [me, setMe] = useState<string | null>(null);

  useEffect(() => setStatus(allDailyStatus(modes)), [modes]);

  useEffect(() => {
    let alive = true;
    fetchBoards(1).then((b) => alive && setBoards(b));
    fetchDisplayName().then((n) => alive && setMe(n));
    return () => {
      alive = false;
    };
  }, []);

  const doneCount = modes.filter((m) => status[m] === 'done').length;
  const shownBoards = boards ? boardsToShow(boards, modes, status) : [];

  return (
    <div className="max-w-3xl mx-auto text-left">
      <section className="mb-8">
        <p className="text-slate-300">
          {/* Counted, not written down: it said six for as long as there were
              seven, because a number in prose doesn't change when the code
              does. It also follows what you've chosen to show. */}
          {NUMBER_WORD[modes.length] ?? modes.length} word games, a fresh puzzle in
          each one every morning, and a solver behind every game for when
          you&apos;re properly stuck. Everything works without an account and
          nothing you type into a solver leaves your device.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="flex items-baseline justify-between gap-3 text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
          <span>Today&apos;s puzzles</span>
          {doneCount > 0 && (
            <span className="text-slate-500 normal-case tracking-normal font-normal">
              {doneCount} of {modes.length} finished
            </span>
          )}
        </h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {modes.map((m) => {
            const slug = MODE_SLUG[m];
            const Icon = ICONS[slug];
            const state = status[m] ?? 'none';
            return (
              <RouteLink
                key={m}
                to={pathOf({ kind: 'game', view: 'play', slug, daily: true })}
                onGo={() => onOpen(m)}
                className="block text-left rounded-xl bg-white/5 border border-white/10 p-4 hover:bg-white/10 hover:border-white/20 transition-colors"
              >
                <span className="flex items-center gap-2 mb-1">
                  <Icon className="w-4 h-4 text-accent shrink-0" />
                  <span className="font-semibold text-white">{SLUG_NAME[slug]}</span>
                  <span className={`ml-auto text-xs shrink-0 ${STATE_STYLE[state]}`}>
                    {STATE_LABEL[state]}
                  </span>
                </span>
                <span className="block text-sm text-slate-400">{BLURB[slug]}</span>
              </RouteLink>
            );
          })}
        </div>
      </section>

      {shownBoards.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
            On the boards today
          </h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {shownBoards.map((g) => {
              const rows = boards![g];
              const label = BOARD_LABELS[g];
              const myIndex = me ? rows.findIndex((r) => r.name === me) : -1;
              // your own line, kept even when the top three don't include it —
              // being 14th is still an answer to "how did I do?"
              const below = myIndex >= 3 ? rows[myIndex] : null;
              return (
                <button
                  key={g}
                  onClick={onBoards}
                  className="w-full text-left rounded-xl bg-white/5 border border-white/10 p-4 hover:bg-white/10 hover:border-white/20 transition-colors"
                >
                  <span className="flex items-center gap-2 mb-2 text-sm font-semibold text-white">
                    <Trophy className="w-4 h-4 text-accent shrink-0" />
                    {label.label}
                  </span>
                  <ol className="space-y-1">
                    {rows.slice(0, 3).map((r, i) => (
                      <li
                        key={r.name}
                        className={`flex items-baseline gap-2 text-sm ${
                          i === myIndex ? 'text-emerald-300 font-semibold' : 'text-slate-300'
                        }`}
                      >
                        <span className="w-4 shrink-0 text-xs text-slate-500 tabular-nums">
                          {i + 1}
                        </span>
                        <span className="flex-1 min-w-0 truncate">
                          {r.name}
                          {i === myIndex && <span className="text-xs font-normal"> (you)</span>}
                        </span>
                        <span className="tabular-nums shrink-0">{label.value(r.value)}</span>
                      </li>
                    ))}
                    {below && (
                      <li className="flex items-baseline gap-2 text-sm text-emerald-300 font-semibold border-t border-white/10 pt-1 mt-1">
                        <span className="w-4 shrink-0 text-xs text-slate-500 tabular-nums">
                          {myIndex + 1}
                        </span>
                        <span className="flex-1 min-w-0 truncate">
                          {below.name}
                          <span className="text-xs font-normal"> (you)</span>
                        </span>
                        <span className="tabular-nums shrink-0">{label.value(below.value)}</span>
                      </li>
                    )}
                  </ol>
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-slate-500">
            {me
              ? 'See all the boards, and the week and month behind them.'
              : 'Set a display name to take part — see all the boards.'}
          </p>
        </section>
      )}
    </div>
  );
}
