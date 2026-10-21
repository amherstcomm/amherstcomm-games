// Finding somebody for a giveaway: a drawing's own record, an account, or a
// name typed for staff who have never signed in. Shared by the drawing's
// "enter somebody", the history's "record an attendance", and a judged
// giveaway's entries and judges.
import { useEffect, useRef, useState } from 'react';
import { findGiveawayPeople, type Found } from '@/giveaways';

const FIELD =
  'w-full rounded-lg bg-white/5 border border-white/15 px-3 py-2 text-sm text-slate-200 ' +
  'placeholder:text-slate-500 focus:outline-none focus:border-accent';
const BUTTON =
  'inline-flex items-center justify-center px-3 h-9 rounded-lg text-sm font-semibold ' +
  'bg-white/10 border border-white/15 text-slate-200 hover:bg-white/15 disabled:opacity-50';

/** Searching for somebody to enter: a drawing's own record, an account, or a
 *  name typed for staff who have never signed in. */
export default function PeoplePicker({
  label,
  onPick,
  busy,
  action,
  accountsOnly = false,
}: {
  label: string;
  onPick: (who: { person?: string | null; user?: string | null; name?: string }) => void;
  busy: boolean;
  action: string;
  /** only people who have signed in -- a judge has to be able to sign in to judge */
  accountsOnly?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<Found[]>([]);
  const timer = useRef(0);
  useEffect(() => {
    window.clearTimeout(timer.current);
    if (query.trim().length < 2) {
      setFound([]);
      return;
    }
    timer.current = window.setTimeout(() => void findGiveawayPeople(query).then(setFound), 250);
    return () => window.clearTimeout(timer.current);
  }, [query]);

  const typed = query.trim();
  const shown = accountsOnly ? found.filter((f) => f.user) : found;
  const exact = accountsOnly || found.some((f) => f.name.toLowerCase() === typed.toLowerCase());
  return (
    <div>
      <input className={FIELD} value={query} aria-label={label} placeholder="Name or address"
             onChange={(e) => setQuery(e.target.value)} />
      {typed.length >= 2 && (
        <ul className="mt-2 space-y-1" aria-label={`${label}: matches`}>
          {shown.map((f) => (
            <li key={f.person ?? f.user ?? f.name} className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm text-slate-300 min-w-0 break-words">
                {f.name}
                {f.email && <span className="text-xs text-slate-500"> · {f.email}</span>}
                {!f.user && <span className="text-xs text-slate-500"> · no account</span>}
              </span>
              <button type="button" className={BUTTON} disabled={busy}
                      onClick={() => {
                        // both: a record is used first where there is one, and a judge is an account
                        onPick({ person: f.person, user: f.user, name: f.name });
                        setQuery('');
                      }}>
                {action}
              </button>
            </li>
          ))}
          {!exact && (
            <li className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm text-slate-400 min-w-0 break-words">
                “{typed}” — somebody without an account
              </span>
              <button type="button" className={BUTTON} disabled={busy}
                      onClick={() => {
                        onPick({ name: typed });
                        setQuery('');
                      }}>
                {action} by name
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
