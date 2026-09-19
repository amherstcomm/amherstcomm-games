// Setting up a tournament and its rounds.
//
// A tournament is a span of dates with one difficulty. A round is its own span
// inside it, a list of games and a list of trivia sessions. Each game has one
// board for the whole round -- the nightly run publishes it the night before
// the round starts. Nothing here assumes a length: a round can be a day or most
// of the tournament.
//
// Trivia is whichever sessions the round counts, at whatever each is worth. A
// live session is the round's trivia night; an open one is trivia played on
// your own time inside the round. Both are ordinary sessions, built and run
// from the sessions screen -- this only says which of them a round scores.
//
// The rules live in the database and come back as sentences, so the page
// shows them rather than restating them: a round has to fall inside its
// tournament, two rounds cannot share a day, and a round that has started can
// only move its end date, because its board is being played.
import { useCallback, useEffect, useState } from 'react';
import Waiting from '@/Waiting';
import { readSessions, type SessionSummary } from '@/authoring';
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

type TournamentForm = {
  id: string | null;
  name: string;
  difficulty: Difficulty;
  from: string;
  until: string;
  /** the tournament is the whole site from its first day to its last */
  locksSite: boolean;
  /** while locked, sessions outside its rounds stay joinable */
  sessionsOpen: boolean;
};
type RoundForm = {
  id: string | null;
  tournament: string;
  from: string;
  until: string;
  games: string[];
  /** the sessions this round counts, and what each is worth */
  sessions: { id: string; weight: number }[];
  /** a round being played: only its end date may change */
  started: boolean;
  /** a round that is over: its trivia may still be attached, nothing else */
  finished: boolean;
};

/** A session's mode and state, for the picker. "Open · closed" is a session
 *  people played on their own time and can no longer add to; its scores stand,
 *  which is exactly what a round wants to count. */
const sessionNote = (s: SessionSummary) =>
  `${s.mode === 'open' ? 'On your own time' : 'Live'} · ${s.state} · ${s.items} question${s.items === 1 ? '' : 's'}`;

export default function AdminTournaments() {
  const [tournaments, setTournaments] = useState<Tournament[] | null>(null);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
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
  // Separate from the tournaments, and allowed to come back empty: a site with
  // no sessions yet still sets rounds up, it just has no trivia to offer.
  useEffect(() => {
    let alive = true;
    void readSessions().then((rows) => {
      if (alive) setSessions(rows);
    });
    return () => {
      alive = false;
    };
  }, []);

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

  function toggleSession(id: string) {
    if (!rForm) return;
    const on = rForm.sessions.some((x) => x.id === id);
    setRForm({
      ...rForm,
      sessions: on
        ? rForm.sessions.filter((x) => x.id !== id)
        : [...rForm.sessions, { id, weight: 1 }],
    });
  }

  function setWeight(id: string, weight: number) {
    if (!rForm) return;
    setRForm({
      ...rForm,
      sessions: rForm.sessions.map((x) => (x.id === id ? { ...x, weight } : x)),
    });
  }

  return (
    <section>
      <h2 className="text-lg font-bold text-white mb-1">Tournaments</h2>
      <p className="text-sm text-slate-400 mb-4">
        A tournament is a run of dates played at one difficulty, made of rounds.
        Each round has its own dates, its games and its trivia. Every game in a
        round keeps the same board for the whole round — one attempt each, and
        the first finish is the one that counts. The nightly run publishes a
        round the night before it starts. Trivia is a session the round counts:
        a live one run from the front, or an open one played on your own time
        inside the round.
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
                    {t.locks_site && (
                      <p className="text-xs text-accent">
                        The whole site while it runs
                        {t.sessions_open ? ' · other sessions stay open' : ''}
                      </p>
                    )}
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
                          locksSite: t.locks_site ?? false,
                          sessionsOpen: t.sessions_open ?? false,
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
                          <p className="text-slate-400">
                            {r.games.map(roundGameName).join(', ') || 'No games'}
                          </p>
                          {(r.trivia ?? []).length > 0 && (
                            <p className="text-slate-400">
                              Trivia:{' '}
                              {(r.trivia ?? [])
                                .map((v) => (v.weight === 1 ? v.title : `${v.title} (×${v.weight})`))
                                .join(', ')}
                            </p>
                          )}
                        </div>
                        <div className="flex gap-2">
                          {/* A finished round's dates and games are a record and
                              cannot move. Its trivia still can: a session is
                              usually run before anyone attaches it, and often
                              after the week it belonged to is over. */}
                          <button
                            className={BUTTON}
                            onClick={() =>
                              setRForm({
                                id: r.id,
                                tournament: t.id,
                                from: r.starts_on,
                                until: r.ends_on,
                                games: r.games,
                                sessions: (r.trivia ?? []).map((v) => ({
                                  id: v.session_id,
                                  weight: v.weight,
                                })),
                                started: r.started,
                                finished: state === 'finished',
                              })
                            }
                          >
                            {state === 'finished' ? 'Edit trivia' : 'Edit round'}
                          </button>
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
                    {rForm.finished ? (
                      <p className="text-xs text-amber-200">
                        This round is over. Its dates and its boards are a record
                        now, but its trivia is not: a session is usually run
                        before anybody attaches it, so this is where a quiz night
                        gets counted after the fact.
                      </p>
                    ) : (
                      rForm.started && (
                        <p className="text-xs text-amber-200">
                          This round is under way, so its first day and its games
                          are fixed — the board is being played, and changing
                          either would change it under people. Its end date and
                          its trivia can still move: a session is an event inside
                          the round, not the board everyone started on.
                        </p>
                      )
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
                          disabled={rForm.finished}
                          onChange={(e) => setRForm({ ...rForm, until: e.target.value })}
                        />
                      </label>
                    </div>
                    {!rForm.started && !rForm.finished && (
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
                    <fieldset>
                      <legend className="text-xs text-slate-400 mb-1">
                        Trivia in this round
                      </legend>
                      {sessions.length === 0 ? (
                        <p className="text-xs text-slate-400">
                          No sessions yet. Build one on the Sessions screen and it
                          can count here.
                        </p>
                      ) : (
                        <ul
                          className="space-y-1 max-h-56 overflow-y-auto"
                          aria-label="Trivia in this round"
                        >
                          {sessions.map((v) => {
                            const picked = rForm.sessions.find((x) => x.id === v.id);
                            return (
                              <li
                                key={v.id}
                                className="flex flex-wrap items-center gap-2 rounded-lg bg-white/5 px-2.5 py-1.5"
                              >
                                <label className="flex items-center gap-2 min-w-0 flex-1 text-xs">
                                  <input
                                    type="checkbox"
                                    checked={picked !== undefined}
                                    onChange={() => toggleSession(v.id)}
                                  />
                                  <span className="min-w-0">
                                    <span className="block truncate font-semibold text-slate-200">
                                      {v.title}
                                    </span>
                                    <span className="block text-slate-400">{sessionNote(v)}</span>
                                  </span>
                                </label>
                                {picked !== undefined && (
                                  <label className="flex items-center gap-1.5 text-xs text-slate-400">
                                    Worth
                                    <input
                                      type="number"
                                      className={FIELD + ' w-20 py-1'}
                                      aria-label={`What ${v.title} is worth`}
                                      min={0.5}
                                      max={10}
                                      step={0.5}
                                      value={picked.weight}
                                      onChange={(e) =>
                                        setWeight(v.id, Number(e.target.value))
                                      }
                                    />
                                    ×
                                  </label>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      )}
                      <p className="text-xs text-slate-400 mt-1">
                        At 1× a win in the trivia is the same ten points as a win
                        on any board. Raise it for a session that is the round's
                        event rather than one more thing in it.
                      </p>
                    </fieldset>
                    <div className="flex gap-2">
                      <button
                        className={BUTTON}
                        disabled={
                          busy ||
                          !rForm.from ||
                          !rForm.until ||
                          (rForm.games.length === 0 && rForm.sessions.length === 0)
                        }
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
                        sessions: [],
                        started: false,
                        finished: false,
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
              onClick={() =>
                setTForm({
                  id: null,
                  name: '',
                  difficulty: 'hard',
                  from: '',
                  until: '',
                  locksSite: false,
                  sessionsOpen: false,
                })
              }
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
              <label className="flex items-start gap-2 text-sm text-slate-200">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={tForm.locksSite}
                  onChange={(e) => setTForm({ ...tForm, locksSite: e.target.checked })}
                />
                <span>
                  <span className="font-semibold">Only the tournament is available while it runs</span>
                  <span className="block text-xs text-slate-400 mt-0.5">
                    From its first day to its last: no dailies, no practice, no other
                    games — the tournament page and its rounds&apos; games. Between rounds
                    people see the standings and when the next round starts. Can be
                    switched off at any time.
                  </span>
                </span>
              </label>
              {tForm.locksSite && (
                <label className="flex items-start gap-2 text-sm text-slate-200 ml-6">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={tForm.sessionsOpen}
                    onChange={(e) => setTForm({ ...tForm, sessionsOpen: e.target.checked })}
                  />
                  <span>
                    <span className="font-semibold">Keep other sessions open</span>
                    <span className="block text-xs text-slate-400 mt-0.5">
                      Off, only the trivia attached to the current round can be joined.
                      On, any session can still run — an all-hands, a meeting poll.
                    </span>
                  </span>
                </label>
              )}
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
