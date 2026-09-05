// Paste a month's worth at once.
//
// The case this exists for is thirty-one themes written somewhere else — a
// spreadsheet, a model, a colleague's notes — where typing them into a form one
// at a time is what stops it happening.
//
// Two rules it keeps. It shows what it *would* do before it does it, because
// thirty-one entries going in silently is thirty-one to check afterwards. And
// it reports every entry that failed, with its position, rather than a count of
// the ones that worked — "imported twenty-nine" out of thirty-one is a sentence
// that has lost two.
import { useState } from 'react';
import { downloadJson } from '@/templates';

const FIELD =
  'w-full rounded-lg bg-white/5 border border-white/15 px-3 py-2 text-sm text-slate-100 ' +
  'placeholder:text-slate-500 focus:outline-none focus:border-accent';
const BUTTON =
  'inline-flex items-center justify-center px-3 h-9 rounded-lg text-sm font-semibold ' +
  'bg-white/10 border border-white/15 text-slate-200 hover:bg-white/15 disabled:opacity-50';

export type ImportResult = { ok: boolean; reason?: string };

export default function ImportBox<T>({
  label,
  placeholder,
  template,
  templateName,
  parse,
  describe,
  save,
  onDone,
}: {
  label: string;
  placeholder: string;
  /** the blank, handed to whoever is filling a month in elsewhere */
  template: unknown;
  templateName: string;
  parse: (text: string) => { items: T[]; problems: string[] };
  /** one line per item, for the preview — what it is, and anything worth
   *  knowing before it lands */
  describe: (item: T) => string;
  save: (item: T) => Promise<ImportResult>;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string[]>([]);

  const parsed = text.trim() ? parse(text) : { items: [], problems: [] };

  async function run() {
    setBusy(true);
    setDone([]);
    const failures: string[] = [];
    let saved = 0;
    // One at a time, in order, so a refusal names the entry it came from. A
    // batch that half-applied and reported one error would leave somebody
    // guessing which half.
    for (const [i, item] of parsed.items.entries()) {
      const res = await save(item);
      if (res.ok) saved += 1;
      else failures.push(`${describe(item)} — ${res.reason ?? 'refused'} (entry ${i + 1})`);
    }
    setBusy(false);
    setDone([
      `Imported ${saved} of ${parsed.items.length}.`,
      ...failures,
    ]);
    if (saved > 0) {
      setText('');
      onDone();
    }
  }

  if (!open) {
    return (
      <button className={BUTTON} onClick={() => setOpen(true)}>
        {label}
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-white/15 p-4 space-y-3">
      <label className="block">
        <span className="text-sm font-semibold text-slate-200">{label}</span>
        <span className="block text-xs text-slate-400 mt-0.5 mb-1">
          One object or an array of them. Anything worked out rather than given —
          counts, totals — is ignored and recalculated.
        </span>
        <textarea
          className={FIELD + ' h-48 font-mono text-xs'}
          value={text}
          placeholder={placeholder}
          aria-label={label}
          onChange={(e) => setText(e.target.value)}
        />
      </label>

      {/* Shown before it happens. Thirty-one entries landing silently is
          thirty-one to check afterwards. */}
      {parsed.items.length > 0 && (
        <div className="rounded-lg border border-white/15 p-3 text-xs space-y-1">
          <p className="text-slate-300">
            {parsed.items.length} to import:
          </p>
          <ul className="text-slate-400 space-y-0.5 max-h-40 overflow-y-auto">
            {parsed.items.map((item, i) => (
              <li key={i}>{describe(item)}</li>
            ))}
          </ul>
        </div>
      )}

      {parsed.problems.length > 0 && (
        <ul className="text-xs text-rose-300 space-y-0.5">
          {parsed.problems.map((p, i) => (
            <li key={i}>{p}</li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {/* The blank, for filling in elsewhere. It carries its own instructions
            in a key the parser ignores, which is the only way to put a sentence
            inside JSON — and it is pushed back through that parser by a test,
            because a template that does not import is worse than none. */}
        <button className={BUTTON} onClick={() => downloadJson(templateName, template)}>
          Download template
        </button>
        <button
          className={BUTTON}
          disabled={busy || parsed.items.length === 0}
          onClick={() => void run()}
        >
          {busy ? 'Importing…' : `Import ${parsed.items.length || ''}`.trim()}
        </button>
        <button
          className={BUTTON}
          disabled={busy}
          onClick={() => {
            setOpen(false);
            setText('');
            setDone([]);
          }}
        >
          Cancel
        </button>
      </div>

      {done.length > 0 && (
        <ul className="text-xs space-y-0.5">
          {done.map((line, i) => (
            <li key={i} className={i === 0 ? 'text-slate-300' : 'text-rose-300'}>
              {line}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
