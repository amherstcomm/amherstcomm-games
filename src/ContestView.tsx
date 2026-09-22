// A contest, for the people in it.
//
// Without an id this is the list of what is running; with one it is the
// contest: what it is, when it closes, everybody's entries, and -- while
// entering is open -- the form for putting yours in or changing it.
//
// The entries are drawn as a gallery because that is what they are. A pumpkin
// is a photograph with a line under it, and a table of titles is the one shape
// that makes the thing being judged the least visible part of the page.
import { useCallback, useEffect, useRef, useState } from 'react';
import Waiting from '@/Waiting';
import {
  castVotes,
  deleteEntry,
  drawable,
  photoLinks,
  readResults,
  PHASE_WORD,
  readContest,
  readContestsOn,
  saveEntry,
  uploadPhoto,
  type Contest,
  type ContestEntry,
  type ContestOn,
  type ContestResults,
} from '@/contests';
import RouteLink from '@/RouteLink';

const FIELD =
  'w-full rounded-lg bg-white/5 border border-white/15 px-3 py-2 text-sm text-slate-200 ' +
  'placeholder:text-slate-500 focus:outline-none focus:border-accent';
const BUTTON =
  'inline-flex items-center justify-center px-3 h-9 rounded-lg text-sm font-semibold ' +
  'bg-white/10 border border-white/15 text-slate-200 hover:bg-white/15 disabled:opacity-50';

const dayWord = (d: string) =>
  new Date(`${d}T12:00:00`).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

/** What is happening to this contest next, in a sentence. The dates are all
 *  on screen anyway; this is the one that matters today. */
function deadline(c: Pick<Contest, 'phase' | 'entries_close_on' | 'votes_open_on' | 'votes_close_on'>) {
  switch (c.phase) {
    case 'soon':
      return null;
    case 'entries':
      return `Entries close ${dayWord(c.entries_close_on)}.`;
    case 'judging':
      return `Voting opens ${dayWord(c.votes_open_on)}.`;
    case 'voting':
      return `Voting closes ${dayWord(c.votes_close_on)}.`;
    case 'over':
      return 'This one has finished.';
  }
}

export default function ContestView({
  contest,
  link,
}: {
  /** which contest, or null for the list */
  contest: string | null;
  link: ContestLink;
}) {
  if (!contest) return <ContestList link={link} />;
  return <OneContest id={contest} />;
}

/** How this page addresses another one: the app's own page link, narrowed to
 *  the one route this page ever points at. */
export type ContestLink = (p: { kind: 'contest'; contest: string | null }) => {
  to: string;
  onGo: () => void;
};

function ContestList({ link }: { link: ContestLink }) {
  const [rows, setRows] = useState<ContestOn[] | null>(null);
  useEffect(() => {
    void readContestsOn().then(setRows);
  }, []);

  if (!rows) return <Waiting what="contests" />;
  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-xl font-semibold text-slate-200">Contests</h1>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-400 mt-3">
          Nothing is running just now. A contest shows up here while it is taking entries and
          while people are voting.
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {rows.map((c) => (
            <li key={c.id}>
              <RouteLink
                {...link({ kind: 'contest', contest: c.id })}
                className="block rounded-xl border border-white/15 bg-white/5 px-4 py-3 hover:bg-white/10"
              >
                <span className="flex items-center justify-between gap-3">
                  <span className="font-semibold text-slate-200">{c.name}</span>
                  <span className="text-xs text-slate-400">{PHASE_WORD[c.phase]}</span>
                </span>
                <span className="block text-xs text-slate-400 mt-1">
                  {c.entries} {c.entries === 1 ? 'entry' : 'entries'} · {deadline(c)}
                </span>
              </RouteLink>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function OneContest({ id }: { id: string }) {
  const [contest, setContest] = useState<Contest | null>(null);
  const [entries, setEntries] = useState<ContestEntry[] | null>(null);
  const [links, setLinks] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<string | null>(null);
  // The ballot being built, best first. Entry ids, because that is what the
  // server takes and what an ordering has to be keyed by -- a list of titles
  // would break the moment two people called theirs the same thing.
  const [ballot, setBallot] = useState<string[]>([]);
  const [results, setResults] = useState<ContestResults | null>(null);

  const load = useCallback(async () => {
    const got = await readContest(id);
    if (!got.ok || !got.contest) {
      setProblem(got.reason ?? 'that contest is not here');
      return;
    }
    setProblem(null);
    setContest(got.contest);
    setEntries(got.entries ?? []);
    setBallot(got.my_votes ?? []);
    const paths = (got.entries ?? []).map((e) => e.image_path).filter((p): p is string => !!p);
    setLinks(await photoLinks(paths));

    // The result is a separate ask because the server decides who may see it
    // and when -- nothing while voting is open, except for an organiser
    // writing the announcement, who is told it is not final.
    const phase = got.contest?.phase;
    setResults(phase === 'voting' || phase === 'over' ? await readResults(id) : null);
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (problem) return <p className="max-w-2xl mx-auto px-4 py-10 text-sm text-slate-400">{problem}</p>;
  if (!contest || !entries) return <Waiting what="the contest" />;

  const mine = entries.find((e) => e.mine) ?? null;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-xl font-semibold text-slate-200">{contest.name}</h1>
      <p className="text-xs text-slate-400 mt-1">
        {PHASE_WORD[contest.phase]}
        {deadline(contest) ? ` · ${deadline(contest)}` : ''}
      </p>
      {contest.blurb && <p className="text-sm text-slate-300 mt-3 whitespace-pre-line">{contest.blurb}</p>}
      {contest.prize && (
        <p className="text-sm text-amber-300 mt-2">
          <span className="text-slate-400">On offer:</span> {contest.prize}
        </p>
      )}
      {/* Said once, at the top, rather than on every tile: whether the names
          are on the entries changes how somebody writes theirs. */}
      {!contest.entrants_shown && (
        <p className="text-xs text-slate-400 mt-2">
          Entries are shown without names — nobody sees whose is whose.
        </p>
      )}

      {contest.may_enter && (
        <EntryForm contest={contest} mine={mine} link={links[mine?.image_path ?? '']} onSaved={load} />
      )}
      {contest.may_vote && (
        <Ballot
          contest={contest}
          entries={entries}
          ballot={ballot}
          setBallot={setBallot}
          onCast={load}
        />
      )}
      {results?.ok && <Results contest={contest} results={results} />}
      {!contest.may_enter && contest.phase === 'entries' && contest.who_enters === 'admins' && (
        <p className="text-sm text-slate-400 mt-4">
          An organiser is entering these on everyone&apos;s behalf — send them your photo.
        </p>
      )}

      <h2 className="text-sm font-semibold text-slate-200 mt-8">
        {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
      </h2>
      {entries.length === 0 ? (
        <p className="text-sm text-slate-400 mt-2">Nothing has been entered yet.</p>
      ) : (
        <ul className="mt-3 grid gap-4 sm:grid-cols-2">
          {entries.map((e, i) => (
            <li key={e.id} className="rounded-xl border border-white/15 bg-white/5 overflow-hidden">
              {e.image_path && drawable(links[e.image_path]) ? (
                <img
                  src={drawable(links[e.image_path])}
                  alt={e.title}
                  loading="lazy"
                  className="w-full aspect-[4/3] object-cover bg-white/5"
                />
              ) : (
                <div className="w-full aspect-[4/3] grid place-items-center bg-white/5 text-xs text-slate-400">
                  No photo yet
                </div>
              )}
              <div className="px-3 py-2">
                <p className="font-semibold text-slate-200 text-sm">{e.title}</p>
                {/* A name where the contest names entrants, and a number where
                    it does not -- "Entry 3" is how somebody refers to one out
                    loud when there is nothing else to call it. */}
                <p className="text-xs text-slate-400">
                  {contest.entrants_shown ? (e.entrant ?? 'Entered by an organiser') : `Entry ${i + 1}`}
                  {e.mine && <span className="text-accent"> · yours</span>}
                  {ballot.includes(e.id) && (
                    <span className="text-accent"> · your {ordinal(ballot.indexOf(e.id) + 1)} pick</span>
                  )}
                </p>
                {e.blurb && <p className="text-sm text-slate-300 mt-1 whitespace-pre-line">{e.blurb}</p>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** 1st, 2nd, 3rd. Only ever needed up to fifth, which is what a contest may
 *  rank at most, so the table is the whole answer rather than the easy half of
 *  a rule with exceptions at 11, 12 and 13. */
const ORDINALS = ['1st', '2nd', '3rd', '4th', '5th'];
const ordinal = (n: number) => ORDINALS[n - 1] ?? `${n}th`;

/**
 * The ballot: rank a few favourites.
 *
 * Clicking an entry adds it to the end of your picks; clicking it again takes
 * it out and closes the gap. That is the whole interaction -- no drag, no
 * dropdown per place. A contest is voted on once, on a phone, by people who
 * are not going to read instructions, and "tap them in the order you like
 * them" is the only rule that survives that.
 *
 * Nothing is sent until they say so. A ballot that saved on every tap would
 * mean the half-finished orderings on the way to the real one were each, for a
 * moment, somebody's vote.
 */
function Ballot({
  contest,
  entries,
  ballot,
  setBallot,
  onCast,
}: {
  contest: Contest;
  entries: ContestEntry[];
  ballot: string[];
  setBallot: (b: string[]) => void;
  onCast: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);

  // Your own is not on the ballot at all, rather than on it and refused: the
  // server turns it away either way, and offering it is offering a mistake.
  const choices = entries.filter((e) => !e.mine);

  function toggle(entry: string) {
    setSaid(null);
    if (ballot.includes(entry)) {
      setBallot(ballot.filter((x) => x !== entry));
      return;
    }
    if (ballot.length >= contest.picks) {
      setSaid(`This one ranks ${contest.picks}. Take one out to add another.`);
      return;
    }
    setBallot([...ballot, entry]);
  }

  async function send(picks: string[]) {
    setBusy(true);
    const got = await castVotes(contest.id, picks);
    setBusy(false);
    if (!got.ok) {
      setSaid(got.reason ?? 'that ballot would not go through');
      return;
    }
    setSaid(picks.length === 0 ? 'Your ballot has been taken back.' : 'Your ballot is in.');
    await onCast();
  }

  return (
    <section className="mt-6 rounded-xl border border-white/15 bg-white/5 p-4">
      <h2 className="text-sm font-semibold text-slate-200">Vote</h2>
      <p className="text-xs text-slate-400 mt-1">
        Tap up to {contest.picks} in the order you like them. Your first pick is worth{' '}
        {contest.picks}, your last worth 1. You can change your mind until voting closes.
      </p>
      {choices.length === 0 ? (
        <p className="text-sm text-slate-400 mt-3">
          There is nothing here to vote for but your own.
        </p>
      ) : (
        <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="The entries you can rank">
          {choices.map((e) => {
            const at = ballot.indexOf(e.id);
            return (
              <li key={e.id}>
                <button
                  type="button"
                  aria-pressed={at >= 0}
                  onClick={() => toggle(e.id)}
                  className={`px-2.5 h-8 rounded-lg text-xs font-semibold border transition-colors ${
                    at >= 0
                      ? 'bg-accent/20 border-accent text-slate-200'
                      : 'bg-white/5 border-white/15 text-slate-300 hover:bg-white/10'
                  }`}
                >
                  {/* The space is markup, not styling: without it the button
                      reads as "1stBeta" to anything that flattens the
                      element to text, a screen reader included. */}
                  {at >= 0 && <span className="text-accent">{ordinal(at + 1)}</span>}
                  {at >= 0 && ' '}
                  {e.title}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {/* The chips stay in entry order -- a list that reordered itself under
          a thumb mid-vote would be unusable -- so the ordering is said here
          instead, which is the thing being decided. */}
      {ballot.length > 0 && (
        <p className="text-xs text-slate-400 mt-2">
          Your picks:{' '}
          {ballot
            .map((id, i) => `${ordinal(i + 1)} ${entries.find((e) => e.id === id)?.title ?? ''}`)
            .join(', ')}
        </p>
      )}
      <div className="flex items-center gap-2 mt-3">
        <button
          type="button"
          className={BUTTON}
          disabled={busy || ballot.length === 0}
          onClick={() => void send(ballot)}
        >
          Cast my ballot
        </button>
        <button
          type="button"
          className={BUTTON}
          disabled={busy}
          onClick={() => {
            setBallot([]);
            void send([]);
          }}
        >
          Take mine back
        </button>
      </div>
      {said && (
        <p className="text-xs text-slate-400 mt-2" role="status">
          {said}
        </p>
      )}
    </section>
  );
}

/**
 * The result.
 *
 * Whether this is the final word is the server's to say, and it says so --
 * an organiser reading it during voting is looking at a running total, and a
 * number read off this screen must never be mistaken for the one that gets
 * announced.
 */
function Results({ contest, results }: { contest: Contest; results: ContestResults }) {
  const table = results.table ?? [];
  return (
    <section className="mt-6 rounded-xl border border-white/15 bg-white/5 p-4">
      <h2 className="text-sm font-semibold text-slate-200">
        {results.final ? 'Result' : 'How it stands'}
      </h2>
      <p className="text-xs text-slate-400 mt-1">
        {results.voters ?? 0} {results.voters === 1 ? 'person has' : 'people have'} voted
        {results.final ? '.' : ' so far — voting is still open, so this is not the result yet.'}
      </p>
      {table.length === 0 ? (
        <p className="text-sm text-slate-400 mt-3">Nobody has voted on this one.</p>
      ) : (
        <ol className="mt-3 space-y-1">
          {table.map((r) => (
            <li key={r.entry_id} className="flex items-baseline gap-2 text-sm">
              <span className="text-slate-400 tabular-nums w-8 shrink-0">{ordinal(r.place)}</span>
              <span className="font-semibold text-slate-200">{r.title}</span>
              {contest.entrants_shown && r.entrant && (
                <span className="text-xs text-slate-400">{r.entrant}</span>
              )}
              <span className="ml-auto text-xs text-slate-400 tabular-nums">
                {r.points} {r.points === 1 ? 'point' : 'points'}
                {r.firsts > 0 && ` · ${r.firsts} first`}
                {r.firsts > 1 && 's'}
              </span>
            </li>
          ))}
        </ol>
      )}
      {/* Only where the contest was set up to show it, which the server
          enforces -- this draws what came back rather than deciding. */}
      {results.ballots && results.ballots.length > 0 && (
        <div className="mt-4">
          <h3 className="text-xs font-semibold text-slate-300">Who voted for what</h3>
          <ul className="mt-1 space-y-0.5">
            {results.ballots.map((b) => (
              <li key={b.voter} className="text-xs text-slate-400">
                <span className="text-slate-300">{b.voter}</span>: {b.picks.join(', ')}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/**
 * Putting yours in, or changing it.
 *
 * One form whether or not there is already an entry, because "change mine" and
 * "enter" are the same three fields and a separate edit screen is a second
 * place for the same bug. The photograph goes up on its own, before the row is
 * saved: an upload is the slow part and the writing should not be held hostage
 * to it -- and an entry with words and no picture is a legal state right up
 * until entries close.
 */
function EntryForm({
  contest,
  mine,
  link,
  onSaved,
}: {
  contest: Contest;
  mine: ContestEntry | null;
  link?: string;
  onSaved: () => Promise<void>;
}) {
  const [title, setTitle] = useState(mine?.title ?? '');
  const [blurb, setBlurb] = useState(mine?.blurb ?? '');
  const [path, setPath] = useState<string | null>(mine?.image_path ?? null);
  // The photo just uploaded, as a signed link -- not as the local file.
  //
  // The file is already in the bucket by the time there is anything to draw,
  // so drawing it from the browser's copy was a second source of truth with a
  // lifetime to manage: an object URL is a live handle, and it had to be
  // revoked on every replacement and again on unmount or it pinned the file in
  // memory for the life of the tab. Asking storage for a link costs one round
  // trip and means the person sees exactly what everybody else will see --
  // including whether the upload actually worked, which the local copy could
  // never tell them.
  const [shot, setShot] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);

  async function pick(f: File | undefined) {
    if (!f) return;
    setBusy('Sending the photo…');
    setSaid(null);
    const got = await uploadPhoto(f);
    setBusy(null);
    if (!got.ok) {
      setSaid(got.reason ?? 'that photo would not go up');
      return;
    }
    setPath(got.path ?? null);
    // Drawn back from the bucket. A link that does not come back leaves the
    // tile empty rather than failing the upload -- the photo is stored either
    // way, and the entry will show it on the next load.
    const signed = got.path ? (await photoLinks([got.path]))[got.path] : undefined;
    setShot(signed ?? null);
    setSaid('Photo ready — save the entry to keep it.');
  }

  async function save() {
    setBusy('Saving…');
    const got = await saveEntry({
      contest: contest.id,
      id: mine?.id ?? null,
      title,
      blurb,
      imagePath: path,
    });
    setBusy(null);
    if (!got.ok) {
      setSaid(got.reason ?? 'that would not save');
      return;
    }
    setSaid('Saved.');
    await onSaved();
  }

  async function remove() {
    if (!mine) return;
    setBusy('Removing…');
    const got = await deleteEntry(mine.id);
    setBusy(null);
    if (!got.ok) {
      setSaid(got.reason ?? 'that would not come out');
      return;
    }
    setTitle('');
    setBlurb('');
    setPath(null);
    setShot(null);
    await onSaved();
  }

  const shown = drawable(shot ?? link);

  return (
    <section className="mt-6 rounded-xl border border-white/15 bg-white/5 p-4">
      <h2 className="text-sm font-semibold text-slate-200">{mine ? 'Your entry' : 'Enter'}</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-[12rem_1fr]">
        <div>
          {shown ? (
            <img src={shown} alt="Your entry" className="w-full aspect-[4/3] object-cover rounded-lg bg-white/5" />
          ) : (
            <div className="w-full aspect-[4/3] grid place-items-center rounded-lg bg-white/5 text-xs text-slate-400">
              No photo yet
            </div>
          )}
          <input
            ref={file}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            className="sr-only"
            aria-label="A photo of your entry"
            onChange={(e) => void pick(e.target.files?.[0])}
          />
          <button type="button" className={BUTTON + ' mt-2 w-full'} onClick={() => file.current?.click()}>
            {shown ? 'Different photo' : 'Add a photo'}
          </button>
        </div>
        <div className="space-y-2">
          <label className="block text-xs text-slate-400">
            What it is called
            <input
              className={FIELD + ' mt-1'}
              value={title}
              maxLength={80}
              placeholder="Jack the Ripper"
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label className="block text-xs text-slate-400">
            A few words about it
            <textarea
              className={FIELD + ' mt-1'}
              rows={4}
              maxLength={1000}
              value={blurb}
              placeholder="Carved with a butter knife at eleven at night."
              onChange={(e) => setBlurb(e.target.value)}
            />
          </label>
          <div className="flex items-center gap-2">
            <button type="button" className={BUTTON} disabled={!!busy || !title.trim()} onClick={() => void save()}>
              {mine ? 'Save changes' : 'Enter'}
            </button>
            {mine && (
              <button type="button" className={BUTTON} disabled={!!busy} onClick={() => void remove()}>
                Take it out
              </button>
            )}
          </div>
        </div>
      </div>
      {(busy || said) && (
        <p className="text-xs text-slate-400 mt-2" role="status">
          {busy ?? said}
        </p>
      )}
    </section>
  );
}
