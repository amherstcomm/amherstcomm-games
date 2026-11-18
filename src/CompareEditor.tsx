// Writing a comparison: the options across the top, the things to weigh down
// the side, a value in every cell (the survey spec, November 2026).
//
// The last column says whether the row differs, worked out the way the
// question will show it, and clicking it overrides that: "auto" until the
// author says otherwise, then "differs" or "same" whatever the cells say.
import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import {
  MAX_OPTIONS,
  MAX_ROWS,
  MIN_OPTIONS,
  nextId,
  rowDiffers,
  type ComparePayload,
  type CompareRow,
} from '@/compare';

const FIELD =
  'w-full rounded-lg bg-white/5 border border-white/15 px-2.5 py-1.5 text-sm text-slate-200 ' +
  'placeholder:text-slate-500 focus:outline-none focus:border-accent';
const SMALL =
  'inline-flex items-center gap-1 px-3 h-9 rounded-lg text-sm font-semibold border border-white/15 text-slate-200 hover:bg-white/5';

const NEXT_DIFFERS = { auto: 'yes', yes: 'no', no: 'auto' } as const;

/** "2,2,3,2,2,2,2,3,2,2,2,2" to twelve counts, or null while it is not. */
function parseMonths(text: string): number[] | null {
  const parts = text.split(/[\s,]+/).filter(Boolean).map(Number);
  return parts.length === 12 && parts.every((n) => Number.isInteger(n) && n >= 0 && n <= 9) ? parts : null;
}

export default function CompareEditor({ value, onChange }: {
  value: ComparePayload & { helper?: string };
  onChange: (v: ComparePayload & { helper?: string }) => void;
}) {
  const { options, rows } = value;
  const set = (patch: Partial<ComparePayload & { helper?: string }>) => onChange({ ...value, ...patch });
  const setRow = (i: number, row: CompareRow) => set({ rows: rows.map((r, n) => (n === i ? row : r)) });

  function addOption() {
    if (options.length >= MAX_OPTIONS) return;
    const id = nextId(options.map((o) => o.id), 'option');
    set({
      options: [...options, { id, name: '', subtitle: '' }],
      rows: rows.map((r) =>
        r.kind === 'months'
          ? { ...r, values: { ...r.values, [id]: Array(12).fill(0) } }
          : { ...r, values: { ...r.values, [id]: '' } }),
    });
  }
  function removeOption(id: string) {
    if (options.length <= MIN_OPTIONS) return;
    set({
      options: options.filter((o) => o.id !== id),
      rows: rows.map((r) => {
        const values = { ...r.values } as Record<string, unknown>;
        delete values[id];
        return { ...r, values } as CompareRow;
      }),
    });
  }
  function addRow(kind: 'text' | 'months') {
    if (rows.length >= MAX_ROWS) return;
    const id = nextId(rows.map((r) => r.id), 'row');
    const row: CompareRow = kind === 'months'
      ? { id, label: '', kind, values: Object.fromEntries(options.map((o) => [o.id, Array(12).fill(2)])), differs: 'auto' }
      : { id, label: '', kind, values: Object.fromEntries(options.map((o) => [o.id, ''])), differs: 'auto' };
    set({ rows: [...rows, row] });
  }

  return (
    <div className="space-y-4">
      <label className="block">
        <span className="block text-xs uppercase tracking-wider text-slate-500">Helper text</span>
        <input className={FIELD} value={value.helper ?? ''} maxLength={200}
               placeholder="Compare the two side by side."
               onChange={(e) => set({ helper: e.target.value })} />
      </label>

      <div>
        <p className="flex items-baseline justify-between text-xs uppercase tracking-wider text-slate-500">
          Options and what to compare
          <span className="normal-case tracking-normal">{MIN_OPTIONS} to {MAX_OPTIONS} options, up to {MAX_ROWS} rows</span>
        </p>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[36rem] border-separate border-spacing-1.5">
            <thead>
              <tr>
                <th scope="col" className="text-left text-xs font-semibold text-slate-400 w-[30%]">Row</th>
                {options.map((o, i) => (
                  <th key={o.id} scope="col" className="align-top">
                    <div className="flex gap-1">
                      <input className={`${FIELD} font-semibold`} value={o.name} maxLength={60}
                             aria-label={`Option ${i + 1} name`} placeholder={`Option ${i + 1}`}
                             onChange={(e) => set({ options: options.map((x) => (x.id === o.id ? { ...x, name: e.target.value } : x)) })} />
                      {options.length > MIN_OPTIONS && (
                        <button type="button" onClick={() => removeOption(o.id)} aria-label={`Remove option ${o.name || i + 1}`}
                                className="shrink-0 w-8 rounded-lg text-slate-400 hover:bg-white/5 hover:text-white">
                          <X className="w-4 h-4 mx-auto" aria-hidden="true" />
                        </button>
                      )}
                    </div>
                    <input className={`${FIELD} mt-1 text-xs`} value={o.subtitle ?? ''} maxLength={80}
                           aria-label={`Option ${i + 1} subtitle`} placeholder="Subtitle (optional)"
                           onChange={(e) => set({ options: options.map((x) => (x.id === o.id ? { ...x, subtitle: e.target.value } : x)) })} />
                  </th>
                ))}
                <th scope="col" className="text-left text-xs font-semibold text-slate-400 w-20">Differs?</th>
                <td className="w-8" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const differs = rowDiffers(r, options);
                return (
                  <tr key={r.id}>
                    <td className="align-top">
                      <input className={FIELD} value={r.label} maxLength={80} aria-label={`Row ${i + 1} label`}
                             placeholder={r.kind === 'months' ? 'Paydays across a year' : 'Paychecks a year'}
                             onChange={(e) => setRow(i, { ...r, label: e.target.value })} />
                      {r.kind === 'months' && (
                        <input className={`${FIELD} mt-1 text-xs`} value={r.note ?? ''} maxLength={160}
                               aria-label={`Row ${i + 1} note`} placeholder="Note (optional)"
                               onChange={(e) => setRow(i, { ...r, note: e.target.value })} />
                      )}
                    </td>
                    {options.map((o) =>
                      r.kind === 'months' ? (
                        <td key={o.id} className="align-top">
                          <MonthsField
                            label={`${r.label || `Row ${i + 1}`}, ${o.name || o.id}: twelve counts, January first`}
                            initial={(r.values[o.id] ?? []).join(',')}
                            onValid={(counts) => setRow(i, { ...r, values: { ...r.values, [o.id]: counts } })}
                          />
                        </td>
                      ) : (
                        <td key={o.id} className="align-top">
                          <input className={FIELD} value={r.values[o.id] ?? ''} maxLength={300}
                                 aria-label={`${r.label || `Row ${i + 1}`}, ${o.name || o.id}`}
                                 onChange={(e) => setRow(i, { ...r, values: { ...r.values, [o.id]: e.target.value } })} />
                        </td>
                      ))}
                    <td className="align-top">
                      {/* Clicking cycles auto, always, never -- and says which. */}
                      <button type="button"
                              onClick={() => setRow(i, { ...r, differs: NEXT_DIFFERS[r.differs ?? 'auto'] })}
                              title={r.differs === 'yes' ? 'Always marked as differing' : r.differs === 'no' ? 'Never marked' : 'Worked out from the values'}
                              className={`h-8 px-2 rounded-lg text-xs font-semibold ${differs ? 'text-amber-300' : 'text-slate-500'} hover:bg-white/5`}>
                        {differs ? 'differs' : 'same'}
                        {r.differs && r.differs !== 'auto' && <span className="block text-[0.625rem] font-normal text-slate-500">set by you</span>}
                      </button>
                    </td>
                    <td className="align-top">
                      {rows.length > 1 && (
                        <button type="button" onClick={() => set({ rows: rows.filter((_, n) => n !== i) })}
                                aria-label={`Remove row ${r.label || i + 1}`}
                                className="w-8 h-8 rounded-lg text-slate-400 hover:bg-white/5 hover:text-white">
                          <X className="w-4 h-4 mx-auto" aria-hidden="true" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" className={SMALL} onClick={() => addRow('text')} disabled={rows.length >= MAX_ROWS}>
            <Plus className="w-4 h-4" aria-hidden="true" /> Row
          </button>
          <button type="button" className={SMALL} onClick={() => addRow('months')} disabled={rows.length >= MAX_ROWS}>
            <Plus className="w-4 h-4" aria-hidden="true" /> Year of months
          </button>
          <button type="button" className={SMALL} onClick={addOption} disabled={options.length >= MAX_OPTIONS}>
            <Plus className="w-4 h-4" aria-hidden="true" /> Option
          </button>
        </div>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-xs uppercase tracking-wider text-slate-500">This question</legend>
        {([
          ['markDifferences', 'Mark rows that differ', 'Adds a DIFFERS tag where the options are not the same'],
          ['allowNoPreference', 'Allow “No preference”', 'A third answer that counts separately'],
          ['askWhy', 'Ask why', 'An optional comment box under the question'],
          ['shuffleOptions', 'Shuffle option order', 'Stops the first option always sitting on the left'],
        ] as const).map(([key, label, hint]) => (
          <label key={key} className="flex items-start gap-2.5 text-sm text-slate-200">
            <input type="checkbox" className="mt-1" checked={value[key]} onChange={(e) => set({ [key]: e.target.checked })} />
            <span>
              {label}
              <span className="block text-xs text-slate-400">{hint}</span>
            </span>
          </label>
        ))}
      </fieldset>
    </div>
  );
}

/** Twelve counts as one comma-separated field: the year is one thought, and
 *  twelve tiny boxes are twelve chances to tab past one. Keeps its own text
 *  while it is being typed, says when it is not twelve whole numbers yet
 *  rather than refusing the keystrokes, and passes it on once it is. */
function MonthsField({ label, initial, onValid }: { label: string; initial: string; onValid: (c: number[]) => void }) {
  const [text, setText] = useState(initial);
  const ok = parseMonths(text) !== null;
  return (
    <>
      <input className={`${FIELD} font-mono text-xs`} value={text} aria-label={label} aria-invalid={!ok}
             onChange={(e) => {
               setText(e.target.value);
               const parsed = parseMonths(e.target.value);
               if (parsed) onValid(parsed);
             }} />
      {!ok && <span className="block mt-0.5 text-[0.6875rem] text-amber-300">Twelve numbers, 0 to 9, January first.</span>}
    </>
  );
}
