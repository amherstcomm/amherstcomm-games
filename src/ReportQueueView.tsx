// The owner's queue: everything still open, oldest first.
//
// The digest is the primary path and this does not replace it — an inbox is a
// queue somebody already reads, and a page you have to remember to visit is a
// page that gets forgotten on exactly the busy week a report matters. This is
// for the other half: coming back to something you saw this morning, or
// working through a run of them without hunting for the email.
//
// It carries no reporter address. The digest does, because that is a private
// inbox; a page is the surface most likely to be read over a shoulder, and you
// do not need somebody's email to decide what to do about their report.
import { useEffect, useState } from 'react';
import { Flag } from 'lucide-react';

import { ownerReports, type QueuedReport } from '@/reports';

function summarise(r: QueuedReport): string {
  const e = r.evidence;
  if (r.kind === 'puzzle') return `${e.game} · ${e.difficulty} · ${e.date}`;
  if (r.kind === 'player') return String(e.name ?? '');
  return String(e.reported_from || 'no page given');
}

export default function ReportQueueView() {
  const [rows, setRows] = useState<QueuedReport[] | null>(null);

  useEffect(() => {
    let alive = true;
    ownerReports().then((r) => alive && setRows(r));
    return () => {
      alive = false;
    };
  }, []);

  if (!rows) return <p className="text-sm text-slate-400">Loading…</p>;

  return (
    <div className="max-w-2xl mx-auto">
      <h2 className="text-xl font-bold flex items-center gap-2">
        <Flag className="w-4 h-4 text-accent shrink-0" aria-hidden="true" />
        Open reports
      </h2>
      <p className="mt-1 text-sm text-slate-400">
        {rows.length
          ? `${rows.length} waiting, oldest first. Nothing closes on its own.`
          : 'Nothing open.'}
      </p>

      <ul className="mt-4 space-y-2">
        {rows.map((r) => (
          <li key={r.id} className="rounded-xl bg-white/5 border border-white/10 p-3">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="text-sm font-semibold text-slate-200">{r.kind}</span>
              <code className="text-xs font-mono text-accent">{r.ticket}</code>
              {/* The age, said out loud. A queue where every row looks alike is
                  a queue that gets worked newest-first, which is backwards. */}
              <span
                className={`text-xs ${r.daysOpen >= 3 ? 'text-amber-300' : 'text-slate-500'}`}
              >
                {r.daysOpen === 0
                  ? 'today'
                  : `open ${r.daysOpen} day${r.daysOpen === 1 ? '' : 's'}`}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-400 break-words">{summarise(r)}</p>
            <p className="mt-1 text-sm text-slate-300 break-words">
              {r.reason || <span className="text-slate-600">(nothing said)</span>}
            </p>
            {/* A real anchor, so a row can be opened in its own tab — working
                a queue means keeping several of these side by side. */}
            <a
              href={`/report/act/${r.id}/${r.actionToken}`}
              className="mt-2 inline-block text-xs font-semibold text-accent hover:brightness-110"
            >
              Handle it →
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
