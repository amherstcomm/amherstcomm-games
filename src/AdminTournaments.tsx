// Setting up a tournament and its rounds.
//
// A tournament is a span of dates with one difficulty. A round is its own span
// inside it and a list of games, and each of those games has one board for the
// whole round -- the nightly run publishes it the night before the round starts.
// Nothing here assumes a length: a round can be a day or most of the tournament.
//
// The rules live in the database and come back as sentences, so the page
// shows them rather than restating them: a round has to fall inside its
// tournament, two rounds cannot share a day, and a round that has started can
// only move its end date, because its board is being played.
import { useCallback, useEffect, useState } from 'react';
import Waiting from '@/Waiting';
import { DIFFICULTIES, DIFFICULTY_LABEL, type Difficulty } from '@/difficulty';
import {
  deleteRound,
  deleteTournament,
  readTournaments,
  ROUND_GAMES,
  roundGameName,
  saveRound,
  saveTournament,
  type Round,
  type Tournament,
} from '@/tournaments';

const FIELD =
  'w-full rounded-lg bg-white/5 border border-white/15 px-3 py-2 text-sm text-slate-200 ' +
  'placeholder:text-slate-500 focus:outline-none focus:border-accent';
const BUTTON =
  'inline-flex items-center justify-center px-3 h-9 rounded-lg text-sm font-semibold ' +
  'bg-white/10 border border-white/15 text-slate-200 hover:bg-white/15 disabled:opacity-50';

/** Today where the puzzles roll, for saying whether a round is on or over. */
const easternToday = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());

const span = (from: string, until: string) => (from === until ? `on ${from}` : `${from} to ${until}`);

/** The state a round is in, in the words somebody looking at the list wants. */
function roundState(r: Round): string | null {
  if (!r.started) return null;
  return r.ends_on < easternToday() ? 'finished' : 'under way';
}

type TournamentForm = { id: string | null; name: string; difficulty: Difficulty; from: string; until: string };
type RoundForm = {
  id: string | null;
  tournament: string;
  from: string;
  until: string;
  games: string[];
  /** a round being played: only its end date may change */
  started: boolean;
};

export default function AdminTournaments() {
  const [tournaments, setTournaments] = useState<Tournament[] | null>(null);
  const [refused, setRefused] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [tForm, setTForm] = useState<TournamentForm | null>(null);
  const [rForm, setRForm] = useState<RoundForm | null>(null);

  const pull = useCallback(async () => {
    const res = await readTournaments();
    if (!res.ok) {
      setRefused(res.reason ?? 'Not available');
      setTournaments([]);
      return;
    }
    setRefused('');
    setTournaments(res.tournaments);
  }, []);
  useEffect(() => void pull(), [pull]);

  async function submitTournament() {
    if (!tForm) return;
    setBusy(true);
    const res = await saveTournament(tForm);
    setBusy(false);
    if (!res.ok) {
      setNote(res.reason ?? 'That did not work');
      return;
    }
    setNote('Saved.');
    setTForm(null);
    await pull();
  }

  async function submitRound() {
    if (!rForm) return;
    setBusy(true);
    const res = await saveRound(rForm);
    setBusy(false);
    if (!res.ok) {
      setNote(res.reason ?? 'That did not work');
      return;
    }
    setNote('Saved. The nightly run publishes a round the night before it starts.');
    setRForm(null);
    await pull();
  }

  async function removeTournament(t: Tournament) {
    if (!window.confirm(`Delete ${t.name} and its rounds?`)) return;
    const res = await deleteTournament(t.id);
    setNote(res.ok ? 'Deleted.' : (res.reason ?? 'That did not work'));
    await pull();
  }

  async function removeRound(r: Round) {
    if (!window.confirm(`Delete the round ${span(r.starts_on, r.ends_on)}?`)) return;
    const res = await deleteRound(r.id);
    setNote(res.ok ? 'Deleted.' : (res.reason ?? 'That did not work'));
    await pull();
  }

  function toggleGame(feed: string) {
    if (!rForm) return;
    const games = rForm.games.includes(feed)
      ? rForm.games.filter((g) => g !== feed)
      : [...rForm.games, feed];
    setRForm({ ...rForm, games });
  }

  return (
    <section>
      <h2 className="text-lg font-bold text-white mb-1">Tournaments</h2>
      <p className="text-sm text-slate-400 mb-4">
        A tournament is a run of dates played at one difficulty, made of rounds.
        Each round has its own dates and games, and every game in it keeps the
        same board for the whole round — one attempt each, and the first finish
        is the one that counts. The nightly run publishes a round the night
        before it starts.
      </p>

      {note && <p className="text-sm text-slate-300 mb-3" role="status">{note}</p>}
      {tournaments === null && (
        <Waiting what="the tournaments" onRetry={() => void pull()} className="my-4" />
      )}
      {refused && <p className="text-sm text-rose-300">{refused}</p>}

      {tournaments !== null && !refused && (
        <>
          <ul className="space-y-4 mb-4">
            {tournaments.map((t) => (
              <li key={t.id} className="rounded-xl border border-white/15 p-4" data-tournament={t.name}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-200">{t.name}</p>
                    <p className="text-xs text-slate-400">
                      {DIFFICULTY_LABEL[t.difficulty]} · {span(t.starts_on, t.ends_on)}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      className={BUTTON}
                      onClick={() =>
                        setTForm({
                          id: t.id,
                          name: t.name,
                          difficulty: t.difficulty,
                          from: t.starts_on,
                          until: t.ends_on,
                        })
                      }
                    >
                      Edit
                    </button>
                    <button className={BUTTON} onClick={() => void removeTournament(t)}>
                      Delete
                    </button>
                  </div>
                </div>

                <ol className="mt-3 space-y-2" aria-label={`Rounds of ${t.name}`}>
                  {t.rounds.map((r, i) => {
                    const state = roundState(r);
                    return (
                      <li
                        key={r.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white/5 px-3 py-2"
                      >
                        <div className="min-w-0 text-xs">
                          <p className="font-semibold text-slate-200">
                            Round {i + 1} · {span(r.starts_on, r.ends_on)}
                            {state && <span className="ml-2 text-accent">{state}</span>}
                          </p>
                          <p className="text-slate-400">{r.games.map(roundGameName).join(', ')}</p>
                        </div>
                        <div className="flex gap-2">
                          {/* A finished round is a record: nothing about it
                              can change, so it offers nothing. */}
                          {state !== 'finished' && (
                            <button
                              className={BUTTON}
                              onClick={() =>
                                setRForm({
                                  id: r.id,
                                  tournament: t.id,
                                  from: r.starts_on,
                                  until: r.ends_on,
                                  games: r.games,
                                  started: r.started,
                                })
                              }
                            >
                              Edit round
                            </button>
                          )}
                          {!r.started && (
                            <button className={BUTTON} onClick={() => void removeRound(r)}>
                              Delete round
                            </button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ol>

                {rForm?.tournament === t.id ? (
                  <div className="mt-3 rounded-lg border border-white/15 p-3 space-y-3" data-round-form>
                    {rForm.started && (
                      <p className="text-xs text-amber-200">
                        This round is under way, so only its end date can change —
                        its board is being played, and a new first day or a
                        different set of games would change it under people.
                      </p>
                    )}
                    <div className="flex flex-wrap gap-3">
                      <label className="flex flex-col gap-1 text-xs text-slate-400">
                        Round starts
                        <input
                          type="date"
                          className={FIELD + ' w-auto'}
                          value={rForm.from}
                          min={t.starts_on}
                          max={t.ends_on}
                          disabled={rForm.started}
                          onChange={(e) => setRForm({ ...rForm, from: e.target.value })}
                        />
                      </label>
                      <label className="flex flex-col gap-1 text-xs text-slate-400">
                        Round ends
                        <input
                          type="date"
                          className={FIELD + ' w-auto'}
                          value={rForm.until}
                          min={rForm.from || t.starts_on}
                          max={t.ends_on}
                          onChange={(e) => setRForm({ ...rForm, until: e.target.value })}
                        />
                      </label>
                    </div>
                    {!rForm.started && (
                      <fieldset>
                        <legend className="text-xs text-slate-400 mb-1">Games in this round</legend>
                        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Games in this round">
                          {ROUND_GAMES.map((g) => {
                            const on = rForm.games.includes(g.feed);
                            return (
                              <button
                                key={g.feed}
                                type="button"
                                aria-pressed={on}
                                onClick={() => toggleGame(g.feed)}
                                className={`px-2.5 h-8 rounded-lg text-xs font-semibold border transition-colors ${
                                  on
                                    ? 'bg-accent/20 border-accent text-slate-200'
                                    : 'bg-white/5 border-white/15 text-slate-300 hover:bg-white/10'
                                }`}
                              >
                                {g.name}
                              </button>
                            );
                          })}
                        </div>
                      </fieldset>
                    )}
                    <div className="flex gap-2">
                      <button
                        className={BUTTON}
                        disabled={busy || !rForm.from || !rForm.until || rForm.games.length === 0}
                        onClick={() => void submitRound()}
                      >
                        Save round
                      </button>
                      <button className={BUTTON} onClick={() => setRForm(null)}>
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    className={BUTTON + ' mt-3'}
                    onClick={() =>
                      setRForm({
                        id: null,
                        tournament: t.id,
                        from: '',
                        until: '',
                        games: [],
                        started: false,
                      })
                    }
                  >
                    Add a round
                  </button>
                )}
              </li>
            ))}
          </ul>

          {tForm === null ? (
            <button
              className={BUTTON}
              onClick={() => setTForm({ id: null, name: '', difficulty: 'hard', from: '', until: '' })}
            >
              New tournament
            </button>
          ) : (
            <div className="rounded-xl border border-white/15 p-4 space-y-3" data-tournament-form>
              <label className="block">
                <span className="text-sm font-semibold text-slate-200">Name</span>
                <input
                  className={FIELD + ' mt-1'}
                  aria-label="Tournament name"
                  value={tForm.name}
                  maxLength={80}
                  onChange={(e) => setTForm({ ...tForm, name: e.target.value })}
                />
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-slate-200">Difficulty</span>
                <span className="block text-xs text-slate-400 mt-0.5 mb-1">
                  Everybody plays the same board, so there is one set of
                  standings per round. Fixed once a round has started.
                </span>
                <select
                  className={FIELD}
                  aria-label="Tournament difficulty"
                  value={tForm.difficulty}
                  onChange={(e) => setTForm({ ...tForm, difficulty: e.target.value as Difficulty })}
                >
                  {DIFFICULTIES.map((d) => (
                    <option key={d} value={d}>
                      {DIFFICULTY_LABEL[d]}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex flex-wrap gap-3">
                <label className="flex flex-col gap-1 text-xs text-slate-400">
                  Starts
                  <input
                    type="date"
                    className={FIELD + ' w-auto'}
                    value={tForm.from}
                    onChange={(e) => setTForm({ ...tForm, from: e.target.value })}
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-slate-400">
                  Ends
                  <input
                    type="date"
                    className={FIELD + ' w-auto'}
                    value={tForm.until}
                    min={tForm.from || undefined}
                    onChange={(e) => setTForm({ ...tForm, until: e.target.value })}
                  />
                </label>
              </div>
              <div className="flex gap-2">
                <button
                  className={BUTTON}
                  disabled={busy || !tForm.name.trim() || !tForm.from || !tForm.until}
                  onClick={() => void submitTournament()}
                >
                  Save tournament
                </button>
                <button className={BUTTON} onClick={() => setTForm(null)}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
