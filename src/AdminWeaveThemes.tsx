// Weave themes of somebody's own.
//
// The thing this page has that the others do not is a calculator, and it earns
// its place: Weave tiles the whole board, so the words have to sum *exactly* to
// the cells the spangram leaves. A theme can look generous and still fail —
// forty-eight letters in sixes cannot make thirty-five — and the failure is
// silent, because the generator simply passes the theme over and uses a curated
// one. That looks like nothing happening.
//
// So the fit is shown while somebody types, per board, with the reason when it
// does not fit.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  deleteWeaveTheme,
  readWeaveThemes,
  saveWeaveTheme,
  type WeaveTheme,
} from '@/weaveThemes';
import { BOARD_CELLS, fitsBoards } from '@/weaveFit';

const FIELD =
  'w-full rounded-lg bg-white/5 border border-white/15 px-3 py-2 text-sm text-slate-100 ' +
  'placeholder:text-slate-500 focus:outline-none focus:border-accent';
const BUTTON =
  'inline-flex items-center justify-center px-3 h-9 rounded-lg text-sm font-semibold ' +
  'bg-white/10 border border-white/15 text-slate-200 hover:bg-white/15 disabled:opacity-50';

const TIER_NAME: Record<string, string> = {
  easy: 'Easy',
  hard: 'Hard',
  extreme: 'Extreme',
};

/** What a theme can and cannot fill, in the words somebody writing one needs. */
function Fits({ spangram, words }: { spangram: string; words: string }) {
  const list = useMemo(
    () => words.split(/[^A-Za-z]+/).filter((w) => w.length > 0),
    [words]
  );
  const fits = useMemo(() => fitsBoards(spangram, list), [spangram, list]);
  const letters = list
    .filter((w) => w.length >= 4 && w.length <= 10 && w.toLowerCase() !== spangram.toLowerCase())
    .reduce((n, w) => n + w.length, 0);

  return (
    <div className="rounded-lg border border-white/15 p-3 text-xs space-y-1">
      <p className="text-slate-400">
        {list.length} {list.length === 1 ? 'word' : 'words'} · {letters} letters usable
        {spangram && ` · spangram ${spangram.length}`}
      </p>
      {Object.entries(BOARD_CELLS).map(([tier]) => {
        const fit = fits[tier];
        return (
          <p key={tier} className={fit.fits ? 'text-emerald-300' : 'text-slate-500'}>
            {fit.fits ? '✓' : '·'} {TIER_NAME[tier]} ({fit.cells} squares
            {fit.needed > 0 ? `, ${fit.needed} to fill` : ''})
            {!fit.fits && fit.why ? ` — ${fit.why}` : ''}
          </p>
        );
      })}
      {/* The honest limit, said once rather than discovered per theme: a theme
          that fills no board is not an error, it just never comes up. */}
      {!Object.values(fits).some((f) => f.fits) && (
        <p className="text-amber-300">
          This fills no board yet, so it would never be used. It can still be
          saved and finished later.
        </p>
      )}
    </div>
  );
}

export default function AdminWeaveThemes() {
  const [themes, setThemes] = useState<WeaveTheme[] | null>(null);
  const [refused, setRefused] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [clue, setClue] = useState('');
  const [spangram, setSpangram] = useState('');
  const [words, setWords] = useState('');
  const [from, setFrom] = useState('');
  const [until, setUntil] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const pull = useCallback(async () => {
    const res = await readWeaveThemes();
    if (!res.ok) {
      setRefused(res.reason ?? 'Not available');
      setThemes([]);
      return;
    }
    setRefused('');
    setThemes(res.themes ?? []);
  }, []);
  useEffect(() => void pull(), [pull]);

  function startNew() {
    setEditing('new');
    setClue('');
    setSpangram('');
    setWords('');
    setFrom('');
    setUntil('');
    setNote('');
  }

  function open(theme: WeaveTheme) {
    setEditing(theme.id);
    setClue(theme.clue);
    setSpangram(theme.spangram);
    setWords(theme.words.join('\n'));
    setFrom(theme.starts_on ?? '');
    setUntil(theme.ends_on ?? '');
    setNote('');
  }

  async function save() {
    setBusy(true);
    const res = await saveWeaveTheme({
      id: editing === 'new' ? null : editing,
      clue,
      spangram,
      words,
      from,
      until,
    });
    setBusy(false);
    if (!res.ok) {
      setNote(res.reason ?? 'That did not work');
      return;
    }
    setNote(`Saved — ${res.words ?? 0} ${res.words === 1 ? 'word' : 'words'}.`);
    setEditing(null);
    await pull();
  }

  async function remove(theme: WeaveTheme) {
    if (!window.confirm(`Delete "${theme.clue}"? This cannot be undone.`)) return;
    const res = await deleteWeaveTheme(theme.id);
    if (!res.ok) setNote(res.reason ?? 'That did not work');
    await pull();
  }

  return (
    <section>
      <h2 className="text-lg font-bold text-white mb-1">Weave themes</h2>
      <p className="text-sm text-slate-400 mb-4">
        A clue, a long answer threaded corner to corner, and words that fill the
        rest of the board exactly. Every theme covering a day is a candidate, so
        several across a month is a month that does not repeat itself.
      </p>

      {themes === null && <Loader2 className="w-4 h-4 animate-spin text-slate-500" />}
      {refused && <p className="text-sm text-rose-300">{refused}</p>}

      {themes !== null && !refused && (
        <>
          {themes.length > 0 && (
            <ul className="space-y-2 mb-4">
              {themes.map((theme) => (
                <li
                  key={theme.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/15 p-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-200 truncate">
                      {theme.clue}
                    </p>
                    <p className="text-xs text-slate-400">
                      {theme.spangram} · {theme.words.length} words
                    </p>
                    {theme.starts_on && theme.ends_on ? (
                      <p className="text-xs text-accent">
                        {theme.starts_on === theme.ends_on
                          ? `On ${theme.starts_on}`
                          : `${theme.starts_on} to ${theme.ends_on}`}
                      </p>
                    ) : (
                      <p className="text-xs text-slate-500">Not scheduled</p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button className={BUTTON} onClick={() => open(theme)}>
                      Edit
                    </button>
                    <button className={BUTTON} onClick={() => void remove(theme)}>
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {editing === null ? (
            <button className={BUTTON} onClick={startNew}>
              New theme
            </button>
          ) : (
            <div className="rounded-xl border border-white/15 p-4 space-y-3">
              <label className="block">
                <span className="text-sm font-semibold text-slate-200">Clue</span>
                <input
                  className={FIELD + ' mt-1'}
                  value={clue}
                  placeholder="Profit sharing"
                  onChange={(e) => setClue(e.target.value)}
                />
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-slate-200">Spangram</span>
                <span className="block text-xs text-slate-400 mt-0.5 mb-1">
                  One word, 6 to 16 letters, threaded corner to corner.
                </span>
                <input
                  className={FIELD}
                  value={spangram}
                  placeholder="profitsharing"
                  onChange={(e) => setSpangram(e.target.value)}
                />
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-slate-200">Words</span>
                <span className="block text-xs text-slate-400 mt-0.5 mb-1">
                  One per line. Four to ten letters each; anything else is left
                  out.
                </span>
                <textarea
                  className={FIELD + ' h-40 font-mono'}
                  value={words}
                  placeholder={'metrics\npayout\nreward\ntarget\nbonus\nsplit'}
                  onChange={(e) => setWords(e.target.value)}
                />
              </label>

              <Fits spangram={spangram} words={words} />

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
              {/* One date is the same field twice, said here rather than left to
                  be guessed. */}
              <p className="text-xs text-slate-500">
                Same date in both for a single day. Puzzles are built a fortnight
                ahead, so set these at least two weeks before.
              </p>

              <div className="flex flex-wrap items-center gap-2">
                <button className={BUTTON} disabled={busy} onClick={() => void save()}>
                  {busy ? 'Saving…' : 'Save theme'}
                </button>
                <button className={BUTTON} disabled={busy} onClick={() => setEditing(null)}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {note && <p className="text-xs text-slate-400 mt-3">{note}</p>}
        </>
      )}
    </section>
  );
}
