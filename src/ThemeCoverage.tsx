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
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { getDifficultyPool } from '@/dictionaries';
import { readCoverage, runsOf, summarise, type CoverageDay } from '@/coverage';
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
  }, [from, until, dictionary]);

  const sum = useMemo(
    () => (result ? summarise(result, dictionary ?? undefined) : null),
    [result, dictionary]
  );

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
