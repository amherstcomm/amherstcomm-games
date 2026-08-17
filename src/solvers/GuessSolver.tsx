// The Guess solver's controls: what you know about a word you haven't got.
//
// Three kinds of knowledge, and they are deliberately three separate controls
// rather than one clever field: a letter in a known spot, a letter present
// somewhere unknown, and a letter ruled out. Wordle-shaped knowledge arrives in
// exactly those three forms, so the input matches the thing rather than making
// you translate it.
//
// The word-length rung is *not* here. It sits above in App, because playing
// Guess needs it too and it is one rung of the shared control ladder — see the
// note in CLAUDE.md. This is only the half that exists when solving.
//
// The answers render in the shared ResultsPanel below, with `renderWord` set to
// the highlighter that tints letters you already knew.
import Tile from '@/Tile';
import LetterChipInput from '@/solvers/LetterChipInput';

export default function GuessSolver({
  known,
  onKnown,
  length,
  contains,
  onContains,
  excluded,
  onExcluded,
  osk,
}: {
  /** one slot per letter; empty string where the letter is unknown */
  known: string[];
  onKnown: (next: (prev: string[]) => string[]) => void;
  /** how many letters, which decides the tile size and nothing else here */
  length: number;
  contains: string;
  onContains: (v: string) => void;
  excluded: string;
  onExcluded: (v: string) => void;
  osk: boolean;
}) {
  return (
    <>
      <section className="mb-7 text-center">
        <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2.5">
          Known positions
        </label>
        <div className="flex flex-wrap gap-2 justify-center">
          {known.map((v, i) => (
            <Tile
              key={i}
              index={i}
              group="known"
              osk={osk}
              value={v}
              state={v ? 'known' : 'empty'}
              // past ten letters a row of md tiles is wider than a phone
              size={length > 10 ? 'sm' : 'md'}
              onChange={(c) => onKnown((prev) => prev.map((x, j) => (j === i ? c : x)))}
            />
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Fill a box only when you&apos;re certain of the letter in that spot.
        </p>
      </section>

      <div className="grid sm:grid-cols-2 gap-5 mb-8">
        <section>
          <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2.5">
            Must contain <span className="text-accent normal-case">(position unknown)</span>
          </label>
          <LetterChipInput
            value={contains}
            onChange={onContains}
            ariaLabel="Letters the word must contain"
            placeholder="e.g. d"
            maxLen={15}
            tone="amber"
            osk={osk}
          />
        </section>
        <section>
          <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2.5">
            Excluded letters
          </label>
          <LetterChipInput
            value={excluded}
            onChange={onExcluded}
            ariaLabel="Excluded letters"
            placeholder="letters not in the word"
            // every letter could be ruled out, so the cap is the alphabet
            maxLen={26}
            tone="rose"
            osk={osk}
          />
        </section>
      </div>
    </>
  );
}
