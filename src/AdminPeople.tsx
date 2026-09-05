// Who may do what.
//
// The second half of /admin, and the one that changes who can help during an
// event month: handing somebody games.edit here is the difference between a
// colleague building a round and a colleague asking the one person who can run
// SQL.
//
// Two refusals come from the server and are printed as it worded them — nobody
// hands out more than they hold, and the last administrator cannot be removed.
// The second is stated on the page as well, because it is the one that would
// otherwise look like a bug: the control is there, it is the obvious thing to
// press, and the reason it refuses is about the whole database rather than
// about the row being pressed.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  LADDER,
  ROLE_LABEL,
  ROLE_MEANS,
  findPeople,
  nameOf,
  readPeople,
  setPersonRole,
  type Person,
  type Role,
} from '@/people';

const FIELD =
  'w-full rounded-lg bg-white/5 border border-white/15 px-3 py-2 text-sm text-slate-100 ' +
  'placeholder:text-slate-500 focus:outline-none focus:border-accent';
const SELECT = FIELD + ' w-auto';

/** One person, and what they may do. */
function Row({
  person,
  onChanged,
  note,
}: {
  person: Person;
  onChanged: (user: string, role: Role) => void;
  note: string;
}) {
  const held: Role = person.role ?? 'games.view';
  return (
    <li className="rounded-xl border border-white/15 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-200 truncate">
            {nameOf(person)}
            {person.self && <span className="text-xs text-slate-500 font-normal"> — you</span>}
          </p>
          {/* Under the name rather than instead of it: two people called Dave
              are told apart by the address. */}
          {person.email && person.name && (
            <p className="text-xs text-slate-500 truncate">{person.email}</p>
          )}
          <p className="text-xs text-slate-400 mt-1">{ROLE_MEANS[held]}</p>
        </div>

        <label className="flex flex-col gap-1 text-xs text-slate-400">
          <span className="sr-only">What {nameOf(person)} may do</span>
          <select
            className={SELECT}
            value={held}
            aria-label={`What ${nameOf(person)} may do`}
            onChange={(e) => onChanged(person.user, e.target.value as Role)}
          >
            {LADDER.map((role) => (
              <option key={role} value={role}>
                {ROLE_LABEL[role]}
              </option>
            ))}
          </select>
        </label>
      </div>
      {note && <p className="text-xs text-rose-300 mt-2">{note}</p>}
    </li>
  );
}

export default function AdminPeople() {
  const [people, setPeople] = useState<Person[] | null>(null);
  const [refused, setRefused] = useState('');
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<Person[]>([]);

  const pull = useCallback(async () => {
    const res = await readPeople();
    if (!res.ok) {
      setRefused(res.reason ?? 'Not available');
      setPeople([]);
      return;
    }
    setRefused('');
    setPeople(res.people ?? []);
  }, []);
  useEffect(() => void pull(), [pull]);

  // The search runs while typing, so it is debounced — and the timer is a ref
  // rather than state, because restarting it must not re-render the field
  // somebody is typing into.
  const timer = useRef(0);
  useEffect(() => {
    window.clearTimeout(timer.current);
    if (query.trim().length < 2) {
      setFound([]);
      return;
    }
    timer.current = window.setTimeout(() => {
      void findPeople(query).then(setFound);
    }, 250);
    return () => window.clearTimeout(timer.current);
  }, [query]);

  async function change(user: string, role: Role) {
    const res = await setPersonRole(user, role);
    setNotes((n) => ({ ...n, [user]: res.ok ? '' : (res.reason ?? 'That did not work') }));
    if (res.ok) {
      setQuery('');
      setFound([]);
      await pull();
    }
  }

  if (people === null) return <Loader2 className="w-4 h-4 animate-spin text-slate-500 m-8" />;
  if (refused) return <p className="text-sm text-slate-400">{refused}</p>;

  // Somebody already listed above should not appear twice; the search is for
  // finding people who hold nothing yet.
  const listed = new Set(people.map((p) => p.user));

  return (
    <section>
      <h2 className="text-lg font-bold text-white mb-1">Who may do what</h2>
      <p className="text-sm text-slate-400 mb-4">
        Everybody signed in can play. These are the people who can do more.
      </p>

      <ul className="space-y-3">
        {people.map((person) => (
          <Row
            key={person.user}
            person={person}
            note={notes[person.user] ?? ''}
            onChanged={change}
          />
        ))}
      </ul>

      <h3 className="text-sm font-semibold text-slate-200 mt-6 mb-1">Give somebody else a hand in</h3>
      {/* They exist from their first sign-in and not before: Zitadel makes the
          account, this only says what it may do. Saying so here saves the
          search coming back empty and looking broken. */}
      <p className="text-xs text-slate-400 mb-2">
        Search by name or address. They need to have signed in at least once.
      </p>
      <input
        className={FIELD}
        value={query}
        placeholder="dave"
        aria-label="Search for somebody"
        onChange={(e) => setQuery(e.target.value)}
      />

      {found.filter((p) => !listed.has(p.user)).length > 0 && (
        <ul className="space-y-3 mt-3">
          {found
            .filter((p) => !listed.has(p.user))
            .map((person) => (
              <Row
                key={person.user}
                person={person}
                note={notes[person.user] ?? ''}
                onChanged={change}
              />
            ))}
        </ul>
      )}
      {query.trim().length >= 2 && found.filter((p) => !listed.has(p.user)).length === 0 && (
        <p className="text-xs text-slate-500 mt-2">
          Nobody new by that name. If they have never signed in, there is nothing
          here to find yet.
        </p>
      )}

      <p className="text-xs text-slate-500 mt-6">
        You cannot give away more than you hold, and the last administrator
        cannot be stepped down — appoint another one first, or there would be
        nobody left who could.
      </p>
    </section>
  );
}
