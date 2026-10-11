// One prompt — `X · ? · Y` — drawn the same way in the game and in Learn.
//
// It lives here because the ladder taught the lesson: Learn had its own copy
// of that board, the copies were identical right up until the game changed,
// and the demo went on teaching a board that no longer existed. A demo that
// does not look like the game is worse than no demo.
//
// The two ends carry different weights rather than different hues. A blend of
// two colours is the obvious way to say "this word belongs to both sides" and
// it fails on the palettes that exist for people who cannot use hue: under
// Monochrome a blend of two lightnesses is a third lightness between them,
// which is the least distinguishable value on offer. Position does the same
// job and survives every palette.
import type { Prompt } from '@/bridge';

export function BridgeRow({
  prompt,
  answer,
  shown,
  picked,
  onPick,
}: {
  prompt: Prompt;
  /** the word found, or '' while it is still open */
  answer: string;
  /** what hints have turned over: the length, and the letters so far */
  shown: { prefix: string; length: number | null };
  picked: boolean;
  onPick?: () => void;
}) {
  const middle = answer
    ? answer
    : shown.length
      ? shown.prefix + '·'.repeat(shown.length - shown.prefix.length)
      : '?';
  // The row may wrap, and a word may break. Three uppercase words with their
  // own letter spacing, on one line that could not wrap, needed more room than
  // a phone at the largest text has whenever the day's words were long --
  // CAMERA · ? · SLAUGHTER ran 4px out of its box on the CI machine's font,
  // and fit on this one's. How wide a word is depends on whose font draws it,
  // so this cannot depend on it: past the width, the row takes a second line,
  // and a single word wider than the whole row breaks rather than spilling.
  const word = 'min-w-0 [overflow-wrap:anywhere]';
  return (
    <>
      <button
        type="button"
        onClick={onPick}
        disabled={!onPick}
        aria-current={picked ? 'true' : undefined}
        className={`w-full flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 rounded-lg border-2 px-2 py-2 transition-colors ${
          answer
            ? 'border-emerald-400/40 bg-emerald-400/10'
            : picked
              ? 'border-amber-400 bg-white/5'
              : 'border-white/10 bg-white/[0.02] hover:bg-white/5'
        }`}
      >
        <span className={`${word} text-sm font-bold uppercase tracking-wide text-sky-300`}>{prompt.x}</span>
        <span aria-hidden className="text-slate-600">·</span>
        <span
          className={`${word} min-w-16 text-sm font-bold uppercase tracking-widest ${
            answer ? 'text-emerald-200' : 'text-slate-500'
          }`}
        >
          {middle}
        </span>
        <span aria-hidden className="text-slate-600">·</span>
        <span className={`${word} text-sm font-bold uppercase tracking-wide text-violet-300`}>{prompt.y}</span>
      </button>
      {/* The row reads as three separate words to a screen reader otherwise,
          with no way to tell which is the gap. */}
      <span className="sr-only">
        {answer
          ? `${prompt.x} ${answer} ${prompt.y}, found`
          : `${prompt.x} blank ${prompt.y}${shown.length ? `, ${shown.length} letters` : ''}${
              shown.prefix ? `, starts ${shown.prefix.split('').join(' ')}` : ''
            }`}
      </span>
    </>
  );
}

export default BridgeRow;
