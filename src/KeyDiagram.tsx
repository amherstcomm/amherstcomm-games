import type { NavKeys } from '@/storage';

// the eight direction keys as they sit on a keyboard, so the layout reads at
// a glance; the centre marks where the cursor is
const NAV_KEY_GRID: Record<NavKeys, string[]> = {
  numpad: ['7', '8', '9', '4', '', '6', '1', '2', '3'],
  wasd: ['Q', 'W', 'E', 'A', '', 'D', 'Z', 'S', 'X'],
};

export default function KeyDiagram({ scheme }: { scheme: NavKeys }) {
  return (
    <div className="grid grid-cols-3 gap-1 w-fit shrink-0" aria-hidden="true">
      {NAV_KEY_GRID[scheme].map((k, i) =>
        k ? (
          <span
            key={i}
            className="w-7 h-7 flex items-center justify-center rounded-md bg-white/10 border border-white/15 text-[11px] font-mono font-semibold text-slate-200"
          >
            {k}
          </span>
        ) : (
          <span
            key={i}
            className="w-7 h-7 flex items-center justify-center rounded-md border border-dashed border-amber-400/50 text-[10px] text-accent"
          >
            ●
          </span>
        )
      )}
    </div>
  );
}
