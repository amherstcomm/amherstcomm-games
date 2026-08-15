// The ladder board, in one place.
//
// It lived twice — once in the game, once redrawn from scratch in Learn — and
// the copies were identical right up until the game grew letter boxes, at
// which point Learn was teaching a board that no longer existed. A demo that
// does not look like the game is worse than no demo, because the player learns
// something they then have to unlearn.
//
// The entry row is the part that genuinely differs: the game types into a real
// input, Learn into a document key listener. So the boxes are shared and each
// caller passes its own way of catching a keystroke.
import type { ReactNode } from 'react';

/** One letter cell. Sized like Guess's tiles so the two boards read as the
 *  same family, a notch smaller because a ladder stacks many more rows. */
export const LADDER_BOX =
  'w-9 h-11 sm:w-10 sm:h-12 flex items-center justify-center rounded-lg border-2 text-lg sm:text-xl font-bold uppercase transition-colors';

/** A committed word as a row of boxes.
 *
 *  The boxes are `aria-hidden` and the word is carried by an `sr-only` span,
 *  which is the whole reason this is a component rather than a map inline.
 *  Nine boxes holding one letter each read as nine letters — "B, A, S, K" —
 *  and the plainest board here would have become the least legible by ear the
 *  moment it got prettier. */
export function LadderWord({
  word,
  tone,
  changed = -1,
}: {
  word: string;
  tone: 'end' | 'rung';
  changed?: number;
}) {
  return (
    <>
      <span className="sr-only">{word}</span>
      <div aria-hidden className="flex justify-center gap-1.5">
        {word.split('').map((ch, i) => (
          <span
            key={i}
            className={`${LADDER_BOX} ${
              tone === 'end'
                ? 'border-white/25 bg-white/[0.06] text-white'
                : i === changed
                  ? 'border-amber-400 bg-amber-400/20 text-white'
                  : 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200'
            }`}
          >
            {ch}
          </span>
        ))}
      </div>
    </>
  );
}

/** The row being typed into. `children` is the caller's input, positioned over
 *  the boxes so a tap lands on it. */
export function LadderEntry({
  length,
  value,
  children,
}: {
  length: number;
  value: string;
  children?: ReactNode;
}) {
  return (
    <div className="relative">
      <div aria-hidden className="flex justify-center gap-1.5">
        {Array.from({ length }, (_, i) => (
          <span
            key={i}
            className={`${LADDER_BOX} ${
              i === value.length
                ? 'border-amber-400 bg-white/10 text-white'
                : 'border-amber-400/50 bg-white/5 text-white'
            }`}
          >
            {value[i] ?? ''}
          </span>
        ))}
      </div>
      {children}
    </div>
  );
}
