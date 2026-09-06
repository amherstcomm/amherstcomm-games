// Choosing a day's puzzles rather than letting the day choose them.
//
// A themed day has far more candidates than it can use — a word list makes
// thousands of boxes and a dozen racks — and the generator picks against the
// day's seed. That is right for a month nobody is watching and wrong for the
// morning of the meeting, when somebody wants the box made of OWNERSHIP and
// INVESTED and not whichever one the seed landed on.
//
// So: pick a date, see what that day could be, pin one. What is pinned is the
// *seed* — the words, the pangram — and the generator builds from it exactly as
// it builds its own choice, which is why nothing here has to know what a board
// looks like. A pin it can no longer build is passed over with a line in the
// nightly log rather than published broken.
//
// The candidates are worked out in the browser from the day's own words, which
// the coverage call already carries. Two of those searches are the shared ones
// (the box and the ladder), asserted against the generator's own by
// tests/unit/themeCalculators.test.ts.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { getDictionary } from '@/dictionaries';
import { readCoverage, type CoverageDay } from '@/coverage';
import {
  candidatesFor,
  describePin,
  type Candidate,
  pinPuzzle,
  PIN_TITLE,
  PINNABLE,
  readPins,
  unpinPuzzle,
  type Pin,
  type Pinnable,
} from '@/pins';

const FIELD =
  'w-full rounded-lg bg-white/5 border border-white/15 px-3 py-2 text-sm text-slate-100 ' +
  'placeholder:text-slate-500 focus:outline-none focus:border-accent';
const BUTTON =
  'inline-flex items-center justify-center px-3 h-9 rounded-lg text-sm font-semibold ' +
  'bg-white/10 border border-white/15 text-slate-200 hover:bg-white/15 disabled:opacity-50';

const TIERS = ['easy', 'hard', 'extreme'];
/** How many candidates a list shows before the rest go behind a button. Twelve
 *  is about a screen of them; the searches themselves hand back far more. */
const PAGE = 12;

/** One game's candidates: a filter, a page of buttons, and the rest behind a
 *  button of its own.
 *
 *  Its own filter rather than one for the page, because the lists have nothing
 *  to do with each other — typing `ing` to find VESTING in the rack list should
 *  not also hide every box. And its own `more` for the same reason: a day's
 *  boxes run to thousands and its pangrams to three.
 */
function Shortlist({
  game,
  candidates,
  refine,
  pinned,
  busy,
  onPin,
  onUnpin,
}: {
  game: Pinnable;
  candidates: Candidate[];
  /** re-run the search for the words typed, where the list is bigger than a
   *  search will enumerate */
  refine?: (terms: string[]) => Candidate[];
  pinned?: Pin;
  busy: boolean;
  onPin: (choice: Record<string, unknown>) => void;
  onUnpin: (id: string) => void;
}) {
  const [filter, setFilter] = useState('');
  const [showing, setShowing] = useState(PAGE);

  // Every word of the filter has to appear somewhere in the label, in any
  // order: `vot shar` finds the box made of voting and shared without anybody
  // having to remember which way round the page prints them.
  const matching = useMemo(() => {
    const terms = filter.toLowerCase().split(/\s+/).filter(Boolean);
    if (terms.length === 0) return candidates;
    // Where the list is searched rather than merely listed — the box, whose
    // boards run to thousands — the filter goes into the search. Filtering a
    // bounded result set afterwards hides boards that exist, which is exactly
    // what happened.
    const searched = refine ? refine(terms) : candidates;
    return searched.filter((candidate) => {
      const label = candidate.label.toLowerCase();
      return terms.every((term) => label.includes(term));
    });
  }, [candidates, filter, refine]);

  // A filter that has narrowed things is a filter somebody is reading all of,
  // so the page grows back to a page when it changes.
  useEffect(() => setShowing(PAGE), [filter]);

  return (
    // Named in the markup because the lists are otherwise indistinguishable to
    // anything reading the page: three of them can show a `more` button at
    // once, and a test clicking "the first one" clicks the wrong list.
    <div data-shortlist={game}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-semibold text-slate-200">{PIN_TITLE[game]}</p>
        {candidates.length > PAGE && (
          <input
            type="search"
            aria-label={`Filter ${PIN_TITLE[game]}`}
            placeholder={`Filter ${candidates.length}…`}
            className={FIELD + ' w-auto py-1 text-xs'}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        )}
      </div>

      {pinned && (
        <p className="text-xs text-accent mb-1">
          Pinned: {describePin(game, pinned.choice)}{' '}
          <button className="underline hover:text-slate-200" onClick={() => onUnpin(pinned.id)}>
            unpin
          </button>
        </p>
      )}

      {candidates.length === 0 ? (
        <p className="text-xs text-slate-500">Nothing that day’s words can make.</p>
      ) : matching.length === 0 ? (
        <p className="text-xs text-slate-500">
          Nothing here matches “{filter}”. {candidates.length} without it.
        </p>
      ) : (
        <ul className="flex flex-wrap gap-1.5 mt-1">
          {matching.slice(0, showing).map((candidate) => (
            <li key={candidate.label}>
              <button
                className={BUTTON + ' text-xs'}
                disabled={busy}
                onClick={() => onPin(candidate.choice)}
              >
                {candidate.label}
                {candidate.tiers && candidate.tiers.length < TIERS.length && (
                  <span className="text-slate-500 ml-1">({candidate.tiers.join(', ')})</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      {matching.length > showing && (
        <button
          className="text-xs text-slate-400 hover:text-slate-200 underline mt-1"
          onClick={() => setShowing((n) => n + PAGE)}
        >
          {matching.length - showing} more
        </button>
      )}
    </div>
  );
}

export default function AdminPins() {
  const [date, setDate] = useState('');
  const [day, setDay] = useState<CoverageDay | null>(null);
  const [pins, setPins] = useState<Pin[]>([]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  // The rungs a ladder is walked through. The box search needs no dictionary:
  // its answer is the chain the board was built from.
  const [rungs, setRungs] = useState<Set<string> | null>(null);
  // Which difficulty a pin is for. Every one of them is the ordinary answer —
  // "the box on the 8th" usually means all three — so it is the default.
  const [tier, setTier] = useState<string>('');

  useEffect(() => {
    void getDictionary('common').then((words) => setRungs(new Set(words)));
  }, []);

  const look = useCallback(async () => {
    if (!date) return;
    setBusy(true);
    setNote('');
    // One day, both ends the same: the shortlists are per day, and a month of
    // them at once is a page nobody reads.
    const [coverage, pinned] = await Promise.all([readCoverage(date, date), readPins(date, date)]);
    setBusy(false);
    if (!coverage.ok) {
      setNote(coverage.reason ?? 'That did not work');
      setDay(null);
      return;
    }
    setDay(coverage.days[0] ?? null);
    setPins(pinned.pins);
  }, [date]);

  // Worked out once per day rather than once per render: the box search alone
  // is three milliseconds a board, and pinning one re-renders the page.
  const shortlists = useMemo(
    () =>
      day
        ? Object.fromEntries(
            PINNABLE.map((game) => [game, candidatesFor(day, game, rungs ?? undefined)])
          )
        : {},
    [day, rungs]
  ) as Record<Pinnable, Candidate[]>;

  const pinnedHere = useMemo(() => {
    const at = new Map<string, Pin>();
    for (const pin of pins) at.set(`${pin.game} ${pin.difficulty ?? 'all'}`, pin);
    return at;
  }, [pins]);

  async function pin(game: string, choice: Record<string, unknown>) {
    setBusy(true);
    const res = await pinPuzzle({ date, game, difficulty: tier || null, choice });
    setBusy(false);
    if (!res.ok) {
      setNote(res.reason ?? 'That did not work');
      return;
    }
    // After, not before: `look` clears the note when it re-reads the day, so
    // saying it first said it to nobody.
    await look();
    setNote('Pinned.');
  }

  async function unpin(id: string) {
    const res = await unpinPuzzle(id);
    if (!res.ok) setNote(res.reason ?? 'That did not work');
    await look();
  }

  return (
    <section>
      <h2 className="text-lg font-bold text-white mb-1">Choosing a day’s puzzles</h2>
      <p className="text-sm text-slate-400 mb-4">
        A themed day has more candidates than it can use, and picks one against
        the day’s seed. Pin the one you want instead. Days you leave alone are
        dealt as usual, and a pin the generator can no longer build — a word
        left the list, a box lost its answer — falls back with a line in the
        nightly log.
      </p>

      <div className="flex flex-wrap items-end gap-3 mb-4">
        <label className="flex flex-col gap-1 text-xs text-slate-400">
          Date
          <input
            type="date"
            aria-label="Pin date"
            className={FIELD + ' w-auto'}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-400">
          Difficulty
          <select
            aria-label="Pin difficulty"
            className={FIELD + ' w-auto'}
            value={tier}
            onChange={(e) => setTier(e.target.value)}
          >
            <option value="">Every difficulty</option>
            {TIERS.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <button className={BUTTON} disabled={busy || !date} onClick={() => void look()}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Look'}
        </button>
      </div>

      {note && <p className="text-xs text-slate-400 mb-3">{note}</p>}

      {day && !day.theme && (day.weave ?? []).length === 0 && (
        <p className="text-sm text-amber-300">
          Nothing themes that day, so there is nothing to choose between — it
          gets the puzzles the site would have made anyway.
        </p>
      )}

      {day && (
        <div className="space-y-6" data-pins>
          {PINNABLE.map((game: Pinnable) => (
            <Shortlist
              key={game}
              game={game}
              candidates={shortlists[game] ?? []}
              refine={
                game === 'boxed' && day
                  ? (terms) => candidatesFor(day, 'boxed', rungs ?? undefined, terms)
                  : undefined
              }
              pinned={pinnedHere.get(`${game} ${tier || 'all'}`)}
              busy={busy}
              onPin={(choice) => void pin(game, choice)}
              onUnpin={(id) => void unpin(id)}
            />
          ))}
        </div>
      )}

    </section>
  );
}
