// The Bridge solver: two ends in, every word that joins them out.
//
// First of the solver surfaces to come out of App.tsx, and the shape the other
// nine should follow. The point is not that App gets shorter — it barely does —
// but that changing how Bridge solves no longer means opening a four-thousand
// line file and reading past nine other games to find out whether they are
// involved. They are not, and that should be visible without checking.
//
// What stays in App is the pair of strings, because they are persisted with the
// rest of the solver state and saved on a shared timer. What comes here is
// everything about *bridging*: the inputs, the answer, and how it is drawn.
//
// The rules live in @/bridge, which the play surface imports too — that is the
// piece the two surfaces legitimately share, and the reason this is a sibling
// of BridgeGame rather than a part of it.
import { useMemo } from 'react';
import { bridges } from '@/bridge';

type Answer =
  | { kind: 'idle'; note: string }
  | { kind: 'none'; note: string }
  | { kind: 'words'; words: string[] };

const clean = (v: string) => v.toLowerCase().replace(/[^a-z]/g, '').slice(0, 12);

export default function BridgeSolver({
  x,
  y,
  onX,
  onY,
  words,
}: {
  x: string;
  y: string;
  onX: (v: string) => void;
  onY: (v: string) => void;
  /** the accept list for the chosen difficulty; empty while it loads */
  words: string[] | null;
}) {
  // It answers exactly: membership in the word list is the whole rule, so there
  // is nothing to rank. Every word that joins the two ends, not one — more than
  // one can be right, even where the daily pool kept only prompts with a single
  // answer.
  const answer = useMemo((): Answer => {
    if (!x || !y) return { kind: 'idle', note: 'Enter both ends.' };
    if (!words) return { kind: 'idle', note: 'Loading the word list…' };
    const found = bridges({ x, y }, words);
    return found.length
      ? { kind: 'words', words: found }
      : { kind: 'none', note: `Nothing joins ${x.toUpperCase()} and ${y.toUpperCase()}.` };
  }, [x, y, words]);

  return (
    <div className="mb-8">
      <div className="flex items-end justify-center gap-2 mb-4">
        <div>
          <label
            htmlFor="bridge-x"
            className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-1.5"
          >
            First
          </label>
          <input
            id="bridge-x"
            aria-label="first"
            value={x}
            onChange={(e) => onX(clean(e.target.value))}
            placeholder="snow"
            className="w-28 text-center text-lg font-bold uppercase tracking-widest rounded-lg bg-white/5 border border-white/10 text-white px-2 py-1.5"
          />
        </div>
        <span aria-hidden className="pb-3 text-slate-600 text-lg">
          ·
        </span>
        <div>
          <label
            htmlFor="bridge-y"
            className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-1.5"
          >
            Second
          </label>
          <input
            id="bridge-y"
            aria-label="second"
            value={y}
            onChange={(e) => onY(clean(e.target.value))}
            placeholder="room"
            className="w-28 text-center text-lg font-bold uppercase tracking-widest rounded-lg bg-white/5 border border-white/10 text-white px-2 py-1.5"
          />
        </div>
      </div>

      {answer.kind === 'words' ? (
        <ul className="flex flex-wrap justify-center gap-2">
          {answer.words.map((w) => (
            <li key={w} className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-sm">
              <span className="text-slate-500 uppercase">{x}</span>
              <span className="font-bold uppercase text-accent">{w}</span>
              <span className="text-slate-500 uppercase">{y}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-center text-sm text-slate-400">{answer.note}</p>
      )}
    </div>
  );
}
