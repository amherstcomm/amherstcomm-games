// Setting up a contest.
//
// Four dates and four decisions. The dates are two windows -- when entries are
// taken, and when people vote on them -- and the decisions are the ones that
// make the same machinery run a staff pumpkin competition and a blind judging:
// who enters, whether the entries carry names, whether the ballot is secret,
// and how many each voter ranks.
//
// The rules live in the database and come back as sentences, so this shows them
// rather than restating them: voting starts once entering has finished, and
// each window has to end on or after it starts.
import { useCallback, useEffect, useState } from 'react';
import Waiting from '@/Waiting';
import { deleteContest, PHASE_WORD, readContests, saveContest, type ContestRow } from '@/contests';

const FIELD =
  'w-full rounded-lg bg-white/5 border border-white/15 px-3 py-2 text-sm text-slate-200 ' +
  'placeholder:text-slate-500 focus:outline-none focus:border-accent';
const BUTTON =
  'inline-flex items-center justify-center px-3 h-9 rounded-lg text-sm font-semibold ' +
  'bg-white/10 border border-white/15 text-slate-200 hover:bg-white/15 disabled:opacity-50';

type Form = {
  id: string | null;
  name: string;
  blurb: string;
  entriesOpen: string;
  entriesClose: string;
  votesOpen: string;
  votesClose: string;
  whoEnters: 'players' | 'admins';
  entrantsShown: boolean;
  votersShown: boolean;
  picks: number;
  prize: string;
};

const blank = (): Form => ({
  id: null,
  name: '',
  blurb: '',
  entriesOpen: '',
  entriesClose: '',
  votesOpen: '',
  votesClose: '',
  whoEnters: 'players',
  entrantsShown: true,
  votersShown: false,
  picks: 3,
  prize: '',
});

const formOf = (c: ContestRow): Form => ({
  id: c.id,
  name: c.name,
  blurb: c.blurb ?? '',
  entriesOpen: c.entries_open_on,
  entriesClose: c.entries_close_on,
  votesOpen: c.votes_open_on,
  votesClose: c.votes_close_on,
  whoEnters: c.who_enters,
  entrantsShown: c.entrants_shown,
  votersShown: c.voters_shown,
  picks: c.picks,
  prize: c.prize ?? '',
});

const span = (from: string, until: string) => (from === until ? from : `${from} to ${until}`);

export default function AdminContests() {
  const [rows, setRows] = useState<ContestRow[] | null>(null);
  const [refused, setRefused] = useState<string | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const got = await readContests();
    if (!got.ok) {
      setRefused(got.reason ?? 'not allowed');
      return;
    }
    setRefused(null);
    setRows(got.contests ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    if (!form) return;
    setBusy(true);
    const got = await saveContest(form);
    setBusy(false);
    if (!got.ok) {
      setSaid(got.reason ?? 'that would not save');
      return;
    }
    setSaid(null);
    setForm(null);
    await load();
  }

  async function remove(c: ContestRow) {
    // Entries go with it, photographs and all, and nothing here can put them
    // back -- so the count is in the question rather than a bare "are you
    // sure", which answers nothing somebody does not already believe.
    const sure = window.confirm(
      `Delete "${c.name}" and its ${c.entries} ${c.entries === 1 ? 'entry' : 'entries'}?`
    );
    if (!sure) return;
    const got = await deleteContest(c.id);
    if (!got.ok) {
      setSaid(got.reason ?? 'that would not delete');
      return;
    }
    await load();
  }

  if (refused) return <p className="text-sm text-slate-400 m-8">{refused}</p>;
  if (!rows) return <Waiting what="the contests" onRetry={() => void load()} />;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-slate-200">Contests</h2>
        <p className="text-xs text-slate-400 mt-1">
          A contest is a photo and a few words, entered over a few days and then voted on —
          a pumpkin, a desk, a chili. It is not a session: it runs for days and what is being
          judged is the picture.
        </p>
      </div>

      {said && (
        <p className="text-xs text-rose-300" role="status">
          {said}
        </p>
      )}

      {!form && (
        <button type="button" className={BUTTON} onClick={() => setForm(blank())}>
          New contest
        </button>
      )}

      {form && (
        <section className="rounded-xl border border-white/15 bg-white/5 p-4 space-y-3">
          <label className="block text-xs text-slate-400">
            Name
            <input
              className={FIELD + ' mt-1'}
              value={form.name}
              maxLength={80}
              placeholder="Pumpkin carving"
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </label>
          <label className="block text-xs text-slate-400">
            What it is
            <textarea
              className={FIELD + ' mt-1'}
              rows={3}
              maxLength={1000}
              value={form.blurb}
              placeholder="Carve one, photograph it, and tell us about it."
              onChange={(e) => setForm({ ...form, blurb: e.target.value })}
            />
          </label>

          <fieldset>
            <legend className="text-xs text-slate-400">Entries are taken</legend>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <input
                type="date"
                className={FIELD + ' w-auto'}
                aria-label="Entries open on"
                value={form.entriesOpen}
                onChange={(e) => setForm({ ...form, entriesOpen: e.target.value })}
              />
              <span className="text-xs text-slate-400">to</span>
              <input
                type="date"
                className={FIELD + ' w-auto'}
                aria-label="Entries close on"
                value={form.entriesClose}
                onChange={(e) => setForm({ ...form, entriesClose: e.target.value })}
              />
            </div>
          </fieldset>

          <fieldset>
            <legend className="text-xs text-slate-400">Voting runs</legend>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <input
                type="date"
                className={FIELD + ' w-auto'}
                aria-label="Voting opens on"
                value={form.votesOpen}
                onChange={(e) => setForm({ ...form, votesOpen: e.target.value })}
              />
              <span className="text-xs text-slate-400">to</span>
              <input
                type="date"
                className={FIELD + ' w-auto'}
                aria-label="Voting closes on"
                value={form.votesClose}
                onChange={(e) => setForm({ ...form, votesClose: e.target.value })}
              />
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Voting starts once entering has finished — otherwise the entries that arrived
              first collect every vote cast before the rest were in.
            </p>
          </fieldset>

          <fieldset>
            <legend className="text-xs text-slate-400">Who enters</legend>
            <div className="flex gap-1.5 mt-1" role="group" aria-label="Who enters">
              {(
                [
                  ['players', 'People enter their own'],
                  ['admins', 'An organiser enters them'],
                ] as const
              ).map(([value, word]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={form.whoEnters === value}
                  onClick={() => setForm({ ...form, whoEnters: value })}
                  className={`px-2.5 h-8 rounded-lg text-xs font-semibold border transition-colors ${
                    form.whoEnters === value
                      ? 'bg-accent/20 border-accent text-slate-200'
                      : 'bg-white/5 border-white/15 text-slate-300 hover:bg-white/10'
                  }`}
                >
                  {word}
                </button>
              ))}
            </div>
          </fieldset>

          <label className="flex items-start gap-2 text-xs text-slate-300">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={form.entrantsShown}
              onChange={(e) => setForm({ ...form, entrantsShown: e.target.checked })}
            />
            <span>
              Show whose entry is whose
              <span className="block text-slate-400">
                Off is a blind judging — the entries are numbered and nobody&apos;s name is on
                them, on any screen.
              </span>
            </span>
          </label>

          <label className="flex items-start gap-2 text-xs text-slate-300">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={form.votersShown}
              onChange={(e) => setForm({ ...form, votersShown: e.target.checked })}
            />
            <span>
              Show who voted for what once it is over
              <span className="block text-slate-400">
                Off is a secret ballot, which is the ordinary expectation at work.
              </span>
            </span>
          </label>

          <label className="block text-xs text-slate-400">
            Each voter ranks
            <input
              type="number"
              className={FIELD + ' mt-1 w-24'}
              min={1}
              max={5}
              value={form.picks}
              onChange={(e) => setForm({ ...form, picks: Number(e.target.value) })}
            />
          </label>

          <label className="block text-xs text-slate-400">
            What winning is worth
            <input
              className={FIELD + ' mt-1'}
              value={form.prize}
              maxLength={200}
              placeholder="A day off, and the trophy until next October"
              onChange={(e) => setForm({ ...form, prize: e.target.value })}
            />
          </label>

          <div className="flex gap-2">
            <button type="button" className={BUTTON} disabled={busy} onClick={() => void save()}>
              Save
            </button>
            <button type="button" className={BUTTON} disabled={busy} onClick={() => setForm(null)}>
              Cancel
            </button>
          </div>
        </section>
      )}

      {rows.length === 0 ? (
        <p className="text-sm text-slate-400">No contests yet.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((c) => (
            <li key={c.id} className="rounded-xl border border-white/15 bg-white/5 px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-200 text-sm">{c.name}</p>
                  <p className="text-xs text-slate-400">
                    {PHASE_WORD[c.phase]} · entries {span(c.entries_open_on, c.entries_close_on)} ·
                    voting {span(c.votes_open_on, c.votes_close_on)}
                  </p>
                  <p className="text-xs text-slate-400">
                    {c.entries} {c.entries === 1 ? 'entry' : 'entries'} ·{' '}
                    {c.who_enters === 'players' ? 'people enter their own' : 'an organiser enters them'} ·{' '}
                    {c.entrants_shown ? 'names shown' : 'blind'} ·{' '}
                    {c.voters_shown ? 'open ballot' : 'secret ballot'} · ranks {c.picks}
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button type="button" className={BUTTON} onClick={() => setForm(formOf(c))}>
                    Edit
                  </button>
                  <button type="button" className={BUTTON} onClick={() => void remove(c)}>
                    Delete
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
