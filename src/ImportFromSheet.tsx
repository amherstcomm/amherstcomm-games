// The control that fills a question's options from a sheet.
//
// Folded away until asked for: most questions are three options somebody types
// faster than they would find the file. It is the matching question with
// twenty cells that needs this, and the one whose author already has them in a
// spreadsheet.
//
// Both ways in, because both happen. A .csv saved out of Excel is a file; a
// block of cells copied out of Excel or Sheets is a paste, tab separated, with
// no file involved. They meet at the same reader -- see src/tableImport.ts.
import { useId, useRef, useState } from 'react';
import { Upload } from 'lucide-react';

export default function ImportFromSheet({
  what,
  columns,
  example,
  onText,
}: {
  /** what is being filled, for the summary: "the pairs" */
  what: string;
  /** what the columns are, said before the file picker rather than after the
   *  import goes wrong */
  columns: string;
  /** a couple of rows, shown as they would look in the sheet */
  example: string;
  /** hand the text to the reader; it answers with what to say */
  onText: (text: string, skipFirst: boolean) => string;
}) {
  const [open, setOpen] = useState(false);
  // Guessing a heading row only catches the words a sheet is likely to use,
  // and a real one says "Year" over "Event" -- which no safe rule can tell
  // from data. So it is asked rather than guessed, and left unticked, because
  // a sheet with no headings is the commoner paste.
  const [headed, setHeaded] = useState(false);
  const [pasted, setPasted] = useState('');
  const [said, setSaid] = useState('');
  const file = useRef<HTMLInputElement>(null);
  const id = useId();

  function take(text: string) {
    if (!text.trim()) {
      setSaid('There was nothing in that.');
      return;
    }
    setSaid(onText(text, headed));
  }

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={id}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-300 hover:text-white"
      >
        <Upload className="w-3.5 h-3.5 text-accent" aria-hidden="true" />
        Import {what} from a spreadsheet
      </button>

      {open && (
        <div id={id} className="mt-3 space-y-2">
          <p className="text-xs text-slate-400">
            {columns} Saved as CSV, or copied straight out of the sheet — both work.
          </p>
          <label className="flex items-center gap-2 text-xs text-slate-400">
            <input type="checkbox" checked={headed} onChange={(e) => setHeaded(e.target.checked)} />
            The first row is a heading
          </label>
          <pre className="overflow-x-auto rounded bg-black/30 p-2 text-xs text-slate-400">
            {example}
          </pre>

          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={file}
              type="file"
              accept=".csv,.tsv,.txt,text/csv,text/plain"
              aria-label={`Import ${what} from a file`}
              className="text-xs text-slate-400 file:mr-2 file:rounded file:border-0 file:bg-white/10 file:px-2 file:py-1 file:text-xs file:text-slate-200"
              onChange={async (e) => {
                const chosen = e.target.files?.[0];
                if (!chosen) return;
                take(await chosen.text());
                // so the same file can be chosen again after a fix
                if (file.current) file.current.value = '';
              }}
            />
          </div>

          <label className="block">
            <span className="block text-xs uppercase tracking-wider text-slate-500">
              or paste the cells
            </span>
            <textarea
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
              rows={4}
              aria-label={`Paste ${what}`}
              className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-slate-200 font-mono"
            />
          </label>
          <button
            type="button"
            onClick={() => take(pasted)}
            className="inline-flex items-center px-3 h-8 rounded-lg text-xs font-semibold bg-white/10 border border-white/15 text-slate-200 hover:bg-white/15"
          >
            Import
          </button>

          {said && (
            <p className="text-xs text-slate-300" role="status">
              {said}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
