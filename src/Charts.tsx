// What the room said, drawn.
//
// Three shapes, because three is what the questions actually are. Most kinds
// reduce to labelled counts out of a total — a choice, a survey, a matching, a
// ranking, a word game — so they share one renderer and differ only in what a
// label means. A guessing question does not: fifty guesses are fifty values on
// a line, and forcing them into bars would draw fifty bars of one. An open
// question is text.
//
// No chart library. Bars are a div with a width, and the number line is one
// small SVG — both of which are less code than configuring something would be,
// and neither of which brings a runtime dependency to a site that has almost
// none.
//
// `big` is the same chart at projector size rather than a second set of
// components. One chart drawn twice cannot disagree with itself about what the
// room said, which a separate "presentation version" eventually would.
import { formatGuess } from '@/guessFormat';
import { cloudWords } from '@/wordCloud';
import type { NumberPayload } from '@/authoring';

export type Bar = { label: string; count: number; correct: boolean | null };
export type Chart =
  | { type: 'bars'; total: number; label?: string; bars: Bar[] }
  | {
      type: 'numbers';
      total: number;
      answer: number | null;
      values: number[];
      unit?: string | null;
      currency?: string | null;
      percent?: boolean | null;
    }
  | {
      type: 'texts';
      total: number;
      /** the author's choice, made when the question was written */
      cloud?: boolean;
      texts: { value: unknown; who: string | null }[];
    }
  | { type: 'none'; total: number };

/** Strip the quotes jsonb puts round a stored string. The value is whatever was
 *  sent, so it may be a string, a number or an object. */
const plain = (v: unknown) => (typeof v === 'string' ? v : JSON.stringify(v));

function Bars({ chart, big }: { chart: Extract<Chart, { type: 'bars' }>; big?: boolean }) {
  // Against the biggest bar, not against the total: with four options and an
  // even split, bars at a quarter of the width say nothing you can see across a
  // room. The count is printed, so the scale is never the only information.
  const top = Math.max(1, ...chart.bars.map((b) => b.count));
  return (
    <div className="space-y-1.5">
      {chart.label && (
        <p
          className={`uppercase tracking-wider text-slate-500 ${big ? 'text-sm' : 'text-xs'}`}
        >
          {chart.label}
        </p>
      )}
      {chart.bars.map((b, i) => (
        <div key={`${b.label}-${i}`} className="flex items-center gap-3">
          <span
            className={`w-2/5 shrink-0 truncate ${big ? 'text-2xl sm:text-3xl' : 'text-sm'} ${
              b.correct ? 'text-emerald-300 font-semibold' : 'text-slate-300'
            }`}
            title={b.label}
          >
            {b.label}
          </span>
          <span
            className={`flex-1 rounded bg-white/5 overflow-hidden ${big ? 'h-12' : 'h-6'}`}
          >
            <span
              className={`block h-full rounded ${b.correct ? 'bg-emerald-400' : 'bg-accent'}`}
              style={{ width: `${(b.count / top) * 100}%` }}
            />
          </span>
          <span
            className={`shrink-0 text-right tabular-nums text-slate-400 ${
              big ? 'w-16 text-2xl sm:text-3xl' : 'w-10 text-sm'
            }`}
          >
            {b.count}
          </span>
        </div>
      ))}
    </div>
  );
}

function Numbers({ chart, big }: { chart: Extract<Chart, { type: 'numbers' }>; big?: boolean }) {
  const values = chart.values ?? [];
  if (values.length === 0) return <p className="text-sm text-slate-500">Nobody guessed.</p>;

  const payload: NumberPayload = {
    unit: chart.unit ?? undefined,
    currency: chart.currency ?? undefined,
    percent: chart.percent ?? undefined,
  };
  // The answer belongs on the line whether or not anybody was near it, so the
  // range has to include it — otherwise a room that all guessed low sees a
  // tidy chart with the truth off the edge of it.
  const points = chart.answer == null ? values : [...values, chart.answer];
  const lo = Math.min(...points);
  const hi = Math.max(...points);
  const span = hi - lo || 1;
  const at = (n: number) => ((n - lo) / span) * 100;

  return (
    <div>
      <svg
        viewBox="0 0 100 18"
        className={`w-full ${big ? 'h-32' : 'h-12'}`}
        role="img"
        aria-label="Every guess"
      >
        <line x1="0" y1="12" x2="100" y2="12" stroke="currentColor" strokeWidth="0.3" opacity="0.3" />
        {values.map((v, i) => (
          <circle
            key={i}
            cx={at(v)}
            cy="12"
            r="1.6"
            className="fill-accent"
            opacity="0.75"
          />
        ))}
        {chart.answer != null && (
          <line
            x1={at(chart.answer)}
            y1="4"
            x2={at(chart.answer)}
            y2="16"
            className="stroke-emerald-400"
            strokeWidth="0.8"
          />
        )}
      </svg>
      <div
        className={`flex justify-between text-slate-500 tabular-nums ${
          big ? 'text-xl sm:text-2xl' : 'text-xs'
        }`}
      >
        <span>{formatGuess(lo, payload)}</span>
        {chart.answer != null && (
          <span className="text-emerald-300">{formatGuess(chart.answer, payload)}</span>
        )}
        <span>{formatGuess(hi, payload)}</span>
      </div>
    </div>
  );
}

function Cloud({ texts, big }: { texts: { value: unknown }[]; big?: boolean }) {
  const words = cloudWords(texts);
  if (words.length === 0) return <p className="text-sm text-slate-500">Nothing to draw.</p>;
  const top = words[0].count;
  const low = words[words.length - 1].count;
  return (
    <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      {words.map(({ word, count }) => {
        // Scaled between the least and most frequent rather than from zero: a
        // room where everything was said twice and one thing three times is
        // still a cloud with something in it.
        const t = top === low ? 1 : (count - low) / (top - low);
        const min = big ? 1.1 : 0.8;
        const max = big ? 4 : 2;
        return (
          <span
            key={word}
            title={`${word} — ${count}`}
            className={count === top ? 'text-emerald-300 font-semibold' : 'text-slate-300'}
            style={{ fontSize: `${(min + t * (max - min)).toFixed(2)}rem`, lineHeight: 1.1 }}
          >
            {word}
          </span>
        );
      })}
    </p>
  );
}

function Texts({
  chart,
  big,
  cloud,
}: {
  chart: Extract<Chart, { type: 'texts' }>;
  big?: boolean;
  cloud?: boolean;
}) {
  if (chart.texts.length === 0) return <p className="text-sm text-slate-500">Nothing asked.</p>;
  // A cloud is a shape, not a transcript. It carries no names because it
  // carries no sentences — which is also why it is the safer thing to put on a
  // wall when the answers were personal.
  // The author's choice unless the screen overrides it: "one word for this
  // month" is a cloud before anybody answers it, and finding that switch on
  // the results page afterwards is finding it too late.
  if (cloud ?? chart.cloud) return <Cloud texts={chart.texts} big={big} />;
  return (
    <ul className="space-y-2">
      {chart.texts.map((t, i) => (
        <li key={i} className={`text-slate-200 ${big ? 'text-2xl sm:text-3xl' : 'text-sm'}`}>
          {plain(t.value)}
          {/* The promise is to the room, and it is kept here as it is on the
              presenter's screen: no name on anything somebody asked to be
              unnamed. */}
          <span className="text-slate-500"> — {t.who ?? 'anonymous'}</span>
        </li>
      ))}
    </ul>
  );
}

export default function ChartFor({
  chart,
  big,
  cloud,
}: {
  chart: Chart;
  big?: boolean;
  /** open questions only. Undefined defers to what the author chose. */
  cloud?: boolean;
}) {
  if (!chart || chart.total === 0) {
    return <p className="text-sm text-slate-500">Nobody answered this one.</p>;
  }
  switch (chart.type) {
    case 'bars':
      return <Bars chart={chart} big={big} />;
    case 'numbers':
      return <Numbers chart={chart} big={big} />;
    case 'texts':
      return <Texts chart={chart} big={big} cloud={cloud} />;
    default:
      // A kind the server knows about and this build cannot draw. Says so
      // rather than rendering an empty box — item_kinds is a table, so that
      // can happen.
      return <p className="text-sm text-slate-500">No chart for this kind of question yet.</p>;
  }
}
