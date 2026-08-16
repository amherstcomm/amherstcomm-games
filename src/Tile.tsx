// A single letter box, shared by six boards.
//
// Counted, not guessed — the `group` names in flight are bee (×2), boxed (×2),
// grid, known, squares and weave, so it belongs to no one solver and cannot
// live inside any of them. It moved out of App.tsx ahead of the solvers
// themselves for exactly that reason: the first extraction that needed it
// would otherwise have taken a copy, and two copies of a focus-management
// component drift silently — one gets the arrow-key fix and the other does not.
//
// Focus moves by querying the DOM for the next tile rather than by holding refs
// to siblings, because the tiles are rendered by callers with no shared parent
// that knows the order. `group` scopes that query, which is why two boards on
// one page cannot steal each other's focus — and why the name is a prop rather
// than derived from anything.
import { useRef } from 'react';
import { X } from 'lucide-react';
import { COARSE_POINTER } from '@/coarsePointer';

export default function Tile({
  value,
  onChange,
  state,
  index,
  size,
  group,
  osk,
  tone,
}: {
  value: string;
  onChange: (v: string) => void;
  state: 'known' | 'empty' | 'center';
  index: number;
  size: 'sm' | 'md';
  group: string;
  osk?: boolean; // on-screen keyboard active: suppress the device keyboard
  tone?: { empty: string; filled: string }; // color override, e.g. boxed side hues
}) {
  const ref = useRef<HTMLInputElement>(null);
  const dims =
    size === 'sm'
      ? 'w-9 h-11 sm:w-10 sm:h-12 text-xl sm:text-2xl'
      : 'w-12 h-14 sm:w-14 sm:h-16 text-2xl sm:text-3xl';

  const focusTile = (i: number) => {
    const el = document.querySelector<HTMLInputElement>(
      `input[data-tile-group="${group}"][data-tile-index="${i}"]`
    );
    el?.focus();
    el?.select();
  };

  return (
    <div className="relative">
      <input
        ref={ref}
        data-tile-group={group}
        data-tile-index={index}
        value={value}
        onChange={(e) => {
          const raw = e.target.value.toLowerCase().replace(/[^a-z]/g, '');
          const c = raw.slice(-1);
          onChange(c);
          if (c) focusTile(index + 1);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Backspace' && !value) focusTile(index - 1);
          else if (e.key === 'ArrowLeft') focusTile(index - 1);
          else if (e.key === 'ArrowRight') focusTile(index + 1);
          // read-only fields swallow typing, so a physical keyboard on a
          // touch device (an iPad with a case, say) is served here instead
          else if (osk && COARSE_POINTER && /^[a-zA-Z]$/.test(e.key)) {
            e.preventDefault();
            onChange(e.key.toLowerCase());
            focusTile(index + 1);
          } else if (osk && COARSE_POINTER && e.key === 'Backspace' && value) {
            e.preventDefault();
            onChange('');
          }
        }}
        maxLength={1}
        inputMode={osk ? 'none' : undefined}
        readOnly={osk && COARSE_POINTER}
        aria-label={`Letter at position ${index + 1}`}
        placeholder="·"
        className={`${dims} text-center font-bold uppercase rounded-xl border-2 transition-all duration-150 outline-none
          ${state === 'known'
            ? tone?.filled ?? 'bg-emerald-500/15 border-emerald-400 text-emerald-200 shadow-[0_0_20px_-6px] shadow-emerald-500/40'
            : state === 'center'
              ? 'bg-amber-400/15 border-amber-400 text-amber-200 shadow-[0_0_20px_-6px] shadow-amber-400/50 placeholder-amber-200/30'
              : tone?.empty ?? 'bg-white/5 border-white/55 text-white placeholder-white/25 hover:border-white/75'}
          focus:border-amber-400 focus:bg-amber-400/10 focus:shadow-[0_0_24px_-6px] focus:shadow-amber-400/50`}
      />
      {value && (
        <button
          onClick={() => {
            onChange('');
            ref.current?.focus();
          }}
          tabIndex={-1}
          aria-label={`Clear letter at position ${index + 1}`}
          className="absolute -top-1.5 -right-1.5 w-5 h-5 flex items-center justify-center rounded-full bg-slate-800 border border-white/25 text-slate-300 hover:text-white hover:bg-slate-700 hover:border-white/50 transition-colors shadow-md"
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}

