// A judged giveaway: answer the questions, and judges choose -- or, for one
// rated then drawn, judges rate the answers and the best go into a drawing.
//
// Four moments, one component, because each is the same page seen by
// different people at a different time:
//
//   open      entrants answer (and change their answers); organisers pick
//             the judges, and can enter somebody who never signs in
//   judging   each judge ranks their favourite entries, blind -- "Entry 3",
//             never a name; organisers watch who has ranked, and announce
//   decided   everything opens: every entry with its name, its points and
//             each judge's rank -- the transparency the drawing has
//
// The server holds the line on all of it (giveawaysjudged.sql): who may see
// what, who may rank, the blind labels, the totals. This only draws it.
import { useCallback, useEffect, useState } from 'react';
import PeoplePicker from '@/GiveawayPeoplePicker';
import {
  addJudge,
  announceResults,
  enterGiveaway,
  enterJudged,
  qualifyGiveaway,
  readJudging,
  removeJudge,
  saveRanking,
  saveRatings,
  startJudging,
  type Giveaway,
  type Judging,
  type Tie,
} from '@/giveaways';

const FIELD =
  'w-full rounded-lg bg-white/5 border border-white/15 px-3 py-2 text-sm text-slate-200 ' +
  'placeholder:text-slate-500 focus:outline-none focus:border-accent';
const BUTTON =
  'inline-flex items-center justify-center px-3 h-9 rounded-lg text-sm font-semibold ' +
  'bg-white/10 border border-white/15 text-slate-200 hover:bg-white/15 disabled:opacity-50';
const PRIMARY =
  'inline-flex items-center justify-center px-4 h-10 rounded-lg text-sm font-semibold ' +
  'bg-accent text-slate-950 hover:brightness-110 disabled:opacity-50';
const CARD = 'rounded-xl border border-white/15 bg-white/5 p-4';

// One empty set of answers, not a new one each render: the entry form resets
// itself when its starting answers change, and a fresh {} every render wiped
// whatever somebody had typed before they could press Enter.
const NO_ANSWERS: Record<string, string> = {};

const ordinal = (n: number) => (n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`);

export default function GiveawayJudging({
  giveaway: g,
  canManage,
  agreed = true,
  onChanged,
}: {
  giveaway: Giveaway;
  canManage: boolean;
  /** the reader has agreed to the terms, or is not in it yet to have */
  agreed?: boolean;
  /** the giveaway page re-reads itself: status, winners, the record */
  onChanged: () => void;
}) {
  const [j, setJ] = useState<Judging | null>(null);
  const [said, setSaid] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const got = await readJudging(g.id);
    if (got.ok) setJ(got);
    else setSaid(got.reason);
  }, [g.id]);
  useEffect(() => void load(), [load, g.status]);

  async function act(run: () => Promise<{ ok: boolean; reason?: string }>, done?: string) {
    setBusy(true);
    const res = await run();
    setBusy(false);
    setSaid(res.ok ? (done ?? '') : (res.reason ?? 'That did not work'));
    await load();
    onChanged();
    return res.ok;
  }

  if (!j) return said ? <p className="text-sm text-rose-300 mt-4">{said}</p> : null;

  const closed = g.entries_close_at !== null && Date.now() >= Date.parse(g.entries_close_at);
  const rated = g.mode === 'screened';
  return (
    <div className="mt-4 space-y-6">
      {said && <p className="text-sm text-slate-300" role="status">{said}</p>}

      {g.status === 'open' && g.self_entry && !closed && (
        <EntryForm
          title={j.entered ? 'Your entry' : 'Enter by answering'}
          questions={j.questions}
          initial={j.mine ?? NO_ANSWERS}
          busy={busy}
          submit={j.entered ? 'Save my answers' : 'Enter'}
          // a tick to agree, unless already agreed
          terms={!g.terms_hash || (j.entered && agreed) ? null : g.terms_hash}
          onSubmit={(answers) =>
            act(() => enterJudged(g.id, answers, undefined, g.terms_hash), j.entered ? 'Answers saved.' : 'You are in.')
          }
          onWithdraw={j.entered ? () => act(() => enterGiveaway(g.id, false), 'You are out.') : undefined}
        />
      )}
      {g.status === 'open' && g.self_entry && closed && (
        <p className="text-sm text-slate-400">Entries closed {new Date(g.entries_close_at!).toLocaleString()}.</p>
      )}

      {canManage && g.status !== 'drawn' && g.status !== 'cancelled' && (
        <Judges j={j} id={g.id} busy={busy} act={act} rated={rated} />
      )}
      {canManage && g.status === 'open' && <EnterSomebody j={j} id={g.id} busy={busy} act={act} />}
      {canManage && g.status === 'open' && (
        <section className={CARD} aria-label="Close the entries">
          <p className="text-sm text-slate-300">
            {j.entries_count} {j.entries_count === 1 ? 'entry' : 'entries'} so far, {j.judges.length}{' '}
            {j.judges.length === 1 ? 'judge' : 'judges'}.
          </p>
          <button
            type="button"
            className={`${PRIMARY} mt-2`}
            disabled={busy || j.entries_count === 0 || j.judges.length === 0}
            onClick={() => {
              if (window.confirm(`Close the entries and start the ${rated ? 'rating' : 'judging'}? Nobody can enter or change an answer after this.`)) {
                void act(() => startJudging(g.id), `The ${rated ? 'rating' : 'judging'} has started.`);
              }
            }}
          >
            Close entries and start {rated ? 'the rating' : 'judging'}
          </button>
        </section>
      )}

      {g.status === 'judging' && j.is_judge && !rated && <Ranking j={j} id={g.id} busy={busy} act={act} />}
      {g.status === 'judging' && j.is_judge && rated && <Rating j={j} id={g.id} busy={busy} act={act} />}
      {g.status === 'judging' && !j.is_judge && !canManage && (
        <p className="text-sm text-slate-300">
          Being {rated ? 'rated' : 'judged'} by {j.judges.map((x) => x.name).join(', ')}. The entries and every
          judge’s {rated ? 'rating' : 'ranking'} are shown here once {rated ? 'the pool for the drawing is set' : 'the winners are announced'}.
        </p>
      )}
      {g.status === 'judging' && canManage && !rated && <Announce j={j} id={g.id} busy={busy} act={act} />}
      {g.status === 'judging' && canManage && rated && <SetPool j={j} g={g} busy={busy} act={act} />}

      {j.decided && !rated && <Results j={j} />}
      {j.decided && rated && <PoolResults j={j} />}
    </div>
  );
}

function EntryForm({
  title,
  questions,
  initial,
  busy,
  submit,
  terms = null,
  onSubmit,
  onWithdraw,
}: {
  title: string;
  questions: Judging['questions'];
  initial: Record<string, string>;
  busy: boolean;
  submit: string;
  /** terms to agree to before submitting, or null */
  terms?: string | null;
  onSubmit: (answers: Record<string, string>) => Promise<boolean>;
  onWithdraw?: () => void;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>(initial);
  useEffect(() => setAnswers(initial), [initial]);
  const [agreeing, setAgreeing] = useState(false);
  const complete = questions.every((q) => (answers[q.id] ?? '').trim() !== '') && (!terms || agreeing);
  return (
    <section className={`${CARD} space-y-3`} aria-label={title}>
      <h2 className="text-sm font-semibold text-slate-200">{title}</h2>
      {questions.map((q, i) => (
        <label key={q.id} className="block text-sm text-slate-300">
          <span className="block">
            {questions.length > 1 && <span className="text-slate-500">{i + 1}. </span>}
            {q.prompt}
          </span>
          <textarea
            className={`${FIELD} mt-1`}
            rows={3}
            maxLength={2000}
            value={answers[q.id] ?? ''}
            onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
          />
        </label>
      ))}
      {terms && (
        <label className="flex items-start gap-2 text-sm text-slate-300">
          <input type="checkbox" className="mt-1" checked={agreeing} onChange={(e) => setAgreeing(e.target.checked)} />
          I have read and agree to the terms and conditions
        </label>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" className={PRIMARY} disabled={busy || !complete} onClick={() => void onSubmit(answers)}>
          {submit}
        </button>
        {onWithdraw && (
          <button
            type="button"
            className={BUTTON}
            disabled={busy}
            onClick={() => {
              if (window.confirm('Take your entry out? Your answers go with it.')) onWithdraw();
            }}
          >
            Take me out
          </button>
        )}
      </div>
    </section>
  );
}

type Act = (run: () => Promise<{ ok: boolean; reason?: string }>, done?: string) => Promise<boolean>;

function Judges({ j, id, busy, act, rated }: { j: Judging; id: string; busy: boolean; act: Act; rated: boolean }) {
  return (
    <section className={`${CARD} space-y-2`} aria-label="Judges">
      <h2 className="text-sm font-semibold text-slate-200">Judges</h2>
      {j.judges.length === 0 ? (
        <p className="text-sm text-slate-400">None yet.</p>
      ) : (
        <ul className="space-y-1">
          {j.judges.map((x) => (
            <li key={x.user} className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-300">
              <span className="min-w-0 break-words">
                {x.name}
                {j.decided ? '' : x.ranked ? (
                  <span className="text-xs text-emerald-300"> · has {rated ? 'rated' : 'ranked'}</span>
                ) : (
                  <span className="text-xs text-slate-500"> · not {rated ? 'rated' : 'ranked'} yet</span>
                )}
              </span>
              <button
                type="button"
                className="text-xs text-rose-300 hover:underline"
                disabled={busy}
                aria-label={`Remove ${x.name} as a judge`}
                onClick={() => {
                  if (window.confirm(`Remove ${x.name} as a judge?${x.ranked ? ' Their ranking goes with them.' : ''}`)) {
                    void act(() => removeJudge(id, x.user));
                  }
                }}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      <PeoplePicker
        label="Add a judge"
        action="Add"
        busy={busy}
        accountsOnly
        onPick={(who) => {
          if (who.user) void act(() => addJudge(id, who.user!));
        }}
      />
      <p className="text-xs text-slate-500">
        A judge needs to have signed in once. A judge may enter, but cannot {rated ? 'rate' : 'rank'} their own entry.
      </p>
    </section>
  );
}

/** An organiser entering somebody -- answers and all -- for staff who will
 *  never sign in, or who handed their answers over on paper. */
function EnterSomebody({ j, id, busy, act }: { j: Judging; id: string; busy: boolean; act: Act }) {
  const [who, setWho] = useState<{ person?: string | null; user?: string | null; name?: string } | null>(null);
  const [label, setLabel] = useState('');
  return (
    <section className={`${CARD} space-y-2`} aria-label="Enter somebody">
      <h2 className="text-sm font-semibold text-slate-200">Enter somebody</h2>
      {who ? (
        <>
          <p className="text-sm text-slate-300">
            Answering for {label}.{' '}
            <button type="button" className="text-accent hover:underline" onClick={() => setWho(null)}>
              Somebody else
            </button>
          </p>
          <EntryForm
            title={`${label}'s answers`}
            questions={j.questions}
            initial={NO_ANSWERS}
            busy={busy}
            submit="Enter them"
            onSubmit={async (answers) => {
              const ok = await act(() => enterJudged(id, answers, who), `${label} is in.`);
              if (ok) setWho(null);
              return ok;
            }}
          />
        </>
      ) : (
        <PeoplePicker
          label="Who to enter"
          action="Choose"
          busy={busy}
          onPick={(picked) => {
            setWho(picked);
            setLabel(picked.name ?? 'them');
          }}
        />
      )}
    </section>
  );
}

function Ranking({ j, id, busy, act }: { j: Judging; id: string; busy: boolean; act: Act }) {
  // label -> rank, from what the judge saved
  const [ranks, setRanks] = useState<Record<string, number>>(() =>
    Object.fromEntries((j.my_ranking ?? []).map((label, i) => [label, i + 1]))
  );
  useEffect(
    () => setRanks(Object.fromEntries((j.my_ranking ?? []).map((label, i) => [label, i + 1]))),
    [j.my_ranking]
  );
  const taken = new Map(Object.entries(ranks).map(([label, r]) => [r, label]));
  const order = Object.entries(ranks)
    .sort(([, a], [, b]) => a - b)
    .map(([label]) => label);
  // ranks have to run 1, 2, 3 without a gap
  const gapless = order.every((label, i) => ranks[label] === i + 1);
  const questionOf = new Map(j.questions.map((q, i) => [q.id, { prompt: q.prompt, n: i + 1 }]));

  function setRank(label: string, r: number) {
    setRanks((prev) => {
      const next = { ...prev };
      // a rank held by another entry moves off it
      for (const [l, v] of Object.entries(next)) if (v === r && l !== label) delete next[l];
      if (r === 0) delete next[label];
      else next[label] = r;
      return next;
    });
  }

  return (
    <section className="space-y-3" aria-label="Your judging">
      <div className={CARD}>
        <h2 className="text-sm font-semibold text-slate-200">Your judging</h2>
        <p className="text-sm text-slate-300 mt-1">
          Rank your favourite {j.picks === 1 ? 'entry' : `${j.picks} entries`}: 1st is worth {j.picks}{' '}
          {j.picks === 1 ? 'point' : 'points'}
          {j.picks > 1 ? `, ${ordinal(j.picks)} is worth 1` : ''}. Names are hidden until the winners are announced.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <button
            type="button"
            className={PRIMARY}
            disabled={busy || order.length === 0 || !gapless}
            onClick={() => void act(() => saveRanking(id, order), 'Your ranking is saved. You can change it until the winners are announced.')}
          >
            Save my ranking
          </button>
          {!gapless && <span className="text-xs text-rose-300">Ranks run 1st, 2nd, 3rd without a gap.</span>}
          {order.length > 0 && (
            <span className="text-xs text-slate-400">
              {order.map((label, i) => `${ordinal(i + 1)}: ${label}`).join(' · ')}
            </span>
          )}
        </div>
      </div>
      <ul className="space-y-2">
        {j.entries.map((e) => (
          <li key={e.label} className={CARD}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-200">{e.label}</h3>
              {e.own ? (
                <span className="text-xs text-slate-500">Your own entry: you cannot rank it</span>
              ) : (
                <label className="flex items-center gap-2 text-xs text-slate-400">
                  Your rank
                  <select
                    className={`${FIELD} w-auto`}
                    value={ranks[e.label] ?? 0}
                    aria-label={`Your rank for ${e.label}`}
                    onChange={(ev) => setRank(e.label, Number(ev.target.value))}
                  >
                    <option value={0}>—</option>
                    {Array.from({ length: j.picks }, (_, i) => i + 1).map((r) => (
                      <option key={r} value={r}>
                        {ordinal(r)}
                        {taken.get(r) && taken.get(r) !== e.label ? ` (now ${taken.get(r)})` : ''}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
            <dl className="mt-2 space-y-2">
              {e.answers.map((a) => (
                <div key={a.question}>
                  {j.questions.length > 1 && (
                    <dt className="text-xs text-slate-500">{questionOf.get(a.question)?.prompt}</dt>
                  )}
                  <dd className="text-sm text-slate-200 whitespace-pre-line break-words">{a.answer}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Announce({ j, id, busy, act }: { j: Judging; id: string; busy: boolean; act: Act }) {
  const [tie, setTie] = useState<Tie | null>(null);
  const [chosen, setChosen] = useState<string[]>([]);
  const ranked = j.judges.filter((x) => x.ranked).length;

  async function announce(tiebreak?: string[]) {
    const res = await announceResults(id, tiebreak);
    if (!res.ok && res.tie) {
      setTie(res.tie);
      setChosen([]);
      return { ok: false, reason: `A tie at ${res.tie.points} points: choose ${res.tie.need} of the tied entries below.` };
    }
    setTie(null);
    return res;
  }

  return (
    <section className={`${CARD} space-y-3`} aria-label="The results">
      <h2 className="text-sm font-semibold text-slate-200">The results</h2>
      <p className="text-sm text-slate-300">
        {ranked} of {j.judges.length} {j.judges.length === 1 ? 'judge has' : 'judges have'} ranked.
      </p>
      {j.entries.some((e) => e.points !== null) && (
        <ol className="space-y-1 text-sm text-slate-300">
          {j.entries.map((e) => (
            <li key={e.label} className="flex flex-wrap justify-between gap-2">
              <span>{e.label}</span>
              <span className="tabular-nums text-slate-400">
                {e.points} {e.points === 1 ? 'point' : 'points'}
              </span>
            </li>
          ))}
        </ol>
      )}
      {tie ? (
        <div className="space-y-2" role="group" aria-label="Settle the tie">
          <p className="text-sm text-amber-200">
            A tie at {tie.points} points for the last {tie.need === 1 ? 'place' : `${tie.need} places`}. Choose{' '}
            {tie.need}:
          </p>
          {tie.tied.map((t) => (
            <label key={t.key} className="flex items-center gap-2 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={chosen.includes(t.key)}
                onChange={(e) =>
                  setChosen((c) => (e.target.checked ? [...c, t.key] : c.filter((k) => k !== t.key)))
                }
              />
              {t.label}
            </label>
          ))}
          <button
            type="button"
            className={PRIMARY}
            disabled={busy || chosen.length !== tie.need}
            onClick={() => void act(() => announce(chosen), 'The winners are announced.')}
          >
            Announce with these
          </button>
        </div>
      ) : (
        <button
          type="button"
          className={PRIMARY}
          disabled={busy || ranked === 0}
          onClick={() => {
            const waiting = j.judges.length - ranked;
            const ok = window.confirm(
              (waiting > 0 ? `${waiting} ${waiting === 1 ? 'judge has' : 'judges have'} not ranked yet. ` : '') +
                'Announce the winners? Every entry and every judge’s ranking becomes visible to everybody, and the judging ends.'
            );
            if (ok) void act(() => announce(), 'The winners are announced.');
          }}
        >
          Announce the winners
        </button>
      )}
    </section>
  );
}

function Results({ j }: { j: Judging }) {
  const questionOf = new Map(j.questions.map((q) => [q.id, q.prompt]));
  return (
    <section className="space-y-2" aria-label="Every entry">
      <h2 className="text-sm font-semibold text-slate-200">Every entry</h2>
      <p className="text-xs text-slate-400">
        Ranked by the judges: 1st from a judge is worth {j.picks} {j.picks === 1 ? 'point' : 'points'}
        {j.picks > 1 ? `, ${ordinal(j.picks)} is worth 1` : ''}.
      </p>
      <ol className="space-y-2">
        {j.entries.map((e, i) => (
          <li key={e.label} className={CARD}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h3 className="text-sm font-semibold text-slate-200 min-w-0 break-words">
                {i + 1}. {e.name}
              </h3>
              <span className="text-xs text-slate-400 tabular-nums">
                {e.points} {e.points === 1 ? 'point' : 'points'}
              </span>
            </div>
            {(e.ranks ?? []).length > 0 && (
              <p className="text-xs text-slate-400 mt-1">
                {(e.ranks ?? []).map((r) => `${ordinal(r.rank)} from ${r.judge}`).join(' · ')}
              </p>
            )}
            <dl className="mt-2 space-y-2">
              {e.answers.map((a) => (
                <div key={a.question}>
                  {j.questions.length > 1 && <dt className="text-xs text-slate-500">{questionOf.get(a.question)}</dt>}
                  <dd className="text-sm text-slate-200 whitespace-pre-line break-words">{a.answer}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** A judge rating every entry 1 to 5, blind. Any left unrated are ones this
 *  judge said nothing about; ratings can change until the pool is set. */
function Rating({ j, id, busy, act }: { j: Judging; id: string; busy: boolean; act: Act }) {
  const [ratings, setRatings] = useState<Record<string, number>>(j.my_ratings ?? {});
  useEffect(() => setRatings(j.my_ratings ?? {}), [j.my_ratings]);
  const questionOf = new Map(j.questions.map((q) => [q.id, q.prompt]));
  const rateable = j.entries.filter((e) => !e.own).length;
  const done = Object.keys(ratings).length;
  return (
    <section className="space-y-3" aria-label="Your rating">
      <div className={CARD}>
        <h2 className="text-sm font-semibold text-slate-200">Your rating</h2>
        <p className="text-sm text-slate-300 mt-1">
          Rate each answer from 1 (weakest) to 5 (best). Entries averaging {j.bar ?? 3} or more across the
          judges go into the drawing. Names are hidden until the pool is set.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <button
            type="button"
            className={PRIMARY}
            disabled={busy || done === 0}
            onClick={() => void act(() => saveRatings(id, ratings), 'Your ratings are saved. You can change them until the pool is set.')}
          >
            Save my ratings
          </button>
          <span className="text-xs text-slate-400">
            {done} of {rateable} rated
          </span>
        </div>
      </div>
      <ul className="space-y-2">
        {j.entries.map((e) => (
          <li key={e.label} className={CARD}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-200">{e.label}</h3>
              {e.own ? (
                <span className="text-xs text-slate-500">Your own entry: you cannot rate it</span>
              ) : (
                <div className="flex flex-wrap gap-1" role="group" aria-label={`Your rating for ${e.label}`}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      aria-pressed={ratings[e.label] === n}
                      onClick={() =>
                        setRatings((r) => {
                          const next = { ...r };
                          if (next[e.label] === n) delete next[e.label];
                          else next[e.label] = n;
                          return next;
                        })
                      }
                      className={`w-9 h-9 rounded-lg text-sm font-semibold border ${
                        ratings[e.label] === n
                          ? 'bg-accent text-slate-950 border-accent'
                          : 'bg-white/5 border-white/15 text-slate-200 hover:bg-white/10'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <dl className="mt-2 space-y-2">
              {e.answers.map((a) => (
                <div key={a.question}>
                  {j.questions.length > 1 && <dt className="text-xs text-slate-500">{questionOf.get(a.question)}</dt>}
                  <dd className="text-sm text-slate-200 whitespace-pre-line break-words">{a.answer}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Setting the pool: every average, the bar to confirm or move, and how many
 *  that lets in -- before anything is fixed. */
function SetPool({ j, g, busy, act }: { j: Judging; g: Giveaway; busy: boolean; act: Act }) {
  const [bar, setBar] = useState(String(j.bar ?? g.bar ?? 3));
  const rated = j.judges.filter((x) => x.ranked).length;
  const b = Number(bar);
  const valid = b >= 1 && b <= 5;
  const meeting = j.entries.filter((e) => e.average !== null && e.average !== undefined && e.average >= b).length;
  return (
    <section className={`${CARD} space-y-3`} aria-label="Set the pool">
      <h2 className="text-sm font-semibold text-slate-200">Set the pool</h2>
      <p className="text-sm text-slate-300">
        {rated} of {j.judges.length} {j.judges.length === 1 ? 'judge has' : 'judges have'} rated.
      </p>
      <ol className="space-y-1 text-sm text-slate-300">
        {j.entries.map((e) => (
          <li key={e.label} className="flex flex-wrap justify-between gap-2">
            <span>{e.label}</span>
            <span className={`tabular-nums ${e.average !== null && e.average !== undefined && e.average >= b ? 'text-emerald-300' : 'text-slate-400'}`}>
              {e.average === null || e.average === undefined ? 'not rated' : `${Number(e.average).toFixed(2)} average`}
              {e.rated_by ? ` · ${e.rated_by} ${e.rated_by === 1 ? 'rating' : 'ratings'}` : ''}
            </span>
          </li>
        ))}
      </ol>
      <label className="block text-xs text-slate-400">
        Into the drawing at an average of at least
        <input className={`${FIELD.replace('w-full', 'w-24')} mt-1 block`} type="number" min={1} max={5} step={0.25} value={bar}
               onChange={(e) => setBar(e.target.value)} />
      </label>
      <p className="text-sm text-slate-300">
        {valid
          ? `${meeting} of ${j.entries.length} ${j.entries.length === 1 ? 'entry' : 'entries'} ${meeting === 1 ? 'goes' : 'go'} into the drawing.`
          : 'The bar is between 1 and 5.'}
      </p>
      <button
        type="button"
        className={PRIMARY}
        disabled={busy || !valid || meeting === 0}
        onClick={() => {
          const waiting = j.judges.length - rated;
          const ok = window.confirm(
            (waiting > 0 ? `${waiting} ${waiting === 1 ? 'judge has' : 'judges have'} not rated yet. ` : '') +
              `Set the pool at ${b}? The rating ends, and who is in -- with every rating -- becomes visible to everybody.`
          );
          if (ok) void act(() => qualifyGiveaway(g.id, b), `The pool is set: ${meeting} in.`);
        }}
      >
        Set the pool
      </button>
    </section>
  );
}

function PoolResults({ j }: { j: Judging }) {
  const questionOf = new Map(j.questions.map((q) => [q.id, q.prompt]));
  return (
    <section className="space-y-2" aria-label="Every entry">
      <h2 className="text-sm font-semibold text-slate-200">Every entry</h2>
      <p className="text-xs text-slate-400">
        Rated by the judges from 1 to 5; entries averaging {j.bar ?? 3} or more went into the drawing.
      </p>
      <ol className="space-y-2">
        {j.entries.map((e) => (
          <li key={e.label} className={CARD}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h3 className="text-sm font-semibold text-slate-200 min-w-0 break-words">{e.name}</h3>
              <span className={`text-xs tabular-nums ${e.qualified ? 'text-emerald-300' : 'text-slate-400'}`}>
                {e.average === null || e.average === undefined ? 'not rated' : `${Number(e.average).toFixed(2)} average`}
                {' · '}
                {e.qualified ? 'in the drawing' : 'not in the drawing'}
              </span>
            </div>
            {(e.ratings ?? []).length > 0 && (
              <p className="text-xs text-slate-400 mt-1">
                {(e.ratings ?? []).map((r) => `${r.rating} from ${r.judge}`).join(' · ')}
              </p>
            )}
            <dl className="mt-2 space-y-2">
              {e.answers.map((a) => (
                <div key={a.question}>
                  {j.questions.length > 1 && <dt className="text-xs text-slate-500">{questionOf.get(a.question)}</dt>}
                  <dd className="text-sm text-slate-200 whitespace-pre-line break-words">{a.answer}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ol>
    </section>
  );
}
