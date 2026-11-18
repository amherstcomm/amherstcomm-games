// How private a session's answers are (the survey spec, November 2026):
// anonymous to the other participants, as every session always was, or fully
// anonymous, where nobody can link an answer to a person. Chosen before
// anybody answers and fixed once anybody has; what the database does about it
// is in schema.sql, "Fully anonymous surveys".
import { useState } from 'react';
import { Lock } from 'lucide-react';

export type PrivacyMeta = {
  privacy?: 'room' | 'full';
  min_results?: number;
  show_comments?: boolean;
  /** how many people have answered at all */
  answered?: number;
  /** trivia for a giveaway or a tournament round, which is scored by name */
  attached?: boolean;
};

export default function SurveyPrivacy({ meta, busy, onSet }: {
  meta: PrivacyMeta;
  busy: boolean;
  onSet: (change: { privacy?: 'room' | 'full'; minResults?: number; showComments?: boolean }) => void;
}) {
  const privacy = meta.privacy ?? 'room';
  const answered = (meta.answered ?? 0) > 0;
  const min = meta.min_results ?? 5;
  const [minText, setMinText] = useState(String(min));
  const [note, setNote] = useState('');

  function saveMin() {
    const n = Number(minText);
    // Said, not refused silently.
    if (!Number.isInteger(n) || n < 5) return setNote('At least 5, so a small count cannot point to anybody.');
    if (answered && n < min) return setNote(`People have answered, so it can go up from ${min} but not down.`);
    setNote('');
    onSet({ minResults: n });
  }

  const choice = (id: 'room' | 'full', title: string, body: string) => {
    const on = privacy === id;
    const blocked = !on && (answered || (id === 'full' && meta.attached));
    return (
      <label className={`flex items-start gap-3 rounded-xl border p-3 ${
        on ? 'border-accent bg-accent/10' : 'border-white/10'} ${blocked ? 'opacity-60' : 'cursor-pointer'}`}>
        <input type="radio" name="survey-privacy" className="mt-1" checked={on} disabled={busy || blocked}
               onChange={() => onSet({ privacy: id })} />
        <span>
          <span className="block text-sm font-semibold text-white">{title}</span>
          <span className="block text-xs text-slate-400 mt-0.5">{body}</span>
        </span>
      </label>
    );
  };

  return (
    <section aria-label="Survey privacy" className="rounded-xl border border-white/15 p-4 mb-8 space-y-3">
      <p className="text-xs uppercase tracking-wider text-slate-500">Survey privacy</p>
      {choice('room', 'Anonymous to other participants',
        'Nobody in the room sees who answered what. Admins can, for prizes and follow-up.')}
      {choice('full', 'Fully anonymous',
        'Answers are stored apart from names. Nobody, admins included, can link them. No scores, no avatars, no questions from the room.')}

      {answered ? (
        <p className="flex items-center gap-1.5 text-xs text-slate-400">
          <Lock className="w-3.5 h-3.5" aria-hidden="true" />
          People have answered, so this can no longer change.
        </p>
      ) : meta.attached ? (
        <p className="text-xs text-slate-400">
          This is trivia for a giveaway or a tournament, which is scored by name, so it cannot be fully anonymous.
        </p>
      ) : (
        <p className="text-xs text-slate-400">Can&apos;t be switched once anyone answers.</p>
      )}

      {privacy === 'full' && (
        <div className="pt-1 space-y-3">
          <div>
            <label className="flex flex-wrap items-center gap-2 text-sm text-slate-200">
              Hide results until at least
              <input value={minText} inputMode="numeric" aria-label="Answers needed before results show"
                     onChange={(e) => setMinText(e.target.value.replace(/[^0-9]/g, '').slice(0, 4))}
                     className="w-16 h-8 rounded-lg bg-white/5 border border-white/15 px-2 text-sm text-slate-200" />
              answers
            </label>
            {minText !== String(min) && (
              <button type="button" onClick={saveMin} disabled={busy}
                      className="mt-2 px-3 h-8 rounded-lg text-xs font-semibold bg-accent text-slate-950">
                Save
              </button>
            )}
            {note && <p role="status" className="mt-1 text-xs text-amber-300">{note}</p>}
          </div>
        </div>
      )}

      <label className="flex items-start gap-2.5 text-sm text-slate-200">
        <input type="checkbox" className="mt-1" checked={meta.show_comments ?? true} disabled={busy}
               onChange={(e) => onSet({ showComments: e.target.checked })} />
        <span>
          Show the reasons people give
          <span className="block text-xs text-slate-400">
            {privacy === 'full'
              ? `Once ${min * 2} have answered, or when the survey closes. Off, the results are counts only.`
              : 'With the pick each one came with, and no name. Off, the results are counts only.'}
          </span>
        </span>
      </label>
    </section>
  );
}
