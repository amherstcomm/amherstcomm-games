// Finding one person, for an organiser acting on their behalf.
//
// A search, because the alternative is a dropdown of everybody who has ever
// signed in, sorted by nothing anybody remembers. Two characters is the floor
// the server keeps, so typing one letter asks nothing.
//
// Used wherever an organiser does something *for* somebody: entering a contest
// on their behalf, giving them another go in a round. One search, so the two
// cannot drift into finding people differently.
import { useState } from 'react';
import { findEntrants, looksLikeEmail, type Entrant } from '@/contests';

const FIELD =
  'w-full rounded-lg bg-white/5 border border-white/15 px-3 py-2 text-sm text-slate-200 ' +
  'placeholder:text-slate-500 focus:outline-none focus:border-accent';

export default function PersonSearch({
  chosen,
  onChoose,
  label,
  listLabel,
  chosenWord,
  invite = false,
}: {
  chosen: Entrant | null;
  onChoose: (who: Entrant | null) => void;
  /** the question the search answers: "Whose entry is this?" */
  label: string;
  /** what the matches are, for anything reading the page by its parts */
  listLabel: string;
  /** what is said before the chosen name: "For", "Resetting" */
  chosenWord: string;
  /** whether somebody who has never signed in may be chosen by email: an
   *  entry can wait for them, a round reset cannot */
  invite?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<Entrant[]>([]);
  const [newName, setNewName] = useState('');

  async function look(q: string) {
    setQuery(q);
    setFound(await findEntrants(q));
  }

  if (chosen) {
    return (
      <p className="text-xs text-slate-400">
        {chosenWord}{' '}
        <span className="text-slate-200 font-semibold">{chosen.name ?? chosen.email}</span>{' '}
        {chosen.invite && <span>({chosen.email}, not signed in yet) </span>}
        <button
          type="button"
          className="text-accent hover:brightness-110 underline"
          onClick={() => {
            onChoose(null);
            setQuery('');
            setFound([]);
          }}
        >
          change
        </button>
      </p>
    );
  }

  return (
    <div>
      <label className="block text-xs text-slate-400">
        {label}
        <input
          className={FIELD + ' mt-1'}
          value={query}
          placeholder="Name or email"
          onChange={(e) => void look(e.target.value)}
        />
      </label>
      {found.length > 0 && (
        <ul className="mt-1 space-y-0.5" aria-label={listLabel}>
          {found.map((who) => (
            <li key={who.user}>
              <button
                type="button"
                className="w-full text-left rounded-lg px-2 py-1 text-xs text-slate-300 hover:bg-white/10"
                onClick={() => onChoose(who)}
              >
                <span className="font-semibold text-slate-200">{who.name ?? 'No name yet'}</span>{' '}
                <span className="text-slate-400">{who.email}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {query.trim().length >= 2 && found.length === 0 && !(invite && looksLikeEmail(query)) && (
        <p className="text-xs text-slate-400 mt-1">
          {invite
            ? 'Nobody matches that. For somebody who has never signed in, type their whole email address.'
            : 'Nobody matches that. Somebody who has never signed in will not be here yet.'}
        </p>
      )}
      {invite && looksLikeEmail(query) && !found.some((f) => f.email.toLowerCase() === query.trim().toLowerCase()) && (
        <div className="mt-2 space-y-2 rounded-lg border border-white/15 p-2" role="group" aria-label="Somebody not signed in yet">
          <p className="text-xs text-slate-400">
            Nobody has signed in as {query.trim()} yet. The entry can wait for them: it shows the name
            below until they sign in with that address, and then it is theirs.
          </p>
          <label className="block text-xs text-slate-400">
            Their name
            <input
              className={FIELD + ' mt-1'}
              value={newName}
              maxLength={80}
              placeholder="Nora Hire"
              onChange={(e) => setNewName(e.target.value)}
            />
          </label>
          <button
            type="button"
            className="text-xs text-accent hover:brightness-110 underline"
            onClick={() =>
              onChoose({ user: '', email: query.trim().toLowerCase(), name: newName.trim() || null, invite: true })
            }
          >
            Enter it for {newName.trim() || query.trim()}
          </button>
        </div>
      )}
    </div>
  );
}
