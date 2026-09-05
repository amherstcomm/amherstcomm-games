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
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, BarChart3, Loader2, Play, Trophy, X } from 'lucide-react';
import {
  readSessionResults,
  readSessionScores,
  type SessionResults,
  type SessionScores,
} from '@/live';
import ChartFor from '@/Charts';
import { pathOf } from '@/routes';

/** Marks are numbers a room reads at a distance: 1, 0.5, 0. Not 1.00, and not
 *  0.3333333333 — a third of a question is 0.33 on the wall and the total it
 *  adds into is rounded once, on the server. */
const mark = (n: number | undefined) =>
  n === undefined ? '·' : Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, '');

/** Two views of one afternoon, on one address.
 *
 *  Standings answer "who won"; results answer "how did that one go". They are
 *  tabs rather than two pages because they are the same question asked twice —
 *  and because the thing on the wall should not need a second link found and
 *  typed while a room waits. */
type View = 'standings' | 'results';

const CONTROL =
  'inline-flex items-center justify-center gap-1.5 px-3 h-9 rounded-lg text-sm font-semibold border';

/** One result at a time, for walking a room through it.
 *
 *  The scrolling list is right for reading afterwards and wrong for standing in
 *  front of people: you talk about one question, then the next, and scrolling
 *  to find the next one while everybody watches is the part that goes badly.
 *
 *  The standings are the last slide rather than a separate destination, because
 *  that is the order it gets told in — how each question went, and then who
 *  won.
 *
 *  Arrow keys, Page Up and Page Down, space and backspace. A presentation
 *  remote is a keyboard that sends some subset of those and nobody knows which,
 *  so it answers to all of them. */
function Slides({
  items,
  standings,
  title,
  clouds,
  onCloud,
  onLeave,
}: {
  items: NonNullable<SessionResults['items']>;
  standings: ReactNode;
  title: string;
  clouds: Record<string, boolean>;
  onCloud: (id: string) => void;
  onLeave: () => void;
}) {
  const [at, setAt] = useState(0);
  /** One past the last question is the standings. */
  const last = items.length;
  const go = useCallback((d: -1 | 1) => setAt((n) => Math.min(last, Math.max(0, n + d))), [last]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (['ArrowRight', 'PageDown', ' ', 'Spacebar'].includes(e.key)) {
        e.preventDefault();
        go(1);
      } else if (['ArrowLeft', 'PageUp', 'Backspace'].includes(e.key)) {
        e.preventDefault();
        go(-1);
      } else if (e.key === 'Escape') {
        onLeave();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [go, onLeave]);

  const q = items[at];

  return (
    <div className="min-h-[70vh] flex flex-col">
      <div className="flex items-center justify-between gap-3 mb-6">
        <p className="text-xs uppercase tracking-wider text-slate-500 truncate">{title}</p>
        <button
          onClick={onLeave}
          className={`${CONTROL} border-white/15 bg-white/10 text-slate-200 hover:bg-white/15 shrink-0`}
        >
          <X className="w-4 h-4" aria-hidden="true" />
          Leave
        </button>
      </div>

      {/* aria-live, because the page itself does not move: a screen reader is
          told the slide changed rather than left on the first one. */}
      <div className="flex-1" aria-live="polite">
        {q ? (
          <>
            <p className="text-sm uppercase tracking-wider text-slate-500">
              {q.position} · {q.kind}
              {q.chart?.total != null && ` · ${q.chart.total} answered`}
            </p>
            <h2 className="text-3xl sm:text-5xl font-bold text-white mb-8 mt-1">{q.prompt}</h2>
            <ChartFor chart={q.chart} big cloud={clouds[q.id]} />
            {q.chart?.type === 'texts' && (
              <button
                onClick={() => onCloud(q.id)}
                className="mt-6 text-sm text-accent hover:brightness-110"
              >
                {clouds[q.id] ? 'Show what was said' : 'Show it as a word cloud'}
              </button>
            )}
          </>
        ) : (
          <>
            <h2 className="text-3xl sm:text-5xl font-bold text-white mb-8">Who won</h2>
            {standings}
          </>
        )}
      </div>

      <div className="flex items-center justify-between gap-4 mt-8">
        <button
          onClick={() => go(-1)}
          disabled={at === 0}
          aria-label="Previous"
          className={`${CONTROL} h-12 px-5 border-white/15 bg-white/10 text-slate-200 hover:bg-white/15 disabled:opacity-40`}
        >
          <ArrowLeft className="w-5 h-5" aria-hidden="true" />
        </button>
        <p className="text-sm text-slate-500 tabular-nums">
          {at + 1} of {last + 1}
        </p>
        <button
          onClick={() => go(1)}
          disabled={at === last}
          aria-label="Next"
          className={`${CONTROL} h-12 px-5 border-white/15 bg-white/10 text-slate-200 hover:bg-white/15 disabled:opacity-40`}
        >
          <ArrowRight className="w-5 h-5" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

export default function Scoreboard({ session }: { session: string }) {
  const [board, setBoard] = useState<SessionScores | null>(null);
  const [results, setResults] = useState<SessionResults | null>(null);
  // Results, because that is what the slideshow was showing: leaving it should
  // put you where you were rather than somewhere else.
  const [view, setView] = useState<View>('results');
  /** One at a time by default. It is the way this gets looked at — in front of
   *  a room, or afterwards by somebody catching up — and the scrolling list is
   *  the special case, for reading the whole thing at once. */
  const [slides, setSlides] = useState(true);
  /** Which open questions are showing as a cloud rather than as a list. Per
   *  question, because the choice depends on the answers: a handful of
   *  sentences is a list, two hundred one-word answers is a cloud. */
  const [clouds, setClouds] = useState<Record<string, boolean>>({});

  const pull = useCallback(async () => {
    setBoard(await readSessionScores(session));
    setResults(await readSessionResults(session));
  }, [session]);
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
  const items = results?.items ?? [];

  /** Named, because the last slide shows the same table. Two renderings of one
   *  set of standings would eventually disagree about who won, which is the one
   *  thing this page must not do. */
  const standingsTable =
    standings.length === 0 ? (
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
                // The number is what fits; the prompt is what identifies it, so
                // it goes in the tooltip rather than in a column head that would
                // be wider than the whole table.
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
              <tr key={`${s.name}-${i}`} className="border-t border-white/10 text-sm sm:text-base">
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
    );

  if (slides) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <Slides
          items={items}
          standings={standingsTable}
          title={board.title ?? ''}
          clouds={clouds}
          onCloud={(id) => setClouds((c) => ({ ...c, [id]: !c[id] }))}
          onLeave={() => setSlides(false)}
        />
      </div>
    );
  }

  const shown = view === 'results' ? items.length : questions.length;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <p className="text-xs uppercase tracking-wider text-slate-500">
        <a href={pathOf({ kind: 'sessions', session })} className="hover:text-accent">
          {board.title}
        </a>
      </p>
      <h1 className="text-3xl sm:text-4xl font-bold text-white mt-1 mb-1">
        {view === 'standings' ? 'Scores' : 'Results'}
      </h1>
      {/* Counted per view. The standings count only the questions that score;
          the results cover every one that has been shown, because a survey has
          no score and is the question most worth a chart. One subtitle for both
          would be wrong on one of them. */}
      <p className="text-sm text-slate-400 mb-8">
        {shown === 0
          ? view === 'results'
            ? 'Nothing has been answered yet.'
            : 'Nothing has been revealed yet.'
          : `After ${shown} ${shown === 1 ? 'question' : 'questions'}${
              board.state === 'closed' ? ' — finished' : ''
            }`}
      </p>

      <div className="flex flex-wrap gap-2 mb-6">
        {(
          [
            ['standings', 'Who won', Trophy],
            ['results', 'How each question went', BarChart3],
          ] as const
        ).map(([v, label, Icon]) => (
          <button
            key={v}
            onClick={() => setView(v)}
            aria-pressed={view === v}
            className={`${CONTROL} ${
              view === v
                ? 'border-accent bg-accent/15 text-white'
                : 'border-white/15 text-slate-300 hover:bg-white/5'
            }`}
          >
            <Icon className="w-4 h-4" aria-hidden="true" />
            {label}
          </button>
        ))}
        {view === 'results' && items.length > 0 && (
          <button
            onClick={() => setSlides(true)}
            className={`${CONTROL} border-white/15 text-slate-300 hover:bg-white/5`}
          >
            <Play className="w-4 h-4" aria-hidden="true" />
            One at a time
          </button>
        )}
      </div>

      {view === 'results' ? (
        <div className="space-y-8">
          {items.length === 0 && (
            <p className="text-sm text-slate-400">Nothing has been answered yet.</p>
          )}
          {items.map((q) => (
            <section key={q.id}>
              <p className="text-xs uppercase tracking-wider text-slate-500">
                {q.position} · {q.kind}
                {q.chart?.total != null && ` · ${q.chart.total} answered`}
              </p>
              <h2 className="text-lg sm:text-xl font-semibold text-white mb-3">{q.prompt}</h2>
              <ChartFor chart={q.chart} cloud={clouds[q.id]} />
              {q.chart?.type === 'texts' && (
                <button
                  onClick={() => setClouds((c) => ({ ...c, [q.id]: !c[q.id] }))}
                  className="mt-3 text-xs text-accent hover:brightness-110"
                >
                  {clouds[q.id] ? 'Show what was said' : 'Show it as a word cloud'}
                </button>
              )}
            </section>
          ))}
        </div>
      ) : (
        standingsTable
      )}

      {view === 'standings' && questions.length > 0 && (
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
      {view === 'standings' && standings.length > 0 && (
        <p className="mt-6 text-xs text-slate-500">
          · means they did not answer that one. 0 means they did.
        </p>
      )}
    </div>
  );
}
