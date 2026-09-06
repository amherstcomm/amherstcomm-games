// What a themed day accepts as a word.
//
// A themed day ships the list's own words and the boards take them alongside
// the dictionary. That is one of three things a deployment might want, and it
// is a decision about the *day* rather than about a list: several lists can
// cover one day, so a list cannot answer it.
//
// Per game as well, because the answer is not the same for all of them. "Only
// our words" is a fine letter box — measured on a 66-word list, 101 boards can
// be solved by the theme alone — and an unplayable hive, where the seven
// letters would leave a handful of findable words.
//
// The ladder takes no rule at all, and is said so on the page rather than
// offered and refused: its par is the shortest route through the words a player
// may use, so narrowing them changes the answer instead of the difficulty.
import { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { ALL_SLUGS, SLUG_NAME, type Slug } from '@/games';
import {
  deleteWordPolicy,
  POLICIES,
  POLICY_MEANS,
  readWordPolicies,
  saveWordPolicy,
  type Policy,
  type WordPolicy,
} from '@/wordPolicies';

const FIELD =
  'w-full rounded-lg bg-white/5 border border-white/15 px-3 py-2 text-sm text-slate-200 ' +
  'placeholder:text-slate-500 focus:outline-none focus:border-accent';
const BUTTON =
  'inline-flex items-center justify-center px-3 h-9 rounded-lg text-sm font-semibold ' +
  'bg-white/10 border border-white/15 text-slate-200 hover:bg-white/15 disabled:opacity-50';

/** The games a rule can name: everything that takes words from a list, and not
 *  the ladder. Squares, cryptogram and bridge are absent because a word list
 *  never reaches them — a rule naming one would be a rule about nothing. */
const GAMES = ALL_SLUGS.filter((slug) =>
  ['guess', 'scramble', 'hive', 'grid', 'boxed'].includes(slug)
);

export default function AdminWordPolicies() {
  const [policies, setPolicies] = useState<WordPolicy[] | null>(null);
  const [refused, setRefused] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [game, setGame] = useState('');
  const [policy, setPolicy] = useState<Policy>('both');
  const [from, setFrom] = useState('');
  const [until, setUntil] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const pull = useCallback(async () => {
    const res = await readWordPolicies();
    if (!res.ok) {
      setRefused(res.reason ?? 'Not available');
      setPolicies([]);
      return;
    }
    setRefused('');
    setPolicies(res.policies);
  }, []);
  useEffect(() => void pull(), [pull]);

  function startNew() {
    setEditing('new');
    setGame('');
    setPolicy('both');
    setFrom('');
    setUntil('');
    setNote('');
  }

  function open(rule: WordPolicy) {
    setEditing(rule.id);
    setGame(rule.game ?? '');
    setPolicy(rule.policy);
    setFrom(rule.starts_on);
    setUntil(rule.ends_on);
    setNote('');
  }

  async function save() {
    setBusy(true);
    const res = await saveWordPolicy({
      id: editing === 'new' ? null : editing,
      game: game || null,
      policy,
      from,
      until,
    });
    setBusy(false);
    if (!res.ok) {
      setNote(res.reason ?? 'That did not work');
      return;
    }
    setNote('Saved.');
    setEditing(null);
    await pull();
  }

  async function remove(rule: WordPolicy) {
    if (!window.confirm('Delete this rule? Those days go back to accepting both.')) return;
    const res = await deleteWordPolicy(rule.id);
    if (!res.ok) setNote(res.reason ?? 'That did not work');
    await pull();
  }

  return (
    <section>
      <h2 className="text-lg font-bold text-white mb-1">What a themed day accepts</h2>
      <p className="text-sm text-slate-400 mb-4">
        On a day a word list covers, the boards take the dictionary and the
        list’s own words. A rule here changes that for a run of days — for every
        game, or for one. Days with no rule accept both, which is what a themed
        day has always done.
      </p>

      {policies === null && <Loader2 className="w-4 h-4 animate-spin text-slate-500" />}
      {refused && <p className="text-sm text-rose-300">{refused}</p>}

      {policies !== null && !refused && (
        <>
          {policies.length > 0 && (
            <ul className="space-y-2 mb-4">
              {policies.map((rule) => (
                <li
                  key={rule.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/15 p-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-200">
                      {rule.game ? (SLUG_NAME[rule.game as Slug] ?? rule.game) : 'Every game'}{' '}
                      — {rule.policy}
                    </p>
                    <p className="text-xs text-slate-400">{POLICY_MEANS[rule.policy]}</p>
                    <p className="text-xs text-accent">
                      {rule.starts_on === rule.ends_on
                        ? `On ${rule.starts_on}`
                        : `${rule.starts_on} to ${rule.ends_on}`}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button className={BUTTON} onClick={() => open(rule)}>
                      Edit
                    </button>
                    <button className={BUTTON} onClick={() => void remove(rule)}>
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {editing === null ? (
            <button className={BUTTON} onClick={startNew}>
              New rule
            </button>
          ) : (
            <div className="rounded-xl border border-white/15 p-4 space-y-3">
              <label className="block">
                <span className="text-sm font-semibold text-slate-200">Which game</span>
                <span className="block text-xs text-slate-400 mt-0.5 mb-1">
                  A game named beats the day’s default. The ladder cannot take a
                  rule: its par is the shortest route through the words a player
                  may use, so narrowing them changes the answer rather than the
                  difficulty.
                </span>
                <select
                  className={FIELD}
                  aria-label="Which game"
                  value={game}
                  onChange={(e) => setGame(e.target.value)}
                >
                  <option value="">Every game (the day’s default)</option>
                  {GAMES.map((slug) => (
                    <option key={slug} value={slug}>
                      {SLUG_NAME[slug]}
                    </option>
                  ))}
                </select>
              </label>

              <fieldset>
                <legend className="text-sm font-semibold text-slate-200 mb-1">
                  What it accepts
                </legend>
                <div className="space-y-1">
                  {POLICIES.map((option) => (
                    <label key={option} className="flex items-start gap-2 text-sm text-slate-300">
                      {/* Labelled by the answer alone. Without it the
                          accessible name swallows the explanation, and
                          "dictionary — as though nothing were themed" reads as
                          a second "themed" to anything picking one by name. */}
                      <input
                        type="radio"
                        name="policy"
                        aria-label={option}
                        className="mt-1"
                        checked={policy === option}
                        onChange={() => setPolicy(option)}
                      />
                      <span>
                        <span className="font-semibold">{option}</span>
                        <span className="block text-xs text-slate-400">
                          {POLICY_MEANS[option]}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <div className="flex flex-wrap gap-3">
                <label className="flex flex-col gap-1 text-xs text-slate-400">
                  From
                  <input
                    type="date"
                    aria-label="Rule from"
                    className={FIELD + ' w-auto'}
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-slate-400">
                  Until
                  <input
                    type="date"
                    aria-label="Rule until"
                    className={FIELD + ' w-auto'}
                    value={until}
                    onChange={(e) => setUntil(e.target.value)}
                  />
                </label>
              </div>

              <p className="text-xs text-slate-500">
                Puzzles are generated a fortnight ahead, so set these at least
                two weeks before the first day. A themed-only board is often a
                thin one — twenty of your words rather than forty thousand of
                the language’s — and that is the nature of it rather than a
                fault; the nightly run prints how many words each board was left
                with. The one thing that cannot stand is a board with nothing
                playable on it at all, and that game keeps both.
              </p>

              <div className="flex flex-wrap items-center gap-2">
                <button className={BUTTON} disabled={busy} onClick={() => void save()}>
                  {busy ? 'Saving…' : 'Save rule'}
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
