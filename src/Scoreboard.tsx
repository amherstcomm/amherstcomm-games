// The board, for the wall.
//
// The standings on the presenter's screen are a summary beside a question.
// This is the thing you put on the projector when the round is over, and the
// thing you open afterwards when somebody asks how.
//
// The breakdown is the point rather than a decoration. A prize gets handed to
// somebody in a room and the first question is "how" — "she had four and you
// had three and a half" only settles it if the half can be pointed at. Half a
// question is now a real score, so this matters more than it did.
import { useCallback, useEffect, useState } from 'react';
import { Loader2, Trophy } from 'lucide-react';
import { readSessionScores, type SessionScores } from '@/live';
import { pathOf } from '@/routes';

/** Marks are numbers a room reads at a distance: 1, 0.5, 0. Not 1.00, and not
 *  0.3333333333 — a third of a question is 0.33 on the wall and the total it
 *  adds into is rounded once, on the server. */
const mark = (n: number | undefined) =>
  n === undefined ? '·' : Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, '');

export default function Scoreboard({ session }: { session: string }) {
  const [board, setBoard] = useState<SessionScores | null>(null);

  const pull = useCallback(async () => setBoard(await readSessionScores(session)), [session]);
  useEffect(() => {
    void pull();
    // A board left on a screen while the round finishes should finish with it.
    // Slower than the live screen because nothing here changes between reveals.
    const id = window.setInterval(() => void pull(), 10_000);
    return () => window.clearInterval(id);
  }, [pull]);

  if (board === null) return <Loader2 className="w-4 h-4 animate-spin text-slate-500 m-8" />;
  if (!board.ok) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-10">
        <p className="text-sm text-slate-400">{board.reason ?? 'That board is not available.'}</p>
      </div>
    );
  }

  const questions = board.questions ?? [];
  const standings = board.standings ?? [];

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <p className="text-xs uppercase tracking-wider text-slate-500">
        <a href={pathOf({ kind: 'sessions', session })} className="hover:text-accent">
          {board.title}
        </a>
      </p>
      <h1 className="text-3xl sm:text-4xl font-bold text-white mt-1 mb-1">Scores</h1>
      <p className="text-sm text-slate-400 mb-8">
        {questions.length === 0
          ? 'Nothing has been revealed yet.'
          : `After ${questions.length} ${questions.length === 1 ? 'question' : 'questions'}${
              board.state === 'closed' ? ' — finished' : ''
            }`}
      </p>

      {standings.length === 0 ? (
        <p className="text-sm text-slate-400">Nobody has answered anything yet.</p>
      ) : (
        // Its own scroller: a wide round would otherwise push the whole page
        // sideways, and a projector is the one place that is least recoverable.
        <div className="overflow-x-auto -mx-4 px-4">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="text-xs uppercase tracking-wider text-slate-500">
                <th className="py-2 pr-3 font-semibold">#</th>
                <th className="py-2 pr-4 font-semibold">Name</th>
                <th className="py-2 pr-4 font-semibold text-right">Points</th>
                <th className="py-2 pr-6 font-semibold text-right">Time</th>
                {questions.map((q) => (
                  // The number is what fits; the prompt is what identifies it,
                  // so it goes in the tooltip rather than in a column head that
                  // would be wider than the whole table.
                  <th
                    key={q.id}
                    className="py-2 px-2 font-semibold text-center"
                    title={q.prompt}
                    scope="col"
                  >
                    {q.position}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {standings.map((s, i) => (
                <tr
                  key={`${s.name}-${i}`}
                  className="border-t border-white/10 text-sm sm:text-base"
                >
                  <td className="py-2.5 pr-3 tabular-nums text-slate-500">
                    {s.place === 1 ? (
                      <span className="inline-flex items-center gap-1 text-accent">
                        <Trophy className="w-4 h-4" aria-hidden="true" />1
                      </span>
                    ) : (
                      s.place
                    )}
                  </td>
                  <td className="py-2.5 pr-4 text-white font-medium">{s.name}</td>
                  <td className="py-2.5 pr-4 text-right tabular-nums text-white font-semibold">
                    {s.points}
                  </td>
                  {/* The tiebreak, next to the thing it breaks ties in — the
                      question anybody who came second on the same score asks. */}
                  <td className="py-2.5 pr-6 text-right tabular-nums text-slate-400">
                    {s.seconds == null ? '—' : `${s.seconds}s`}
                  </td>
                  {questions.map((q) => {
                    const m = s.marks?.[String(q.position)];
                    return (
                      <td
                        key={q.id}
                        className={`py-2.5 px-2 text-center tabular-nums ${
                          m === undefined
                            ? 'text-slate-600'
                            : m >= 1
                              ? 'text-emerald-300'
                              : m > 0
                                ? 'text-slate-200'
                                : 'text-slate-500'
                        }`}
                      >
                        {mark(m)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {questions.length > 0 && (
        <ol className="mt-8 space-y-1 text-sm text-slate-400">
          {questions.map((q) => (
            <li key={q.id}>
              <span className="text-slate-500 tabular-nums mr-2">{q.position}</span>
              {q.prompt}
            </li>
          ))}
        </ol>
      )}

      {/* A dot is a question somebody was not there for, which is a different
          thing from getting it wrong and is worth saying once. */}
      {standings.length > 0 && (
        <p className="mt-6 text-xs text-slate-500">
          · means they did not answer that one. 0 means they did.
        </p>
      )}
    </div>
  );
}
