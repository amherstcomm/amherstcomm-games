// Day-by-day history. Inline SVG rather than a charting library: the bundle is
// already heavy, and a sparkline is a polyline.

import { useEffect, useMemo, useState } from 'react';
import { Grid3x3, Hexagon, LayoutGrid, Puzzle, Shuffle, Square } from 'lucide-react';
import {
  fetchHistory,
  guessByLength,
  guessDistribution,
  series,
  streaks,
  STREAK_RULE,
  type History,
  type HistoryGame,
  type LengthRecord,
  type Series,
} from '@/history';
import { formatElapsed } from '@/useUpTimer';

const GAMES: { id: HistoryGame; label: string; Icon: typeof Grid3x3; unit: string; lowerIsBetter: boolean }[] = [
  { id: 'guess', label: 'Guess the Word', Icon: Grid3x3, unit: 'guesses', lowerIsBetter: true },
  { id: 'hive', label: 'Hive', Icon: Hexagon, unit: 'points', lowerIsBetter: false },
  { id: 'scramble', label: 'Scramble', Icon: Shuffle, unit: 'points', lowerIsBetter: false },
  { id: 'grid', label: 'Grid', Icon: LayoutGrid, unit: 'points', lowerIsBetter: false },
  { id: 'box', label: 'Boxed', Icon: Square, unit: 'words', lowerIsBetter: true },
  { id: 'weave', label: 'Weave', Icon: Puzzle, unit: 'time', lowerIsBetter: true },
];

function todayEt(): string {
  // the daily rolls at 3am Eastern; noon UTC lands on the right calendar day
  // either side of the boundary without pulling in a timezone library
  return new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function fmt(value: number, unit: string): string {
  return unit === 'time' ? formatElapsed(value) : String(value);
}

// A sparkline over the last N days played. Dates aren't spaced by calendar gap
// on purpose — a fortnight away shouldn't stretch the line into a flat run
// that reads as a plateau.
function Spark({ data, lowerIsBetter, unit }: { data: Series; lowerIsBetter: boolean; unit: string }) {
  const W = 260;
  const H = 44;
  const pts = data.slice(-40);
  if (pts.length < 2) return null;

  const values = pts.map((p) => p.value);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || 1;
  const x = (i: number) => (i / (pts.length - 1)) * W;
  // better is always up, whichever direction "better" runs in
  const y = (v: number) => {
    const t = (v - lo) / span;
    return H - 3 - (lowerIsBetter ? 1 - t : t) * (H - 6);
  };

  const line = pts.map((p, i) => `${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const last = pts[pts.length - 1];

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full h-11"
      role="img"
      aria-label={`${pts.length} results, best ${fmt(lowerIsBetter ? lo : hi, unit)}, most recent ${fmt(last.value, unit)}`}
    >
      <polyline
        points={line}
        fill="none"
        stroke="rgb(var(--c-accent))"
        strokeWidth="1.75"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx={x(pts.length - 1)} cy={y(last.value)} r="2.75" fill="rgb(var(--c-accent))" />
    </svg>
  );
}

function Distribution({ dist }: { dist: number[] }) {
  const max = Math.max(1, ...dist);
  return (
    <div className="space-y-1">
      {dist.map((n, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-3 text-xs text-slate-500 tabular-nums">{i + 1}</span>
          <div className="flex-1 h-4 rounded bg-white/5 overflow-hidden">
            {/* the accent token rather than a shade class: emerald-400 is a
                fill meant to carry dark text, so in light mode it sits far too
                close to the track to be a legible bar */}
            <div
              className="h-full rounded"
              style={{
                width: `${Math.max(n ? 8 : 0, (100 * n) / max)}%`,
                backgroundColor: 'rgb(var(--c-accent))',
              }}
            />
          </div>
          <span className="w-6 text-right text-xs text-slate-400 tabular-nums">{n}</span>
        </div>
      ))}
    </div>
  );
}

// Per-length records for Guess. Deliberately a table rather than a card each:
// someone who plays several lengths wants to compare them, and thirteen cards
// would bury the rest of the page.
function LengthTable({ rows }: { rows: LengthRecord[] }) {
  if (!rows.length) return null;
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full text-xs tabular-nums">
        <thead>
          <tr className="text-slate-500 text-left">
            <th scope="col" className="font-medium pb-1 pr-2">Letters</th>
            <th scope="col" className="font-medium pb-1 px-2 text-right">Days</th>
            <th scope="col" className="font-medium pb-1 px-2 text-right">Won</th>
            <th scope="col" className="font-medium pb-1 px-2 text-right">Best</th>
            <th scope="col" className="font-medium pb-1 pl-2 text-right">Fastest</th>
          </tr>
        </thead>
        <tbody className="text-slate-400">
          {rows.map((r) => (
            <tr key={r.length} className="border-t border-white/5">
              <th scope="row" className="py-1 pr-2 font-semibold text-slate-200 text-left">
                {r.length}
              </th>
              <td className="py-1 px-2 text-right">{r.days}</td>
              <td className="py-1 px-2 text-right">{r.won}</td>
              <td className="py-1 px-2 text-right text-slate-200">
                {r.bestGuesses === null ? '—' : `${r.bestGuesses}/6`}
              </td>
              <td className="py-1 pl-2 text-right">
                {r.bestTimeMs === null ? '—' : formatElapsed(r.bestTimeMs)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GameCard({ game, history }: { game: (typeof GAMES)[number]; history: History }) {
  const entries = history[game.id];
  const today = todayEt();
  const { current, best } = useMemo(
    () => streaks(entries, STREAK_RULE[game.id], today),
    [entries, game.id, today]
  );
  const data = useMemo(() => series(entries, game.id), [entries, game.id]);
  const dayCount = useMemo(() => new Set(entries.map((e) => e.date)).size, [entries]);

  if (!entries.length) return null;

  const values = data.map((d) => d.value);
  const bestValue = values.length ? (game.lowerIsBetter ? Math.min(...values) : Math.max(...values)) : null;

  return (
    <div className="rounded-xl bg-white/5 border border-white/10 p-4">
      <div className="flex items-baseline justify-between gap-3 mb-2">
        <h4 className="flex items-center gap-2 text-sm font-semibold text-white">
          <game.Icon className="w-3.5 h-3.5 text-accent" />
          {game.label}
        </h4>
        {/* distinct dates, not rows: Guess can have several word lengths on
            one date, and counting boards would claim more days than existed */}
        <span className="text-xs text-slate-500 tabular-nums">
          {dayCount} {dayCount === 1 ? 'day' : 'days'}
        </span>
      </div>

      <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-400 mb-2">
        <span>
          Streak <strong className="text-slate-200 tabular-nums">{current}</strong>
        </span>
        <span>
          Longest <strong className="text-slate-200 tabular-nums">{best}</strong>
        </span>
        {bestValue !== null && (
          <span>
            Best <strong className="text-slate-200 tabular-nums">{fmt(bestValue, game.unit)}</strong>
          </span>
        )}
      </div>

      {game.id === 'guess' ? (
        <>
          <Distribution dist={guessDistribution(entries)} />
          <LengthTable rows={guessByLength(entries)} />
        </>
      ) : (
        <Spark data={data} lowerIsBetter={game.lowerIsBetter} unit={game.unit} />
      )}
    </div>
  );
}

export default function HistoryView({ signedIn }: { signedIn: boolean }) {
  const [history, setHistory] = useState<History | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    if (!signedIn) return;
    let alive = true;
    fetchHistory().then((h) => {
      if (!alive) return;
      setHistory(h);
      setState(h ? 'ready' : 'error');
    });
    return () => {
      alive = false;
    };
  }, [signedIn]);

  if (!signedIn) {
    return (
      <p className="text-sm text-slate-400 py-6 text-center">
        Day-by-day history needs an account. Without one, each browser keeps running
        totals but no dates, so there&apos;s no timeline to draw — the Overall, Daily
        and Practice views still work either way.
      </p>
    );
  }
  if (state === 'loading') {
    return <p className="text-sm text-slate-400 py-6 text-center">Loading your history…</p>;
  }
  if (state === 'error' || !history) {
    return (
      <p className="text-sm text-slate-400 py-6 text-center">
        Couldn&apos;t reach your account just now.
      </p>
    );
  }

  const played = GAMES.filter((g) => history[g.id].length);
  if (!played.length) {
    return (
      <p className="text-sm text-slate-400 py-6 text-center">
        No finished dailies yet. Play one and it&apos;ll show up here tomorrow — and the
        day after that, it&apos;ll be a line.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {played.map((g) => (
        <GameCard key={g.id} game={g} history={history} />
      ))}
      <p className="text-xs text-slate-500 pt-1">
        Dailies only, since practice boards have no date to sit on. History starts when
        your account did — anything you played before that counts in the totals but
        can&apos;t be placed on a timeline.
      </p>
    </div>
  );
}
