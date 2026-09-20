// A whole quiz, out of one workbook.
//
// The per-question imports fill one box; this fills a session. First tab the
// questions, a tab each for the ones that carry a list -- see quizWorkbook.ts
// for the shape, and the template, which is the shape written down.
//
// Read first, save second, and say what was read in between. A workbook goes in
// as a file rather than a paste for the obvious reason: there is no pasting a
// book of tabs.
import { useRef, useState } from 'react';
import { Download, Loader2, Upload } from 'lucide-react';
import { QUIZ_TEMPLATE, quizTemplateBytes, readQuiz, sayQuiz, type QuizItem } from '@/quizWorkbook';
import { readWorkbook } from '@/xlsx';

const BUTTON =
  'inline-flex items-center justify-center gap-1.5 px-3 h-9 rounded-lg text-sm font-semibold ' +
  'bg-white/10 border border-white/15 text-slate-200 hover:bg-white/15 disabled:opacity-50';

export default function ImportQuiz({
  onAdd,
  onFinished,
}: {
  /** save one question; answers with whether it went in. Called in order, and
   *  stopped at the first refusal -- a session half filled in the wrong order
   *  is worse than one that says where it stopped. */
  onAdd: (item: QuizItem) => Promise<{ ok: boolean; reason?: string }>;
  /** read the session back once the adding has stopped, however it stopped:
   *  the questions that did go in are on screen either way. */
  onFinished: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<QuizItem[]>([]);
  const [said, setSaid] = useState('');
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState('');
  const file = useRef<HTMLInputElement>(null);

  async function take(chosen: File) {
    setAdded('');
    setItems([]);
    try {
      const sheets = await readWorkbook(new Uint8Array(await chosen.arrayBuffer()));
      const { items: read, problems } = readQuiz(sheets);
      setItems(read);
      setSaid(sayQuiz(read, problems));
    } catch (error) {
      setSaid(error instanceof Error ? error.message : 'that file could not be read');
    }
  }

  async function add() {
    if (busy || items.length === 0) return;
    setBusy(true);
    let done = 0;
    for (const item of items) {
      const res = await onAdd(item);
      if (!res.ok) {
        setBusy(false);
        await onFinished();
        setAdded(
          `Added ${done} of ${items.length}, then "${item.prompt}" was refused: ${res.reason ?? 'no reason given'}`
        );
        setItems(items.slice(done));
        return;
      }
      done += 1;
    }
    setBusy(false);
    setItems([]);
    setSaid('');
    setAdded(`Added ${done} question${done === 1 ? '' : 's'}.`);
    await onFinished();
  }

  function download() {
    const url = URL.createObjectURL(
      new Blob([quizTemplateBytes()], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = QUIZ_TEMPLATE.file;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  return (
    <div className="mt-4 rounded-lg border border-white/10 bg-white/[0.03] p-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-300 hover:text-white"
      >
        <Upload className="w-3.5 h-3.5 text-accent" aria-hidden="true" />
        Import a whole quiz from a workbook
      </button>

      {open && (
        <div className="mt-3 space-y-2">
          <p className="text-xs text-slate-400">
            First tab the questions — <em>Ref</em>, <em>Kind</em>, <em>Question</em>,{' '}
            <em>Seconds</em>, <em>Answer</em> — and a tab of its own, named in{' '}
            <em>Ref</em>, for each matching, multiple choice, survey or ranking question.
            The template is that shape, filled in.
          </p>
          <button type="button" onClick={download} className={BUTTON}>
            <Download className="w-3.5 h-3.5 text-accent" aria-hidden="true" />
            Download the quiz template
          </button>

          <input
            ref={file}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            aria-label="Choose a workbook"
            className="block text-xs text-slate-400 file:mr-2 file:rounded file:border-0 file:bg-white/10 file:px-2 file:py-1 file:text-xs file:text-slate-200"
            onChange={async (e) => {
              const chosen = e.target.files?.[0];
              if (chosen) await take(chosen);
              if (file.current) file.current.value = '';
            }}
          />

          {said && (
            <p className="text-xs text-slate-300" role="status">
              {said}
            </p>
          )}

          {items.length > 0 && (
            <>
              {/* What is about to be added, in order, before anything is. */}
              <ol className="text-xs text-slate-400 space-y-0.5 max-h-40 overflow-y-auto">
                {items.map((item, i) => (
                  <li key={`${item.ref}-${i}`} className="truncate">
                    {i + 1}. {item.prompt}
                  </li>
                ))}
              </ol>
              <button type="button" onClick={() => void add()} disabled={busy} className={BUTTON}>
                {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />}
                Add {items.length} question{items.length === 1 ? '' : 's'} to this session
              </button>
            </>
          )}

          {added && (
            <p className="text-xs text-slate-300" role="status">
              {added}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
