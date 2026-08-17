// A rectangle of letters with a route drawn over it.
//
// Grid and Weave are the same board at two sizes: type letters into cells,
// hover a result, watch the path light up. The two blocks in App.tsx were
// identical apart from the column count and the gap — including the SVG
// overlay, twice, character for character.
//
// It takes the trace rather than owning one. `useBoardTrace` already bundles
// the ref, the target and the measured points into one object, so this is a
// single prop instead of four, and the caller keeps the choice of how many
// boards share an instance. Grid and Weave shared a single one for a long time,
// which was only ever safe because exactly one of them is mounted at a time.
import Tile from '@/Tile';
import type { useBoardTrace } from '@/solvers/useBoardTrace';

export type PathTrace = ReturnType<typeof useBoardTrace<number[]>>;

// Sky, where a typed letter is emerald and an empty cell is white-on-dark, so
// a traced tile is distinguishable from both states it might otherwise be in.
// Two variants because a traced cell you already filled still has to read as
// filled. Moved here unchanged from App; no contrast floor is asserted on it,
// which palettes.test.ts would be the place for if one ever is.
const TONE = {
  empty: 'bg-sky-400/25 border-sky-300 text-white',
  filled: 'bg-sky-400/30 border-sky-300 text-white shadow-[0_0_20px_-6px] shadow-sky-400/50',
};

/** Tailwind needs whole class names to survive its scan, so these cannot be
 *  built by interpolation. */
const COLS: Record<number, string> = {
  3: 'grid-cols-3',
  4: 'grid-cols-4',
  5: 'grid-cols-5',
  6: 'grid-cols-6',
  8: 'grid-cols-8',
};

export default function TracedBoard({
  letters,
  cols,
  group,
  gap,
  osk,
  trace,
  onLetter,
}: {
  letters: string[];
  cols: number;
  /** scopes tile-to-tile focus movement; two boards on a page must differ */
  group: string;
  gap: string;
  osk: boolean;
  trace: PathTrace;
  onLetter: (index: number, ch: string) => void;
}) {
  // One polyline: a path visits each cell once, so the hook's per-word list has
  // exactly one entry here. Boxed is the case that needs more, and draws its
  // own — chords between sides are not a route through cells.
  const path = trace.points[0];

  return (
    <div ref={trace.boardRef} className="relative w-fit mx-auto">
      <div className={`grid ${gap} ${COLS[cols] ?? 'grid-cols-4'}`}>
        {letters.map((v, i) => (
          <Tile
            key={i}
            index={i}
            group={group}
            osk={osk}
            value={v}
            state={v ? 'known' : 'empty'}
            size="sm"
            tone={trace.target?.includes(i) ? TONE : undefined}
            onChange={(c) => onLetter(i, c)}
          />
        ))}
      </div>
      {(path?.length ?? 0) > 1 && (
        <svg className="absolute inset-0 w-full h-full pointer-events-none">
          <polyline
            points={path.map((p) => `${p.x},${p.y}`).join(' ')}
            fill="none"
            stroke="rgb(var(--trace) / 0.9)"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* where the word starts, since a polyline alone does not say which
              end is which */}
          <circle cx={path[0].x} cy={path[0].y} r="6" fill="rgb(var(--trace))" />
        </svg>
      )}
    </div>
  );
}
