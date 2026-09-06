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
import { getDictionary, getDifficultyPool } from '@/dictionaries';
import { readCoverage, type CoverageDay } from '@/coverage';
import {
  candidatesFor,
  describePin,
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

export default function AdminPins() {
  const [date, setDate] = useState('');
  const [day, setDay] = useState<CoverageDay | null>(null);
  const [pins, setPins] = useState<Pin[]>([]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [dictionary, setDictionary] = useState<string[] | null>(null);
  const [rungs, setRungs] = useState<Set<string> | null>(null);
  // Which difficulty a pin is for. Every one of them is the ordinary answer —
  // "the box on the 8th" usually means all three — so it is the default.
  const [tier, setTier] = useState<string>('');

  useEffect(() => {
    void getDifficultyPool('easy').then(setDictionary);
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
          {PINNABLE.map((game: Pinnable) => {
            const candidates = candidatesFor(day, game, dictionary ?? undefined, rungs ?? undefined);
            const already = pinnedHere.get(`${game} ${tier || 'all'}`);
            return (
              <div key={game}>
                <p className="text-sm font-semibold text-slate-200">{PIN_TITLE[game]}</p>
                {already && (
                  <p className="text-xs text-accent mb-1">
                    Pinned: {describePin(game, already.choice)}{' '}
                    <button
                      className="underline hover:text-slate-200"
                      onClick={() => void unpin(already.id)}
                    >
                      unpin
                    </button>
                  </p>
                )}
                {candidates.length === 0 ? (
                  <p className="text-xs text-slate-500">
                    Nothing that day’s words can make.
                  </p>
                ) : (
                  <ul className="flex flex-wrap gap-1.5 mt-1">
                    {/* A dozen at most: a hundred buttons is not a choice, it is
                        a list. The generator sees all of them; a person picking
                        one wants the ones worth picking. */}
                    {candidates.slice(0, 12).map((candidate) => (
                      <li key={candidate.label}>
                        <button
                          className={BUTTON + ' text-xs'}
                          disabled={busy}
                          onClick={() => void pin(game, candidate.choice)}
                        >
                          {candidate.label}
                          {candidate.tiers && candidate.tiers.length < TIERS.length && (
                            <span className="text-slate-500 ml-1">
                              ({candidate.tiers.join(', ')})
                            </span>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {candidates.length > 12 && (
                  <p className="text-xs text-slate-500 mt-1">
                    and {candidates.length - 12} more the generator can still
                    choose from.
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
