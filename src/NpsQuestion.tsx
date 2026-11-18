// An eNPS question as the person answering sees it: 0 to 10, the two ends
// labelled, an optional reason, and Send. Eleven buttons in one row from a
// tablet up; two rows on a phone, where eleven would be too narrow to hit.
import { useEffect, useState } from 'react';
import type { LiveItem } from '@/live';

export type NpsPayload = { lowLabel?: string; highLabel?: string; askWhy?: boolean };
export type NpsAnswer = { score: number; why: string | null };

const SCALE = Array.from({ length: 11 }, (_, i) => i);

export default function NpsQuestion({ item, onSend, sending, readOnly, fullyAnonymous }: {
  item: LiveItem;
  onSend: (value: NpsAnswer) => void;
  sending: boolean;
  readOnly?: boolean;
  fullyAnonymous?: boolean;
}) {
  const p = (item.payload ?? {}) as NpsPayload;
  const mine = (item.mine ?? null) as NpsAnswer | null;
  const [score, setScore] = useState<number | null>(mine?.score ?? null);
  const [why, setWhy] = useState(mine?.why ?? '');
  const [note, setNote] = useState('');
  useEffect(() => {
    setScore(mine?.score ?? null);
    setWhy(mine?.why ?? '');
    setNote('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);

  const open = item.state === 'open' && !readOnly;

  function send() {
    // Said, not greyed out.
    if (score === null) return setNote('Pick a number from 0 to 10.');
    onSend({ score, why: p.askWhy ? why.trim() || null : null });
  }

  return (
    <div className="space-y-4">
      <div role="group" aria-label={item.prompt ?? 'How likely, 0 to 10'}>
        <div className="grid grid-cols-6 sm:grid-cols-11 gap-1 sm:gap-1.5">
          {SCALE.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => {
                if (!open) return;
                setScore(n);
                setNote('');
              }}
              disabled={!open || sending}
              aria-pressed={score === n}
              aria-label={`${n}${n === 0 && p.lowLabel ? `, ${p.lowLabel}` : ''}${n === 10 && p.highLabel ? `, ${p.highLabel}` : ''}`}
              className={`h-11 rounded-lg border text-base font-semibold tabular-nums transition-colors ${
                score === n ? 'bg-accent border-accent text-slate-950' : 'border-white/15 text-slate-200 hover:bg-white/5'}`}
            >
              {n}
            </button>
          ))}
        </div>
        {(p.lowLabel || p.highLabel) && (
          <div className="mt-1.5 flex justify-between gap-4 text-xs text-slate-400" aria-hidden="true">
            <span>0 · {p.lowLabel}</span>
            <span className="text-right">{p.highLabel} · 10</span>
          </div>
        )}
      </div>

      {p.askWhy && !readOnly && (
        <label className="block">
          <span className="text-sm font-semibold text-white">Why?</span>{' '}
          <span className="text-sm text-slate-400">{fullyAnonymous ? 'Optional, also anonymous' : 'Optional'}</span>
          <textarea
            value={why}
            onChange={(e) => setWhy(e.target.value.slice(0, 1000))}
            disabled={!open}
            rows={3}
            className="mt-2 w-full rounded-lg bg-white/5 border border-white/15 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-accent"
          />
          {fullyAnonymous && (
            <span className="block mt-1 text-xs text-slate-500">
              Leave out anything that would identify you if you want to stay anonymous.
            </span>
          )}
        </label>
      )}

      {open && (
        <button type="button" onClick={send} disabled={sending}
                className="w-full h-11 rounded-xl bg-accent text-slate-950 font-semibold hover:brightness-110">
          {sending ? 'Sending…' : 'Send'}
        </button>
      )}
      {note && <p role="status" className="text-sm text-amber-300">{note}</p>}
    </div>
  );
}
