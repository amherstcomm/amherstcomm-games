// Cryptogram passages of a deployment's own.
//
// The daily cryptogram plays a curated quotation. During an event month it can
// play the company's own words instead — a line out of the charter, something
// said at the annual meeting — which is a better puzzle for exactly the same
// reason a themed word list is: the answer is a thing about the people solving
// it.
//
// What this page has that a plain form would not is the length, said while
// somebody is writing. The bands are the generator's — 50 to 100 letters at
// easy and hard, 35 to 49 at extreme — and they are counted in *letters*, so a
// long-looking sentence of short words is shorter than it looks. Discovering
// that from a refusal after pressing Save is a worse way to find out, and
// discovering it from a nightly run that quietly used a curated quotation
// instead is the worst.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { deletePassage, readPassages, savePassage, type Passage } from '@/passages';
import { fitNote, lettersIn, tiersFor } from '@/cryptogramFit';
import ImportBox from '@/ImportBox';
import { PASSAGE_TEMPLATE } from '@/templates';
import { parsePassages, type ParsedPassage } from '@/importing';

const FIELD =
  'w-full rounded-lg bg-white/5 border border-white/15 px-3 py-2 text-sm text-slate-100 ' +
  'placeholder:text-slate-500 focus:outline-none focus:border-accent';
const BUTTON =
  'inline-flex items-center justify-center px-3 h-9 rounded-lg text-sm font-semibold ' +
  'bg-white/10 border border-white/15 text-slate-200 hover:bg-white/15 disabled:opacity-50';

/** What this passage can be used for, as it is typed. */
function Fit({ text }: { text: string }) {
  const fit = useMemo(() => fitNote(text), [text]);
  if (lettersIn(text) === 0) return null;

  return (
    <div className="rounded-lg border border-white/15 p-3 text-xs space-y-1">
      <p className={fit.ok ? 'text-emerald-300' : 'text-amber-300'}>
        {fit.ok ? '✓' : '!'} {fit.note}
      </p>
      {/* A curation step this page cannot run, so it is said rather than
          enforced: the guard needs the whole dictionary and a search. On a
          short board a second common-word reading is a solution the answer
          check calls wrong, and it is worth knowing that the curated short
          passages were filtered for it and yours was not. */}
      {fit.short && (
        <p className="text-slate-400">
          Short passages only play at extreme, where a second reading of the
          same letters is likeliest. The curated ones are checked for that; this
          one is not, so read it back once before the day it runs.
        </p>
      )}
      {!fit.ok && (
        <p className="text-slate-400">
          Letters only — spaces and punctuation are carried through as
          themselves and are not counted.
        </p>
      )}
    </div>
  );
}

export default function AdminPassages() {
  const [passages, setPassages] = useState<Passage[] | null>(null);
  const [refused, setRefused] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [author, setAuthor] = useState('');
  const [from, setFrom] = useState('');
  const [until, setUntil] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const pull = useCallback(async () => {
    const res = await readPassages();
    if (!res.ok) {
      setRefused(res.reason ?? 'Not available');
      setPassages([]);
      return;
    }
    setRefused('');
    setPassages(res.passages);
  }, []);
  useEffect(() => void pull(), [pull]);

  function startNew() {
    setEditing('new');
    setText('');
    setAuthor('');
    setFrom('');
    setUntil('');
    setNote('');
  }

  function open(passage: Passage) {
    setEditing(passage.id);
    setText(passage.text);
    setAuthor(passage.author ?? '');
    // All of them, because saving sends all of them: a field left at its
    // initial value would quietly clear what the row had.
    setFrom(passage.starts_on ?? '');
    setUntil(passage.ends_on ?? '');
    setNote('');
  }

  async function save() {
    setBusy(true);
    const res = await savePassage({
      id: editing === 'new' ? null : editing,
      text,
      author,
      from,
      until,
    });
    setBusy(false);
    if (!res.ok) {
      setNote(res.reason ?? 'That did not work');
      return;
    }
    setNote(`Saved — ${res.letters ?? 0} letters.`);
    setEditing(null);
    await pull();
  }

  async function remove(passage: Passage) {
    if (
      !window.confirm(
        `Delete this passage? A day already generated from it keeps its board, ` +
          `because the text was copied when the puzzle was built. This cannot be undone.`
      )
    )
      return;
    const res = await deletePassage(passage.id);
    if (!res.ok) setNote(res.reason ?? 'That did not work');
    await pull();
  }

  return (
    <section>
      <h2 className="text-lg font-bold text-white mb-1">Cryptogram passages</h2>
      <p className="text-sm text-slate-400 mb-4">
        Words of your own for the daily cryptogram. A day with none plays a
        curated quotation, exactly as it always has — and so does a difficulty
        whose length band nothing here fits.
      </p>

      {passages === null && <Loader2 className="w-4 h-4 animate-spin text-slate-500" />}
      {refused && <p className="text-sm text-rose-300">{refused}</p>}

      {passages !== null && !refused && (
        <>
          {passages.length > 0 && (
            <ul className="space-y-2 mb-4">
              {passages.map((passage) => {
                const tiers = tiersFor(passage.text);
                return (
                  <li
                    key={passage.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/15 p-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm text-slate-200 truncate">{passage.text}</p>
                      <p className="text-xs text-slate-400">
                        {passage.letters} letters
                        {passage.author && ` · ${passage.author}`}
                        {tiers.length > 0 ? ` · ${tiers.join(', ')}` : ' · no board takes it'}
                      </p>
                      {passage.starts_on && passage.ends_on ? (
                        <p className="text-xs text-accent">
                          {passage.starts_on === passage.ends_on
                            ? `On ${passage.starts_on}`
                            : `${passage.starts_on} to ${passage.ends_on}`}
                        </p>
                      ) : (
                        <p className="text-xs text-slate-500">Not scheduled</p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button className={BUTTON} onClick={() => open(passage)}>
                        Edit
                      </button>
                      <button className={BUTTON} onClick={() => void remove(passage)}>
                        Delete
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {editing === null ? (
            <div className="flex flex-wrap gap-2">
              <button className={BUTTON} onClick={startNew}>
                New passage
              </button>
              {/* A month at a time, which is the case this is for. The parser
                  takes a bare list of strings as well, so a handful lifted out
                  of the curated file imports without being reshaped first. */}
              <ImportBox<ParsedPassage>
                label="Paste passages"
                placeholder={
                  '[{ "text": "We own this place together.",\n' +
                  '   "author": "The charter",\n' +
                  '   "starts_on": "2026-10-01", "ends_on": "2026-10-31" }]'
                }
                template={PASSAGE_TEMPLATE}
                templateName="cryptogram-passages-template.json"
                parse={parsePassages}
                describe={(p) => {
                  // The fit in the preview, because a passage no board takes
                  // is refused on save and a paste of thirty wants that visible
                  // before the refusals arrive one at a time.
                  const tiers = tiersFor(p.text);
                  const when = p.from
                    ? ` · ${p.from}${p.until && p.until !== p.from ? `–${p.until}` : ''}`
                    : '';
                  const head = p.text.length > 40 ? `${p.text.slice(0, 40)}…` : p.text;
                  return `${head} (${lettersIn(p.text)} letters)${when} — ${
                    tiers.length > 0 ? tiers.join(', ') : 'no board takes it'
                  }`;
                }}
                save={(p) =>
                  savePassage({
                    id: null,
                    text: p.text,
                    author: p.author,
                    from: p.from,
                    until: p.until,
                  })
                }
                onDone={() => void pull()}
              />
            </div>
          ) : (
            <div className="rounded-xl border border-white/15 p-4 space-y-3">
              <label className="block">
                <span className="text-sm font-semibold text-slate-200">Passage</span>
                <span className="block text-xs text-slate-400 mt-0.5 mb-1">
                  One or two sentences. 50 to 100 letters plays at easy and hard;
                  35 to 49 plays at extreme.
                </span>
                <textarea
                  className={FIELD + ' h-28'}
                  value={text}
                  placeholder="We own this place together, and every share of it was earned here."
                  onChange={(e) => setText(e.target.value)}
                />
              </label>

              <Fit text={text} />

              <label className="block">
                <span className="text-sm font-semibold text-slate-200">Author (optional)</span>
                <span className="block text-xs text-slate-400 mt-0.5 mb-1">
                  Shown under the puzzle once it is solved.
                </span>
                <input
                  className={FIELD}
                  value={author}
                  placeholder="The charter"
                  onChange={(e) => setAuthor(e.target.value)}
                />
              </label>

              <div className="rounded-lg border border-white/15 p-3 space-y-3">
                <p className="text-xs uppercase tracking-wider text-slate-500">
                  Take over the daily cryptogram (optional)
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
                <p className="text-xs text-slate-500">
                  Puzzles are generated a fortnight ahead, so set these at least
                  two weeks before the first day. Several may cover a day — each
                  difficulty picks from the ones its band can take.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button className={BUTTON} disabled={busy} onClick={() => void save()}>
                  {busy ? 'Saving…' : 'Save passage'}
                </button>
                <button className={BUTTON} disabled={busy} onClick={() => setEditing(null)}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {note && <p className="text-xs text-slate-400 mt-3">{note}</p>}
    </section>
  );
}
