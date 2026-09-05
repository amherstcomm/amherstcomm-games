// Word lists of somebody's own.
//
// A textarea, because that is what a list of words is. Paste a column out of a
// spreadsheet, type them one per line, or dump a paragraph in — the server
// splits on anything that is not a letter and drops what is too short to be a
// word, so the person writing the list does not have to format it first.
//
// The one thing this page is careful about is saying what landed. A save that
// silently dropped six things from a paste of forty would leave somebody
// wondering later why a round kept drawing the same words, so the count comes
// back from the server and is shown.
import { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  deleteWordList,
  readWordListWords,
  readWordLists,
  saveWordList,
  type WordList,
} from '@/wordLists';

const FIELD =
  'w-full rounded-lg bg-white/5 border border-white/15 px-3 py-2 text-sm text-slate-100 ' +
  'placeholder:text-slate-500 focus:outline-none focus:border-accent';
const BUTTON =
  'inline-flex items-center justify-center px-3 h-9 rounded-lg text-sm font-semibold ' +
  'bg-white/10 border border-white/15 text-slate-200 hover:bg-white/15 disabled:opacity-50';

export default function AdminWordLists() {
  const [lists, setLists] = useState<WordList[] | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [words, setWords] = useState('');
  const [clue, setClue] = useState('');
  const [spangram, setSpangram] = useState('');
  const [from, setFrom] = useState('');
  const [until, setUntil] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const pull = useCallback(async () => setLists(await readWordLists()), []);
  useEffect(() => void pull(), [pull]);

  function startNew() {
    setEditing('new');
    setName('');
    setWords('');
    setClue('');
    setSpangram('');
    setFrom('');
    setUntil('');
    setNote('');
  }

  async function open(list: WordList) {
    setEditing(list.id);
    setName(list.name);
    // All of them, because saving sends all of them: a field left at its
    // initial value would quietly clear whatever the row had, so opening a
    // themed list to fix a typo would take its dates off.
    setClue(list.clue ?? '');
    setSpangram(list.spangram ?? '');
    setFrom(list.daily_from ?? '');
    setUntil(list.daily_until ?? '');
    setNote('');
    setWords((await readWordListWords(list.id)).join('\n'));
  }

  async function save() {
    setBusy(true);
    const res = await saveWordList(editing === 'new' ? null : editing, name, words, {
      clue,
      spangram,
      from,
      until,
    });
    setBusy(false);
    if (!res.ok) {
      setNote(res.reason ?? 'That did not work');
      return;
    }
    // What actually landed, not what was typed: the server drops anything too
    // short to be a word and counts each one once.
    setNote(`Saved — ${res.words ?? 0} ${res.words === 1 ? 'word' : 'words'}.`);
    setEditing(null);
    await pull();
  }

  async function remove(list: WordList) {
    if (
      !window.confirm(
        `Delete "${list.name}"? Questions already drawn from it keep their word, ` +
          `because the word was copied when it was drawn. This cannot be undone.`
      )
    )
      return;
    const res = await deleteWordList(list.id);
    if (!res.ok) setNote(res.reason ?? 'That did not work');
    await pull();
  }

  if (lists === null) return <Loader2 className="w-4 h-4 animate-spin text-slate-500 m-8" />;

  return (
    <section>
      <h2 className="text-lg font-bold text-white mb-1">Word lists</h2>
      <p className="text-sm text-slate-400 mb-4">
        Words of your own for a themed round. A question drawn from a list still
        accepts ordinary words as guesses — the list decides what the answer is,
        not what counts as a word.
      </p>

      {lists.length > 0 && (
        <ul className="space-y-2 mb-4">
          {lists.map((list) => (
            <li
              key={list.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/15 p-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-200 truncate">{list.name}</p>
                <p className="text-xs text-slate-400">
                  {list.words} {list.words === 1 ? 'word' : 'words'}
                  {list.lengths.length > 0 && ` · ${list.lengths.join(', ')} letters`}
                </p>
                {list.daily_from && list.daily_until && (
                  <p className="text-xs text-accent">
                    Themes the dailies {list.daily_from} to {list.daily_until}
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                <button className={BUTTON} onClick={() => void open(list)}>
                  Edit
                </button>
                <button className={BUTTON} onClick={() => void remove(list)}>
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing === null ? (
        <button className={BUTTON} onClick={startNew}>
          New list
        </button>
      ) : (
        <div className="rounded-xl border border-white/15 p-4 space-y-3">
          <label className="block">
            <span className="text-sm font-semibold text-slate-200">Name</span>
            <input
              className={FIELD + ' mt-1'}
              value={name}
              placeholder="Employee ownership"
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-slate-200">Words</span>
            <span className="block text-xs text-slate-400 mt-0.5 mb-1">
              One per line, or paste them however they come. Anything under three
              letters is left out.
            </span>
            <textarea
              className={FIELD + ' h-48 font-mono'}
              value={words}
              placeholder={'shares\ndividend\nesop'}
              onChange={(e) => setWords(e.target.value)}
            />
          </label>
          {/* Everything above is enough for a themed round inside a session.
              Everything below is only for taking over the daily puzzles, which
              most lists never do — hence the heading rather than four more
              fields with no explanation. */}
          <div className="rounded-lg border border-white/15 p-3 space-y-3">
            <p className="text-xs uppercase tracking-wider text-slate-500">
              Take over the dailies (optional)
            </p>
            <div className="flex flex-wrap gap-3">
              <label className="flex flex-col gap-1 text-xs text-slate-400">
                From
                <input
                  type="date"
                  className={FIELD + ' w-auto'}
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-slate-400">
                Until
                <input
                  type="date"
                  className={FIELD + ' w-auto'}
                  value={until}
                  onChange={(e) => setUntil(e.target.value)}
                />
              </label>
            </div>
            {/* Said here because it is the surprising part: the window is built
                a fortnight ahead, so dates set the week before an event still
                catch it, and dates set the day before do not. */}
            <p className="text-xs text-slate-500">
              Puzzles are generated a fortnight ahead, so set these at least two
              weeks before the first day.
            </p>
            <label className="block">
              <span className="text-xs text-slate-400">Clue for the Weave board</span>
              <input
                className={FIELD + ' mt-1'}
                value={clue}
                placeholder={name || 'What we all are'}
                onChange={(e) => setClue(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="text-xs text-slate-400">Spangram</span>
              <span className="block text-xs text-slate-500 mt-0.5 mb-1">
                The long answer threaded corner to corner — one word, 6 to 16
                letters. Without one the list still picks the daily word, but
                cannot build a Weave board.
              </span>
              <input
                className={FIELD}
                value={spangram}
                placeholder="employeeowned"
                onChange={(e) => setSpangram(e.target.value)}
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button className={BUTTON} disabled={busy} onClick={() => void save()}>
              {busy ? 'Saving…' : 'Save list'}
            </button>
            <button className={BUTTON} disabled={busy} onClick={() => setEditing(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {note && <p className="text-xs text-slate-400 mt-3">{note}</p>}
    </section>
  );
}
