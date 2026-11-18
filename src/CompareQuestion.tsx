// A comparison, as the person answering it sees it (the survey spec, November
// 2026). Options are columns and the things to weigh are rows; a row where the
// options differ says DIFFERS in words, not in colour alone.
//
// Two layouts rather than one that squeezes. From 768px it is a real table
// with row and column headers, which is what a screen reader needs to read a
// cell with its row and option. Below that, each row is its label over a grid
// of values, the option names stay pinned while the rows scroll past, and the
// buttons to pick sit in a bar at the bottom. Only one is ever displayed, so
// there is only ever one set of controls in the page.
//
// In a session played on your own time nothing is sent until Next: you can
// pick, change your mind, write why, and go Back. In front of a room a pick
// goes as soon as it is made, the way every other question works there, and
// can be changed while the question is open.
import { useEffect, useState } from 'react';
import type { LiveItem } from '@/live';
import SessionPicture from '@/SessionPicture';
import {
  asCompare,
  letter,
  MAX_WHY,
  MONTHS,
  monthsLabel,
  rowDiffers,
  type CompareAnswer,
  type CompareOption,
  type CompareRow,
} from '@/compare';

function Differs() {
  return (
    <span className="ml-1.5 inline-block align-middle rounded border border-amber-400/60 px-1 text-[0.625rem] leading-4 font-bold uppercase tracking-wider text-amber-300">
      Differs
    </span>
  );
}

/** A year of paydays as dots: one column a month, one dot a payday. */
function Dots({ counts, label }: { counts: number[]; label: string }) {
  const most = Math.max(1, ...counts);
  const usual = [...counts].sort((a, b) => counts.filter((x) => x === b).length - counts.filter((x) => x === a).length)[0];
  return (
    <div role="img" aria-label={`${label}: ${monthsLabel(counts)}`} className="grid grid-cols-12 gap-1 max-w-sm">
      {counts.map((n, i) => (
        <div key={i} className="flex flex-col items-center gap-0.5">
          <div className="flex flex-col-reverse items-center gap-0.5" style={{ minHeight: `${most * 0.5 + (most - 1) * 0.125}rem` }}>
            {Array.from({ length: n }, (_, k) => (
              <span key={k} className={`block w-2 h-2 rounded-full ${n === usual ? 'bg-accent/60' : 'bg-accent'}`} />
            ))}
          </div>
          <span className="text-[0.625rem] text-slate-500" aria-hidden="true">{MONTHS[i]}</span>
        </div>
      ))}
    </div>
  );
}

function Cell({ row, option }: { row: CompareRow; option: CompareOption }) {
  if (row.kind === 'image') {
    return <SessionPicture path={row.values[option.id] ?? ''} alt={`${row.label}: ${option.name}`}
                           className="w-full max-w-[16rem] aspect-[4/3]" />;
  }
  if (row.kind === 'months') {
    const counts = Array.isArray(row.values[option.id]) ? row.values[option.id] : [];
    return <Dots counts={counts} label={option.name} />;
  }
  return <>{row.values[option.id] ?? ''}</>;
}

export default function CompareQuestion({
  item,
  mode,
  onSend,
  sending,
  readOnly,
  onBack,
  nextLabel,
  fullyAnonymous,
}: {
  item: LiveItem;
  mode: 'live' | 'open';
  /** live: a pick, sent now. open: the answer, sent on Next. */
  onSend: (value: CompareAnswer) => void;
  sending: boolean;
  /** the presenter's screen: the table without the buttons */
  readOnly?: boolean;
  /** open mode, when there is an earlier comparison to go back to */
  onBack?: () => void;
  /** open mode: "Next question" or "Finish" */
  nextLabel?: string;
  /** a fully anonymous survey, which changes what the reason box promises */
  fullyAnonymous?: boolean;
}) {
  const p = asCompare(item.payload);
  const options = p.options;
  const mine = (item.mine ?? null) as CompareAnswer | null;
  const [pick, setPick] = useState<string | null>(mine?.pick ?? null);
  const [why, setWhy] = useState(mine?.why ?? '');
  const [sentWhy, setSentWhy] = useState(mine?.why ?? '');
  const [note, setNote] = useState('');

  // A different question, or the same one handed back after going Back:
  // what they said is what is shown.
  useEffect(() => {
    setPick(mine?.pick ?? null);
    setWhy(mine?.why ?? '');
    setSentWhy(mine?.why ?? '');
    setNote('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);

  const open = item.state === 'open' && !readOnly;
  const live = mode === 'live';

  function choose(id: string) {
    if (!open) return;
    setPick(id);
    setNote('');
    if (live) {
      onSend({ pick: id, why: p.askWhy ? why.trim() || null : null });
      setSentWhy(why);
    }
  }

  function next() {
    // Said, not greyed out: a button that does nothing looks broken.
    if (!pick) {
      setNote(p.allowNoPreference ? 'Pick one of the options, or No preference.' : 'Pick one of the options.');
      return;
    }
    onSend({ pick, why: p.askWhy ? why.trim() || null : null });
  }

  function sendWhy() {
    if (!pick) {
      setNote('Pick one of the options first, then send your reason with it.');
      return;
    }
    onSend({ pick, why: why.trim() || null });
    setSentWhy(why);
  }

  const differs = (row: CompareRow) => p.markDifferences && rowDiffers(row, options);
  const chosenIdx = options.findIndex((o) => o.id === pick);
  const helper = typeof (item.payload as { helper?: unknown })?.helper === 'string'
    ? (item.payload as { helper: string }).helper
    : '';

  const pickButtons = (compact: boolean) =>
    options.map((o) => {
      const on = pick === o.id;
      return (
        <button
          key={o.id}
          type="button"
          onClick={() => choose(o.id)}
          disabled={!open || sending}
          aria-pressed={on}
          // In the table every button reads "I prefer this", so the label says
          // which: it starts with the words on the button, as a spoken command
          // would. The tick is the pressed state, which aria-pressed says.
          aria-label={compact ? undefined : `I prefer this: ${o.name}`}
          className={`w-full min-h-11 px-3 rounded-xl text-sm font-semibold border transition-colors
            ${on ? 'bg-accent border-accent text-slate-950' : 'border-white/20 text-slate-200 hover:bg-white/5'}`}
        >
          {compact ? (
            <>{on ? '✓ ' : ''}{o.name}</>
          ) : (
            <>{on ? '✓ I prefer this' : 'I prefer this'}</>
          )}
        </button>
      );
    });

  const noPreference = (asText: boolean) =>
    p.allowNoPreference && (
      <button
        type="button"
        onClick={() => choose('none')}
        disabled={!open || sending}
        aria-pressed={pick === 'none'}
        className={asText
          ? `w-full h-11 text-sm font-semibold ${pick === 'none' ? 'text-accent' : 'text-slate-400 hover:text-white'}`
          : `px-4 h-11 rounded-xl text-sm font-semibold border transition-colors ${
              pick === 'none' ? 'bg-accent border-accent text-slate-950' : 'border-white/20 text-slate-200 hover:bg-white/5'}`}
      >
        {pick === 'none' ? '✓ No preference' : 'No preference'}
      </button>
    );

  return (
    <div role="group" aria-label={item.prompt ?? 'Compare'} className="space-y-5">
      {helper && <p className="text-sm text-slate-400 -mt-2">{helper}</p>}
      {p.markDifferences && options.length > 1 && (
        <p className="text-sm text-slate-400">
          Rows marked <Differs /> are where the options are not the same.
        </p>
      )}

      {/* ---- from 768px: a table ---- */}
      <div className="hidden md:block rounded-2xl border border-white/10 bg-slate-900 overflow-x-auto">
        <table className="w-full min-w-[32rem] border-collapse text-left">
          <thead>
            <tr>
              <td className="w-[24%]" />
              {options.map((o, i) => (
                <th
                  key={o.id}
                  scope="col"
                  className={`align-top px-4 pt-3 pb-3 border-t-[3px] ${
                    i === chosenIdx ? 'border-accent bg-accent/10' : 'border-transparent'}`}
                >
                  <span className="block text-xs font-semibold uppercase tracking-wider text-accent">Option {letter(i)}</span>
                  <span className="block mt-0.5 text-lg font-bold text-white">{o.name}</span>
                  {o.subtitle && <span className="block text-sm font-normal text-slate-400">{o.subtitle}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {p.rows.map((row) => (
              <tr key={row.id} className="border-t border-white/10">
                <th scope="row" className="align-top px-4 py-3 text-xs font-semibold text-slate-400">
                  {row.label}
                  {differs(row) && <Differs />}
                  {row.note && <span className="block mt-1 font-normal text-slate-500">{row.note}</span>}
                </th>
                {options.map((o, i) => (
                  <td key={o.id} className={`align-top px-4 py-3 text-sm text-slate-200 ${i === chosenIdx ? 'bg-accent/5' : ''}`}>
                    <Cell row={row} option={o} />
                  </td>
                ))}
              </tr>
            ))}
            {!readOnly && (
              <tr className="border-t border-white/10">
                <td />
                {pickButtons(false).map((b, i) => (
                  <td key={options[i].id} className="px-4 py-4">{b}</td>
                ))}
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ---- below 768px: rows stacked under pinned option names ---- */}
      <div className="md:hidden">
        <div className="sticky top-14 z-10 -mx-1 px-1 py-2 bg-slate-950 border-b border-white/10 grid gap-3"
             style={{ gridTemplateColumns: `repeat(${Math.min(options.length, 2)}, minmax(0, 1fr))` }}>
          {options.map((o, i) => (
            <div key={o.id} className="min-w-0">
              <span className="block text-[0.6875rem] font-semibold uppercase tracking-wider text-accent">Option {letter(i)}</span>
              <span className="block font-bold text-white truncate">{o.name}</span>
            </div>
          ))}
        </div>
        <dl className="divide-y divide-white/10">
          {p.rows.map((row) => (
            <div key={row.id} className="py-3">
              <dt className="text-xs font-semibold text-slate-400">
                {row.label}
                {differs(row) && <Differs />}
              </dt>
              {row.kind === 'months' ? (
                <dd className="mt-2 space-y-2">
                  {options.map((o) => (
                    <div key={o.id}>
                      <p className="text-xs text-slate-500 mb-1">{o.name}</p>
                      <Cell row={row} option={o} />
                    </div>
                  ))}
                  {row.note && <p className="text-xs text-slate-500">{row.note}</p>}
                </dd>
              ) : (
                <dd className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 text-sm text-slate-200">
                  {options.map((o, i) => (
                    <span key={o.id} className="min-w-0 break-words">
                      {options.length > 2 && <span className="text-xs font-semibold text-accent mr-1">{letter(i)}</span>}
                      <Cell row={row} option={o} />
                    </span>
                  ))}
                </dd>
              )}
            </div>
          ))}
        </dl>
        {!readOnly && (
          <div className="sticky bottom-16 z-10 -mx-1 px-1 pt-3 pb-2 bg-slate-950 border-t border-white/10">
            <div className="grid grid-cols-2 gap-2">{pickButtons(true)}</div>
            {noPreference(true)}
          </div>
        )}
      </div>

      {!readOnly && (
        <div className="hidden md:flex flex-wrap items-center gap-3">
          {noPreference(false)}
          <p className="text-sm text-slate-400">
            {live
              ? 'You can change your answer while this question is open.'
              : 'You can change your answer until the survey closes.'}
          </p>
        </div>
      )}

      {!readOnly && p.askWhy && (
        <div className="rounded-2xl border border-white/10 bg-slate-900 p-4">
          <label className="block">
            <span className="text-sm font-semibold text-white">Why?</span>{' '}
            <span className="text-sm text-slate-400">{fullyAnonymous ? 'Optional, also anonymous' : 'Optional'}</span>
            <textarea
              value={why}
              onChange={(e) => setWhy(e.target.value.slice(0, MAX_WHY))}
              disabled={!open}
              rows={3}
              placeholder="Anything that would make one of these work better or worse for you"
              className="mt-2 w-full rounded-lg bg-white/5 border border-white/15 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-accent"
            />
          </label>
          <p className="mt-1 text-xs text-slate-500">
            {fullyAnonymous
              ? 'Leave out anything that would identify you if you want to stay anonymous.'
              : 'Shown in the results with your pick, without your name.'}
          </p>
          {live && open && why !== sentWhy && (
            <button type="button" onClick={sendWhy} disabled={sending}
                    className="mt-2 px-4 h-10 rounded-lg text-sm font-semibold bg-accent text-slate-950 hover:brightness-110">
              Send your reason
            </button>
          )}
        </div>
      )}

      {note && <p role="status" className="text-sm text-amber-300">{note}</p>}

      {!live && open && (
        <div className="flex items-center justify-between gap-3">
          {onBack ? (
            <button type="button" onClick={onBack} disabled={sending}
                    className="px-4 h-11 rounded-xl text-sm font-semibold border border-white/20 text-slate-200 hover:bg-white/5">
              ← Back
            </button>
          ) : <span />}
          <button type="button" onClick={next} disabled={sending}
                  className="px-5 h-11 rounded-xl text-sm font-semibold bg-accent text-slate-950 hover:brightness-110">
            {sending ? 'Saving…' : `${nextLabel ?? 'Next question'} →`}
          </button>
        </div>
      )}
    </div>
  );
}
