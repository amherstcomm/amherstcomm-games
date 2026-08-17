// A row of letters you type into, one chip each.
//
// Three solvers use it — Scramble's rack, and the pattern solver's "must
// contain" and "must not contain" — which is why it is not inside any of them.
//
// It is not an ordinary text field. Each letter renders as its own removable
// chip and the real <input> is kept empty, holding only the caret: typing
// appends to `value`, Backspace pops the last chip. That is what makes a
// wildcard visible as a thing rather than a `?` buried in a string, and what
// lets one letter be deleted from the middle of a rack by clicking it.
//
// COARSE_POINTER is why the field can be read-only and still accept typing —
// see the note in @/coarsePointer. On a touch device the on-screen keyboard
// writes the value programmatically, and a physical keyboard is served from
// the key event instead.
import { useRef } from 'react';
import { X } from 'lucide-react';
import { COARSE_POINTER } from '@/coarsePointer';

export default function LetterChipInput({
  value,
  onChange,
  ariaLabel,
  placeholder,
  maxLen,
  allowWildcard = false,
  tone,
  osk,
}: {
  value: string;
  onChange: (v: string) => void;
  ariaLabel: string;
  placeholder: string;
  maxLen: number;
  allowWildcard?: boolean;
  tone: 'amber' | 'rose';
  osk?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const tones = {
    amber: {
      container: 'focus-within:border-amber-400 focus-within:bg-amber-400/5',
      pill: 'bg-amber-400/15 border-amber-400/30 text-amber-200',
    },
    rose: {
      container: 'focus-within:border-rose-400 focus-within:bg-rose-400/5',
      pill: 'bg-rose-400/15 border-rose-400/30 text-rose-300',
    },
  }[tone];

  return (
    <div
      onClick={() => inputRef.current?.focus()}
      className={`w-full min-h-[3rem] px-2.5 py-2 rounded-xl bg-white/5 border-2 border-white/10 flex flex-wrap items-center justify-center gap-x-2 gap-y-2.5 cursor-text transition-all ${tones.container}`}
    >
      {value.split('').map((c, i) => (
        <span
          key={i}
          className={`relative inline-flex items-center justify-center w-8 h-8 rounded-lg border text-base font-bold uppercase ${tones.pill}`}
        >
          {c}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onChange(value.slice(0, i) + value.slice(i + 1));
              inputRef.current?.focus();
            }}
            tabIndex={-1}
            aria-label={`Remove ${c === '?' ? 'wildcard' : c}`}
            className="absolute -top-1.5 -right-1.5 w-4 h-4 flex items-center justify-center rounded-full bg-slate-800 border border-white/25 text-slate-300 hover:text-white hover:bg-slate-700 hover:border-white/50 transition-colors"
          >
            <X className="w-2.5 h-2.5" />
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        value=""
        onChange={(e) => {
          const add = e.target.value
            .toLowerCase()
            .replace(allowWildcard ? /[^a-z?]/g : /[^a-z]/g, '');
          if (add) onChange((value + add).slice(0, maxLen));
        }}
        onKeyDown={(e) => {
          if (e.key === 'Backspace' && value) onChange(value.slice(0, -1));
          // as above: read-only swallows typing, so accept it from the key event
          else if (osk && COARSE_POINTER) {
            const ok = allowWildcard ? /^[a-zA-Z?]$/ : /^[a-zA-Z]$/;
            if (ok.test(e.key)) {
              e.preventDefault();
              onChange((value + e.key.toLowerCase()).slice(0, maxLen));
            }
          }
        }}
        inputMode={osk ? 'none' : undefined}
        readOnly={osk && COARSE_POINTER}
        aria-label={ariaLabel}
        placeholder={value ? '' : placeholder}
        className={`h-8 bg-transparent outline-none text-white placeholder-slate-600 text-base text-center ${value ? 'w-2 p-0' : 'flex-1 min-w-[4rem] px-1'}`}
      />
    </div>
  );
}
