// Every list and theme at once, over a range of days.
//
// The panel beside a list says what that list can make. This says what the
// month will actually be, which is a different question and the one that has
// no answer until they are all written: lists overlap on purpose, so no list
// knows which days it is carrying alone.
//
// It asks the server, which asks the generator's own two functions with the
// generator's own dates. Nothing here re-decides which list covers a day —
// that rule has one home, and a second copy of it would agree until somebody
// changed it and then quietly reassure people about a month that was not
// themed.
import { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { getDictionary, getDifficultyPool } from '@/dictionaries';
import {
  RACK_SIZE,
  readCoverage,
  runsOf,
  summariseSlowly,
  type CoverageDay,
  type Summary,
} from '@/coverage';
import { readWordLists } from '@/wordLists';
import { readWeaveThemes } from '@/weaveThemes';

const FIELD =
  'w-full rounded-lg bg-white/5 border border-white/15 px-3 py-2 text-sm text-slate-100 ' +
  'placeholder:text-slate-500 focus:outline-none focus:border-accent';
const BUTTON =
  'inline-flex items-center justify-center px-3 h-9 rounded-lg text-sm font-semibold ' +
  'bg-white/10 border border-white/15 text-slate-200 hover:bg-white/15 disabled:opacity-50';

const day = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString(undefined, {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
  });
const days = (dates: string[]) => runsOf(dates).map((r) => r.split('–').map(day).join('–'));

export default function ThemeCoverage() {
  const [from, setFrom] = useState('');
  const [until, setUntil] = useState('');
  const [asked, setAsked] = useState<{ from: string; until: string } | null>(null);
  const [result, setResult] = useState<CoverageDay[] | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [dictionary, setDictionary] = useState<string[] | null>(null);
  // The everyday words, which are what a ladder's rungs have to be. A separate
  // list from the one above: boxes are built out of the generation pool and
  // ladders are walked through the tier the board checks against.
  const [rungs, setRungs] = useState<Set<string> | null>(null);
  const [expanded, setExpanded] = useState(false);

  // The dates the lists and themes already carry, so the common case — "check
  // October" — is one click rather than two date fields and a guess at which
  // month somebody meant.
  useEffect(() => {
    void (async () => {
      const [lists, themes] = await Promise.all([readWordLists(), readWeaveThemes()]);
      const starts = [
        ...lists.map((l) => l.daily_from),
        ...(themes.themes ?? []).map((t) => t.starts_on),
      ].filter((d): d is string => !!d);
      const ends = [
        ...lists.map((l) => l.daily_until),
        ...(themes.themes ?? []).map((t) => t.ends_on),
      ].filter((d): d is string => !!d);
      if (starts.length === 0 || ends.length === 0) return;
      setFrom([...starts].sort()[0]);
      setUntil([...ends].sort().at(-1)!);
    })();
  }, []);

  const check = useCallback(async () => {
    setBusy(true);
    setNote('');
    const res = await readCoverage(from, until);
    setBusy(false);
    if (!res.ok) {
      setResult(null);
      setNote(res.reason ?? 'That did not work');
      return;
    }
    setAsked({ from, until });
    setResult(res.days);
    // Only now, and only once: the pool is a fetch, and it is what turns "21
    // boards" into "21 boards a player can finish".
    if (!dictionary) void getDifficultyPool('easy').then(setDictionary);
    if (!rungs) void getDictionary('common').then((words) => setRungs(new Set(words)));
  }, [from, until, dictionary, rungs]);

  // Measured a slice at a time rather than in one go. A month of two
  // overlapping lists is a month of different unions, and working all of them
  // out at once held the page still for seconds — see summariseSlowly. The
  // answer is the same one; what changed is that the browser gets a turn
  // between days, and says how far it has got.
  const [sum, setSum] = useState<Summary | null>(null);
  const [done, setDone] = useState(0);

  useEffect(() => {
    if (!result) {
      setSum(null);
      return;
    }
    let alive = true;
    setDone(0);
    void summariseSlowly(
      result,
      dictionary ?? undefined,
      (n) => {
        if (alive) setDone(n);
      },
      undefined,
      rungs ?? undefined
    ).then((made) => {
      if (alive) setSum(made);
    });
    // A second range asked for while the first is still being measured: the
    // stale one must not land on top of the new one.
    return () => {
      alive = false;
    };
  }, [result, dictionary, rungs]);

  return (
    <section>
      <h2 className="text-lg font-bold text-white mb-1">Coverage</h2>
      <p className="text-sm text-slate-400 mb-4">
        What the lists and Weave themes add up to over a run of days — which are
        themed, with how much, and which fall back to an ordinary puzzle. Asked
        of the same two functions the nightly generator asks.
      </p>

      <div className="flex flex-wrap items-end gap-3 mb-4">
        <label className="flex flex-col gap-1 text-xs text-slate-400">
          From
          {/* Named beyond its visible label: half a dozen other date fields on
              this page are also called "from", and a test that picks the wrong
              one is a test that proves nothing. */}
          <input
            type="date"
            aria-label="Coverage from"
            className={FIELD + ' w-auto'}
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-400">
          Until
          <input
            type="date"
            aria-label="Coverage until"
            className={FIELD + ' w-auto'}
            value={until}
            onChange={(e) => setUntil(e.target.value)}
          />
        </label>
        <button className={BUTTON} disabled={busy || !from || !until} onClick={() => void check()}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Check'}
        </button>
      </div>

      {note && <p className="text-xs text-amber-300 mb-3">{note}</p>}

      {result && !sum && (
        <p className="text-xs text-slate-400 mb-3">
          Measuring {done} of {result.length} days…
        </p>
      )}

      {sum && asked && (
        <div className="rounded-xl border border-white/15 p-4 text-xs space-y-4" data-coverage>
          <div>
            <p className={sum.gaps.length === 0 ? 'text-emerald-300' : 'text-amber-300'}>
              {sum.gaps.length === 0 ? '✓' : '!'} The daily word — {sum.themed} of {sum.days} days
              have a list
            </p>
            {/* A gap is not a failure: the generator makes the day it would
                have made anyway. It is only worth knowing in the month the
                event is in, which is the month somebody is looking at this. */}
            {sum.gaps.length > 0 && (
              <p className="text-slate-400 pl-3">
                unthemed, so an ordinary word: {days(sum.gaps).join(', ')}
              </p>
            )}
          </div>

          {/* Per length, because that is how the generator themes: it draws a
              board for each of ten lengths every day and takes the theme's own
              words *of that length*. A list of sixes themes one board in ten
              and leaves the other nine ordinary, which reads as "the theme
              barely showed up" and has no other symptom. */}
          <div>
            <p className="text-slate-300">Boards themed, by word length</p>
            <ul className="pl-3 space-y-0.5">
              {sum.lengths.map((l) => (
                <li
                  key={l.length}
                  className={l.days === 0 ? 'text-slate-500' : 'text-slate-300'}
                >
                  {l.length} letters —{' '}
                  {l.days === 0
                    ? 'no themed words, ordinary every day'
                    : `${l.days} of ${sum.days} days, drawing from ${l.smallest}`}
                  {/* Fewer words than days means the same answer comes round
                      again, and the draw is per day rather than a rotation, so
                      it can come round the next day. */}
                  {l.days > 0 && l.smallest < l.days && (
                    <span className="text-amber-300"> · will repeat</span>
                  )}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className={sum.weave.gaps.length === 0 ? 'text-emerald-300' : 'text-amber-300'}>
              {sum.weave.gaps.length === 0 ? '✓' : '!'} Weave — {sum.weave.tiling} of {sum.days}{' '}
              days have a theme that tiles a board
            </p>
            <p className="text-slate-400 pl-3">
              {Object.entries(sum.weave.perTier)
                .map(([tier, n]) => `${tier} ${n}`)
                .join(' · ')}{' '}
              — a day none of them tiles gets a curated board, not no board.
            </p>
            {sum.weave.gaps.length > 0 && (
              <p className="text-slate-400 pl-3">curated: {days(sum.weave.gaps).join(', ')}</p>
            )}
          </div>

          <div>
            <p
              className={
                sum.cryptogram.days > 0 ? 'text-emerald-300' : 'text-slate-500'
              }
            >
              {sum.cryptogram.days > 0 ? '✓' : '·'} Cryptogram — {sum.cryptogram.days} of{' '}
              {sum.days} days play a passage of your own
            </p>
            {sum.cryptogram.withPassage > 0 && (
              <p className="text-slate-400 pl-3">
                {Object.entries(sum.cryptogram.perTier)
                  .map(([tier, n]) => `${tier} ${n}`)
                  .join(' · ')}{' '}
                — a difficulty whose length band nothing fits plays a curated
                quotation, which is the same as every other day of the year.
              </p>
            )}
            {/* The failure that looks like success: a passage was written for
                the day and no board can take it, so the day reads as covered
                and is not. */}
            {sum.cryptogram.withPassage > sum.cryptogram.days && (
              <p className="text-amber-300 pl-3">
                {sum.cryptogram.withPassage - sum.cryptogram.days} days have a
                passage no board can take — 35 to 100 letters is the whole range.
              </p>
            )}
          </div>

          {/* The two boards a theme can be built *from* rather than merely
              scored in: a scramble rack is a theme word shuffled, and a hive is
              seeded by one with seven distinct letters. Days without one still
              get the theme's words as bonus points — the board is just the
              language's that day. */}
          <div>
            {/* Null while the rung list is on its way: nought would read as
                "this list can set no ladder", which is a different answer. */}
            <p
              className={
                sum.ladder.days === null
                  ? 'text-slate-500'
                  : sum.ladder.days > 0
                    ? 'text-emerald-300'
                    : 'text-slate-500'
              }
            >
              {sum.ladder.days === null ? '·' : sum.ladder.days > 0 ? '✓' : '·'} Ladder —{' '}
              {sum.ladder.days === null
                ? 'looking for routes…'
                : `${sum.ladder.days} days can set one between two theme words`}
            </p>
            {sum.ladder.days !== null && sum.ladder.days > 0 && (
              <p className="text-slate-400 pl-3">
                {Object.entries(sum.ladder.perTier)
                  .map(([tier, n]) => `${tier} ${n}`)
                  .join(' · ')}{' '}
                — a difficulty with no themed pair in its step count walks the
                curated pairs, as every other day does.
              </p>
            )}
          </div>

          <div>
            <p className={sum.scramble.days > 0 ? 'text-emerald-300' : 'text-slate-500'}>
              {sum.scramble.days > 0 ? '✓' : '·'} Scramble — {sum.scramble.days} days can build
              the rack from a theme word ({RACK_SIZE} letters)
            </p>
            <p className={sum.hive.days > 0 ? 'text-emerald-300' : 'text-slate-500'}>
              {sum.hive.days > 0 ? '✓' : '·'} Hive — {sum.hive.days} days have a theme word of
              seven distinct letters to seed it
            </p>
          </div>

          <div>
            <p className={sum.boxes.days > 0 ? 'text-emerald-300' : 'text-slate-500'}>
              {sum.boxes.days > 0 ? '✓' : '·'} Boxed — {sum.boxes.days} days can make a board
              from two theme words
              {sum.boxes.playable !== null && `, ${sum.boxes.playable} solvable in two ordinary words`}
            </p>
            <p className={sum.bridges.days > 0 ? 'text-emerald-300' : 'text-slate-500'}>
              {sum.bridges.days > 0 ? '✓' : '·'} Bridge — {sum.bridges.days} days have two
              compounds sharing a stem
            </p>
          </div>

          <div>
            <button
              className="text-slate-400 hover:text-slate-200 underline"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? 'Hide the days' : 'Show every day'}
            </button>
            {expanded && (
              <ul className="mt-2 space-y-1 max-h-72 overflow-y-auto pr-2">
                {result!.map((d) => (
                  <li key={d.date} className="flex flex-wrap gap-x-3 text-slate-400">
                    <span className="text-slate-300 w-16 tabular-nums">{day(d.date)}</span>
                    <span>{d.theme ? `${d.theme.name} (${d.theme.words.length})` : 'no list'}</span>
                    <span>
                      {d.weave.length > 0
                        ? `${d.weave.length} weave ${d.weave.length === 1 ? 'theme' : 'themes'}`
                        : 'no weave theme'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
