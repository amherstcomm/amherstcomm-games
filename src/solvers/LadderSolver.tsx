// The Ladder solver: two words in, the shortest route between them out.
//
// Second of the solver surfaces out of App.tsx, following BridgeSolver. What
// stays behind is the pair of words, because they are persisted with the rest
// of the solver state on a shared timer. What comes here is everything about
// laddering: the inputs, the search, and how a route is drawn.
//
// The rules live in @/ladder, which the play surface imports too — that is the
// piece the two surfaces legitimately share, and the reason this is a sibling
// of LadderGame rather than a part of it.
import { useMemo } from 'react';
import { shortestLadder } from '@/ladder';

type Answer =
  | { kind: 'idle'; note: string }
  | { kind: 'none'; note: string }
  | { kind: 'route'; route: string[] };

const clean = (v: string) => v.toLowerCase().replace(/[^a-z]/g, '');

export default function LadderSolver({
  from,
  to,
  onFrom,
  onTo,
  words,
}: {
  from: string;
  to: string;
  onFrom: (v: string) => void;
  onTo: (v: string) => void;
  /** the common tier, not the accept tier; null while it loads */
  words: string[] | null;
}) {
  // It refuses before it searches, because the three ways this can be asked
  // wrongly — different lengths, a word the list doesn't have, nothing typed
  // yet — are all cheaper to explain than a blank result. Searching over the
  // common tier rather than the accept tier keeps the route made of words a
  // person would use; a ladder through `esne` answers the question and helps
  // nobody.
  const answer = useMemo((): Answer => {
    if (!from || !to) return { kind: 'idle', note: 'Enter two words.' };
    if (from.length !== to.length)
      return { kind: 'none', note: 'Both words have to be the same length.' };
    if (from === to) return { kind: 'idle', note: 'Those are the same word.' };
    if (!words) return { kind: 'idle', note: 'Loading the word list…' };
    const pool = new Set(words);
    for (const w of [from, to])
      if (!pool.has(w)) return { kind: 'none', note: `${w} is not in the word list.` };
    const route = shortestLadder(from, to, pool);
    return route ? { kind: 'route', route } : { kind: 'none', note: 'No ladder connects those two.' };
  }, [from, to, words]);

  return (
    <div className="mb-8 max-w-md mx-auto">
      <p className="text-sm text-slate-300 mb-3">
        Two words of the same length. The shortest ladder between them, if there is one.
      </p>
      <div className="flex items-center gap-2">
        <label htmlFor="ladder-from" className="sr-only">
          from
        </label>
        <input
          id="ladder-from"
          value={from}
          onChange={(e) => onFrom(clean(e.target.value))}
          placeholder="cold"
          autoComplete="off"
          spellCheck={false}
          className="w-full text-center text-lg font-bold uppercase tracking-widest rounded-lg bg-white/5 border border-white/10 text-slate-200 px-3 py-2"
        />
        <span aria-hidden className="text-slate-500">
          to
        </span>
        <label htmlFor="ladder-to" className="sr-only">
          to
        </label>
        <input
          id="ladder-to"
          value={to}
          onChange={(e) => onTo(clean(e.target.value))}
          placeholder="warm"
          autoComplete="off"
          spellCheck={false}
          className="w-full text-center text-lg font-bold uppercase tracking-widest rounded-lg bg-white/5 border border-white/10 text-slate-200 px-3 py-2"
        />
      </div>
      <div aria-live="polite" className="mt-4">
        {answer.kind === 'idle' && <p className="text-sm text-slate-500 text-center">{answer.note}</p>}
        {answer.kind === 'none' && <p className="text-sm text-amber-300 text-center">{answer.note}</p>}
        {answer.kind === 'route' && (
          <>
            <p className="text-xs text-slate-400 text-center mb-2">
              {answer.route.length - 1} steps
            </p>
            <ol className="space-y-1">
              {answer.route.map((w, i) => (
                <li
                  key={`${w}-${i}`}
                  className="text-center text-lg font-bold uppercase tracking-widest text-slate-200"
                >
                  {w}
                </li>
              ))}
            </ol>
          </>
        )}
      </div>
    </div>
  );
}
