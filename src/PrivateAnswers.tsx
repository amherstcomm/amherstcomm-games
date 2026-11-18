// A private open question's answers on the results page: a count for
// everybody, and for the host and site admins a way to read them -- asked for,
// not shown on arrival, because the results page is also what gets put on a
// screen. Never in the one-at-a-time slides, which are made for a projector.
import { useState } from 'react';
import { Lock } from 'lucide-react';
import { readPrivateComments } from '@/live';

type Read = Awaited<ReturnType<typeof readPrivateComments>>;

export default function PrivateAnswers({ item, total, readable }: {
  item: string;
  total: number;
  /** whether this viewer is the host or a site admin */
  readable: boolean;
}) {
  const [read, setRead] = useState<Read | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="space-y-3">
      <p className="flex items-center gap-1.5 text-sm text-slate-400">
        <Lock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        {total} {total === 1 ? 'answer' : 'answers'}. Only the host and site admins read these.
      </p>
      {readable && !read?.ok && (
        <button type="button" disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setRead(await readPrivateComments(item));
                  setBusy(false);
                }}
                className="px-3 h-9 rounded-lg text-sm font-semibold border border-white/15 text-slate-200 hover:bg-white/5">
          {busy ? 'Reading…' : 'Read them'}
        </button>
      )}
      {read && !read.ok && (
        <p role="status" className="text-sm text-amber-300">
          {read.reason === 'waiting'
            ? `They show once ${read.needed} people have answered the survey, so nobody can be worked out from a few. ${read.answered} so far.`
            : read.reason}
        </p>
      )}
      {read?.ok && (
        <section aria-label="Private answers" className="rounded-2xl border border-white/10 bg-slate-900 p-4">
          {read.comments.length === 0 ? (
            <p className="text-sm text-slate-400">Nobody has answered yet.</p>
          ) : (
            <ul className="divide-y divide-white/10">
              {read.comments.map((c, i) => (
                <li key={i} className="py-2 text-sm">
                  <p className="text-slate-200 whitespace-pre-line break-words">{c.text}</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {read.privacy === 'full' ? 'No name: a fully anonymous survey' : (c.who ?? 'Someone')}
                  </p>
                </li>
              ))}
            </ul>
          )}
          <button type="button" onClick={() => setRead(null)}
                  className="mt-2 text-sm font-semibold text-accent hover:underline">
            Hide them
          </button>
        </section>
      )}
    </div>
  );
}
