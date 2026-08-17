// The Hive solver's controls: seven letters arranged as a hive.
//
// The answers render in the shared ResultsPanel below — App computes results
// for every mode in one place — so what this owns is the seven cells and the
// two ways to fill them.
//
// The hive is drawn by absolute percentage rather than by a grid, because the
// shape is the point: six cells around one, and which cell is the centre has
// to be visible without reading a label. `state="center"` is what makes that
// tile look different from the six.
import { CalendarDays } from 'lucide-react';
import Tile from '@/Tile';

/** outer cells, clockwise from the top, as [left%, top%] of the container */
const POSITIONS: [number, number][] = [
  [50, 14],
  [81, 32],
  [81, 68],
  [50, 86],
  [19, 68],
  [19, 32],
];

export default function HiveSolver({
  center,
  outers,
  onCenter,
  onOuters,
  osk,
  onFillDaily,
  onFillNyt,
  todayStatus,
  centreColour,
}: {
  center: string;
  outers: string[];
  onCenter: (c: string) => void;
  onOuters: (next: (prev: string[]) => string[]) => void;
  osk: boolean;
  onFillDaily: () => void;
  onFillNyt: () => void;
  todayStatus: 'idle' | 'loading' | 'error';
  /** what to call the centre tile's colour in the rules text. Comes from the
   *  palette, because "the amber center letter" is wrong in a palette where it
   *  is not amber — and the sentence is the only place the colour is named. */
  centreColour: string;
}) {
  const fetching = todayStatus === 'loading';

  return (
    <div className="mb-8 text-center">
      <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-3">
        The hive
      </label>
      <div className="relative w-full max-w-[14rem] aspect-square mx-auto">
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <Tile
            index={0}
            group="bee"
            osk={osk}
            value={center}
            state="center"
            size="sm"
            onChange={onCenter}
          />
        </div>
        {POSITIONS.map(([x, y], i) => (
          <div
            key={i}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${x}%`, top: `${y}%` }}
          >
            <Tile
              index={i + 1}
              group="bee"
              osk={osk}
              value={outers[i]}
              state={outers[i] ? 'known' : 'empty'}
              size="sm"
              onChange={(c) => onOuters((prev) => prev.map((v, j) => (j === i ? c : v)))}
            />
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
        {[
          { label: "Today's daily hive", onClick: onFillDaily },
          { label: "Today's NYT bee", onClick: onFillNyt },
        ].map((b) => (
          <button
            key={b.label}
            onClick={b.onClick}
            disabled={fetching}
            className="inline-flex items-center gap-1.5 px-4 h-10 rounded-lg text-sm font-semibold bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 hover:text-white transition-colors disabled:opacity-50"
          >
            <CalendarDays className="w-4 h-4" />
            {fetching ? 'Fetching…' : b.label}
          </button>
        ))}
      </div>
      {todayStatus === 'error' && (
        <p className="mt-2 text-xs text-danger">
          Couldn&apos;t fetch today&apos;s puzzle — try again in a minute.
        </p>
      )}
      <p className="mt-3 text-xs text-slate-500">
        Words are 4+ letters, must use the {centreColour} center letter, and may repeat letters.
        Words using all seven letters are pangrams. Both today&apos;s puzzles become available
        about 15 minutes after 3:00&nbsp;a.m. Eastern.
      </p>
    </div>
  );
}
