// The front page. Until now "/" meant "wherever you left off", which is not a
// thing a URL can mean — it rewrote itself the moment anything moved, and a
// visitor arriving from a search result or a shared card landed mid-game with
// no idea what the site was.
//
// Regulars who don't want a lobby can set Settings -> Site -> Start on to a
// game and never see this again.

import { Grid3x3, Hexagon, LayoutGrid, Puzzle, Shuffle, Square, Table2, Trophy } from 'lucide-react';
import { useEffect, useState } from 'react';
import { MODE_SLUG, SLUG_NAME, type Slug } from '@/routes';
import { allDailyStatus, type DailyState } from '@/dailyStatus';
import { fetchBoards, BOARD_LABELS, type BoardGame, type Boards } from '@/leaderboard';
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

  useEffect(() => setStatus(allDailyStatus(modes)), [modes]);

  useEffect(() => {
    let alive = true;
    fetchBoards(1).then((b) => alive && setBoards(b));
    return () => {
      alive = false;
    };
  }, []);

  const doneCount = modes.filter((m) => status[m] === 'done').length;
  const topBoard = boards
    ? (Object.keys(boards) as BoardGame[]).find((g) => boards[g].length)
    : undefined;

  return (
    <div className="max-w-3xl mx-auto text-left">
      <section className="mb-8">
        <p className="text-slate-300">
          Six word games, a fresh puzzle in each one every morning, and a solver
          behind every game for when you&apos;re properly stuck. Everything works
          without an account and nothing you type into a solver leaves your device.
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
              <button
                key={m}
                onClick={() => onOpen(m)}
                className="text-left rounded-xl bg-white/5 border border-white/10 p-4 hover:bg-white/10 hover:border-white/20 transition-colors"
              >
                <span className="flex items-center gap-2 mb-1">
                  <Icon className="w-4 h-4 text-accent shrink-0" />
                  <span className="font-semibold text-white">{SLUG_NAME[slug]}</span>
                  <span className={`ml-auto text-xs shrink-0 ${STATE_STYLE[state]}`}>
                    {STATE_LABEL[state]}
                  </span>
                </span>
                <span className="block text-sm text-slate-400">{BLURB[slug]}</span>
              </button>
            );
          })}
        </div>
      </section>

      {topBoard && (
        <section>
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
            On the boards today
          </h2>
          <button
            onClick={onBoards}
            className="w-full text-left rounded-xl bg-white/5 border border-white/10 p-4 hover:bg-white/10 hover:border-white/20 transition-colors"
          >
            <span className="flex items-center gap-2 mb-2 text-sm font-semibold text-white">
              <Trophy className="w-4 h-4 text-accent shrink-0" />
              {BOARD_LABELS[topBoard].label}
            </span>
            <ol className="space-y-1">
              {boards![topBoard].slice(0, 3).map((r, i) => (
                <li key={r.name} className="flex items-baseline gap-2 text-sm text-slate-300">
                  <span className="w-4 shrink-0 text-xs text-slate-500 tabular-nums">{i + 1}</span>
                  <span className="flex-1 min-w-0 truncate">{r.name}</span>
                  <span className="tabular-nums shrink-0">
                    {BOARD_LABELS[topBoard].value(r.value)}
                  </span>
                </li>
              ))}
            </ol>
            <span className="block mt-2 text-xs text-slate-500">
              Set a display name to take part — see all the boards
            </span>
          </button>
        </section>
      )}
    </div>
  );
}
