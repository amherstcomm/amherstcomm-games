// The results split by one question's answer, for the host and site admins.
//
// One table per other question: a row per group, a column per answer, so the
// groups read against each other. A group too small to show without showing
// somebody is a row that says so, not a row of numbers.
import { useEffect, useId, useState } from 'react';
import { Loader2, Lock } from 'lucide-react';
import { npsOf, readSplit, type Split, type SplitQuestion } from '@/split';

export default function SplitResults({ session, questions }: {
  session: string;
  /** the questions the results can be split by */
  questions: SplitQuestion[];
}) {
  const [by, setBy] = useState(questions[0]?.id ?? '');
  const [split, setSplit] = useState<Split | null>(null);
  const select = useId();

  useEffect(() => {
    if (!by) return;
    let live = true;
    setSplit(null);
    void readSplit(session, by).then((s) => live && setSplit(s));
    return () => {
      live = false;
    };
  }, [session, by]);

  return (
    <section aria-label="Split by an answer" className="space-y-6">
      <p className="flex items-start gap-1.5 text-sm text-slate-400">
        <Lock className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" />
        Only the host and site admins see this. Anybody the results are shared with sees the plain totals.
      </p>

      <div>
        <label htmlFor={select} className="block text-sm font-semibold text-white mb-1.5">
          Split everybody by how they answered
        </label>
        <select
          id={select}
          value={by}
          onChange={(e) => setBy(e.target.value)}
          className="w-full rounded-lg bg-slate-900 border border-white/15 px-3 h-11 text-sm text-slate-200 focus:outline-none focus:border-accent"
        >
          {questions.map((q) => (
            <option key={q.id} value={q.id}>
              {q.position}. {q.prompt}
            </option>
          ))}
        </select>
      </div>

      {split === null && <Loader2 className="w-4 h-4 animate-spin text-slate-500" aria-label="Loading" />}
      {split && !split.ok && (
        <p role="status" className="text-sm text-amber-300">
          {split.reason === 'waiting'
            ? `This shows once ${split.needed} people have answered the survey, so nobody can be worked out from a few. ${split.answered} so far.`
            : split.reason}
        </p>
      )}
      {split?.ok && <Tables split={split} />}
    </section>
  );
}

function Tables({ split }: { split: Extract<Split, { ok: true }> }) {
  const shown = split.groups.filter((g) => g.questions);
  const targets = shown[0]?.questions ?? [];
  const anyHidden = split.groups.some((g) => g.hidden);

  return (
    <div className="space-y-8">
      <div className="text-sm text-slate-400 space-y-1">
        <p>
          For “{split.by.prompt}”, each group is everybody who gave that answer.
          {split.by.kind === 'choice' || split.by.kind === 'survey'
            ? ' If it allowed more than one answer, somebody who picked two is in both groups.'
            : ''}
        </p>
        {anyHidden && (
          <p>
            A group of fewer than {split.min} is not broken down, so nobody&apos;s answers can be picked out.
          </p>
        )}
        {split.unlinked > 0 && (
          <p>
            {split.unlinked} {split.unlinked === 1 ? 'answer was' : 'answers were'} given before answers were linked,
            and {split.unlinked === 1 ? 'is' : 'are'} left out.
          </p>
        )}
      </div>

      {shown.length === 0 && (
        <p className="text-sm text-slate-300">No group is big enough to break down yet.</p>
      )}

      {shown.length > 0 && targets.length === 0 && (
        <p className="text-sm text-slate-300">There is no other question here that can be split this way.</p>
      )}

      {shown.length > 0 &&
        targets.map((t) => {
          const nps = t.kind === 'nps';
          return (
            <section key={t.id}>
              <p className="text-xs uppercase tracking-wider text-slate-500">{t.position}</p>
              <h3 className="text-base sm:text-lg font-semibold text-white mb-3">{t.prompt}</h3>
              {/* Focusable, so a table wider than a phone can be scrolled
                  from the keyboard too. */}
              <div className="overflow-x-auto rounded-xl border border-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                   tabIndex={0} role="region" aria-label={`${t.prompt}, by group`}>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-slate-400 border-b border-white/10">
                      <th scope="col" className="px-3 py-2 font-medium">Group</th>
                      {t.cells.map((c) => (
                        <th key={c.label} scope="col" className="px-3 py-2 font-medium text-right">
                          {c.label}
                        </th>
                      ))}
                      {nps && <th scope="col" className="px-3 py-2 font-medium text-right">eNPS</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {split.groups.map((g) => {
                      const q = g.questions?.find((x) => x.id === t.id);
                      return (
                        <tr key={g.label} className="border-b border-white/5 last:border-0 align-top">
                          <th scope="row" className="px-3 py-2 text-left font-semibold text-white">
                            {g.label}
                            <span className="block text-xs font-normal text-slate-500">
                              {q ? `${q.answered} of ${g.n} answered` : `${g.n} ${g.n === 1 ? 'person' : 'people'}`}
                            </span>
                          </th>
                          {q ? (
                            <>
                              {q.cells.map((c) => (
                                <td key={c.label} className="px-3 py-2 text-right tabular-nums">
                                  <span className="font-semibold text-white">{c.count}</span>
                                  <span className="block text-xs text-slate-500">
                                    {q.answered ? `${Math.round((100 * c.count) / q.answered)}%` : '–'}
                                  </span>
                                </td>
                              ))}
                              {nps && (
                                <td className="px-3 py-2 text-right tabular-nums font-semibold text-white">
                                  {(() => {
                                    const s = npsOf(q.cells, q.answered);
                                    return s === null ? '–' : s > 0 ? `+${s}` : String(s);
                                  })()}
                                </td>
                              )}
                            </>
                          ) : (
                            <td colSpan={t.cells.length + (nps ? 1 : 0)} className="px-3 py-2 text-xs text-slate-500">
                              {g.n === 0 ? 'Nobody' : `Fewer than ${split.min}: not shown`}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}
    </div>
  );
}
