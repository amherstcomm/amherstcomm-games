// Recognition: nominate somebody for acting like an owner, read the wall of
// what reviewers have posted, see the award winners -- and, for reviewers, the
// queue, the decisions, and the rounds.
import { useCallback, useEffect, useState } from 'react';
import { Award } from 'lucide-react';
import Avatar from '@/Avatar';
import Waiting from '@/Waiting';
import PersonSearch from '@/PersonSearch';
import type { Entrant } from '@/contests';
import {
  STATUS_WORD,
  candidates,
  deleteRound,
  nominate,
  pickWinner,
  readRecognition,
  reviewNomination,
  roundDates,
  saveRound,
  withdrawNomination,
  type MyNomination,
  type Person,
  type RecognitionPage,
  type ReviewRow,
  type Round,
  type RoundForm,
  type WallCard,
} from '@/recognition';

const FIELD =
  'w-full rounded-lg bg-white/5 border border-white/15 px-3 py-2 text-sm text-slate-200 ' +
  'placeholder:text-slate-500 focus:outline-none focus:border-accent';
const BUTTON =
  'inline-flex items-center justify-center gap-1.5 px-3 h-9 rounded-lg text-sm font-semibold ' +
  'bg-white/10 border border-white/15 text-slate-200 hover:bg-white/15 disabled:opacity-50';
const PRIMARY =
  'inline-flex items-center justify-center px-4 h-9 rounded-lg text-sm font-semibold ' +
  'bg-accent text-slate-950 hover:brightness-110 disabled:opacity-50';
const CARD = 'rounded-xl border border-white/15 bg-white/5 p-4';
const LABEL = 'block text-xs font-semibold text-slate-400 mb-1';
const H2 = 'text-sm font-semibold text-slate-200';

const posted = (at: string) =>
  new Date(at).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });

export default function RecognitionView() {
  const [page, setPage] = useState<RecognitionPage | null>(null);
  const [nominating, setNominating] = useState(false);
  const [thanks, setThanks] = useState(false);
  const load = useCallback(async () => setPage(await readRecognition()), []);
  useEffect(() => void load(), [load]);

  if (!page) return <Waiting what="recognition" onRetry={() => void load()} />;
  if (!page.ok) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <h1 className="text-xl font-semibold text-slate-200">Recognition</h1>
        <p className="text-sm text-slate-400 mt-3">
          {page.reason === 'not signed in' ? 'Sign in to nominate somebody and see the wall.' : 'This did not load.'}
        </p>
      </div>
    );
  }

  const rounds = page.rounds ?? [];
  const open = rounds.filter((r) => r.state === 'open');
  const won = rounds.filter((r) => r.winner);
  const wall = page.wall ?? [];
  const mine = page.mine ?? [];

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-slate-200">Recognition</h1>
        <p className="text-sm text-slate-400">
          Seen somebody acting like an owner? Say what they did. Reviewers post nominations to the wall, and the
          person you nominated is told.
        </p>
        {open.map((r) => (
          <p key={r.id} className="mt-3 text-sm text-slate-200">
            <span className="font-semibold">{r.title}:</span> nominations made {roundDates(r)} are in the running for
            the award.{r.blurb ? ` ${r.blurb}` : ''}
          </p>
        ))}
        <div className="mt-4">
          {nominating ? (
            <NominateForm
              onDone={async (sent) => {
                setNominating(false);
                setThanks(sent);
                if (sent) await load();
              }}
            />
          ) : (
            <button type="button" className={PRIMARY} onClick={() => {
              setThanks(false);
              setNominating(true);
            }}>
              Nominate somebody
            </button>
          )}
          {thanks && (
            <p className="text-sm text-emerald-300 mt-3" role="status">
              Thank you. Your nomination is waiting for review.
            </p>
          )}
        </div>
      </div>

      {page.can_review && page.review && <Review page={page} onChange={load} />}

      {won.length > 0 && (
        <section aria-label="Award winners">
          <h2 className={H2}>Award winners</h2>
          <ul className="mt-2 grid gap-3 sm:grid-cols-2">
            {won.map((r) => (
              <li key={r.id} className="rounded-xl border border-accent/40 bg-accent/10 p-4">
                <p className="flex items-center gap-1.5 text-xs uppercase tracking-wider font-semibold text-accent">
                  <Award className="w-3.5 h-3.5" aria-hidden="true" /> {r.title}
                </p>
                <div className="mt-2 flex items-center gap-3">
                  <Avatar avatar={r.winner!.who.avatar} name={r.winner!.who.name} seed={r.winner!.who.user} size="lg" />
                  <p className="text-lg font-bold text-white">{r.winner!.who.name}</p>
                </div>
                {r.winner!.note && <p className="text-sm text-slate-200 mt-2">{r.winner!.note}</p>}
                <p className="text-sm text-slate-300 mt-2 whitespace-pre-line">{r.winner!.story}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-label="The wall">
        <h2 className={H2}>The wall</h2>
        {wall.length === 0 ? (
          <p className="text-sm text-slate-400 mt-2">Nothing on the wall yet. Be the first to nominate somebody.</p>
        ) : (
          <ul className="mt-2 space-y-3">
            {wall.map((c) => <WallItem key={c.id} c={c} />)}
          </ul>
        )}
      </section>

      {mine.length > 0 && (
        <section aria-label="Your nominations">
          <h2 className={H2}>Your nominations</h2>
          <ul className="mt-2 space-y-2">
            {mine.map((n) => <MineItem key={n.id} n={n} onChange={load} />)}
          </ul>
        </section>
      )}
    </div>
  );
}

function Who({ p, size = 'md' }: { p: Person; size?: 'sm' | 'md' }) {
  return (
    <span className="flex items-center gap-2 min-w-0">
      <Avatar avatar={p.avatar} name={p.name} seed={p.user} size={size} />
      <span className="font-semibold text-slate-200 truncate">{p.name}</span>
    </span>
  );
}

function WallItem({ c }: { c: WallCard }) {
  return (
    <li className={CARD} aria-label={`${c.who.name}, nominated`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Who p={c.who} />
        {c.awards.map((a) => (
          <span key={a} className="inline-flex items-center gap-1 rounded-full bg-accent/15 border border-accent/40 px-2 py-0.5 text-xs font-semibold text-accent">
            <Award className="w-3 h-3" aria-hidden="true" /> {a}
          </span>
        ))}
      </div>
      <p className="text-sm text-slate-200 mt-2 whitespace-pre-line break-words">{c.story}</p>
      <p className="text-xs text-slate-400 mt-2">
        Nominated by {c.from ? c.from.name : 'a colleague'} · {posted(c.at)}
      </p>
    </li>
  );
}

function MineItem({ n, onChange }: { n: MyNomination; onChange: () => Promise<void> }) {
  return (
    <li className="rounded-xl border border-white/15 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Who p={n.who} size="sm" />
        <span className={`text-xs font-semibold ${n.status === 'posted' ? 'text-emerald-300' : 'text-slate-400'}`}>
          {STATUS_WORD[n.status]}
        </span>
      </div>
      <p className="text-sm text-slate-300 mt-1 line-clamp-3 break-words">{n.story}</p>
      {n.status === 'waiting' && (
        <button type="button" className="text-xs text-slate-400 hover:underline mt-1"
                onClick={async () => {
                  if (!window.confirm(`Take back your nomination of ${n.who.name}?`)) return;
                  const res = await withdrawNomination(n.id);
                  if (!res.ok) window.alert(res.reason ?? 'That did not work');
                  await onChange();
                }}>
          Take it back
        </button>
      )}
    </li>
  );
}

function NominateForm({ onDone }: { onDone: (sent: boolean) => void }) {
  const [who, setWho] = useState<Entrant | null>(null);
  const [story, setStory] = useState('');
  const [showName, setShowName] = useState(true);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className={`${CARD} space-y-3`}
      aria-label="Nominate somebody"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!who) return setProblem('Pick who you are nominating.');
        if (story.trim().length < 20) return setProblem('Say what they did: at least 20 characters.');
        setBusy(true);
        const res = await nominate(who.user, story, showName);
        setBusy(false);
        if (!res.ok) return setProblem(res.reason ?? 'That did not go in');
        onDone(true);
      }}
    >
      <PersonSearch chosen={who} onChoose={setWho} label="Who are you nominating?" listLabel="People"
                    chosenWord="Nominating" />
      <label className="block">
        <span className={LABEL}>What did they do?</span>
        <textarea className={FIELD} rows={5} maxLength={2000} value={story}
                  placeholder="What happened, and how it showed them acting like an owner."
                  onChange={(e) => setStory(e.target.value)} />
        <span className="block text-xs text-slate-500 mt-1 tabular-nums">
          {story.trim().length < 20 ? `At least 20 characters (${story.trim().length} so far)` : `${story.length} / 2,000`}
        </span>
      </label>
      <label className="flex items-start gap-2 text-sm text-slate-200">
        <input type="checkbox" className="mt-1" checked={showName} onChange={(e) => setShowName(e.target.checked)} />
        <span>
          Show my name on the wall
          <span className="block text-xs text-slate-400">Reviewers see who nominated either way.</span>
        </span>
      </label>
      {problem && <p className="text-sm text-rose-300">{problem}</p>}
      <div className="flex gap-2">
        <button type="submit" className={PRIMARY} disabled={busy}>Send it</button>
        <button type="button" className={BUTTON} onClick={() => onDone(false)}>Cancel</button>
      </div>
    </form>
  );
}

// --- reviewing ----------------------------------------------------------------

function Review({ page, onChange }: { page: RecognitionPage; onChange: () => Promise<void> }) {
  const rows = page.review!.nominations;
  const waiting = rows.filter((n) => n.status === 'waiting');
  const decided = rows.filter((n) => n.status !== 'waiting');
  const [showDecided, setShowDecided] = useState(false);
  return (
    <section className="space-y-4" aria-label="Reviewing">
      <h2 className={H2}>
        Waiting for review {waiting.length > 0 && <span className="text-accent">({waiting.length})</span>}
      </h2>
      {waiting.length === 0 ? (
        <p className="text-sm text-slate-400">Nothing waiting.</p>
      ) : (
        <ul className="space-y-3">
          {waiting.map((n) => <ReviewItem key={n.id} n={n} onChange={onChange} />)}
        </ul>
      )}

      <Rounds rounds={page.rounds ?? []} rows={rows} me={page.me ?? ''} onChange={onChange} />

      {decided.length > 0 && (
        <div>
          <button type="button" className="text-sm text-accent hover:underline" onClick={() => setShowDecided((x) => !x)}>
            {showDecided ? 'Hide' : 'Show'} what has been decided ({decided.length})
          </button>
          {showDecided && (
            <ul className="space-y-3 mt-3">
              {decided.map((n) => <ReviewItem key={n.id} n={n} onChange={onChange} />)}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

function ReviewItem({ n, onChange }: { n: ReviewRow; onChange: () => Promise<void> }) {
  const [note, setNote] = useState(n.note ?? '');
  const [busy, setBusy] = useState(false);
  async function decide(post: boolean) {
    setBusy(true);
    const res = await reviewNomination(n.id, post, note.trim() || null);
    setBusy(false);
    if (!res.ok) return window.alert(res.reason ?? 'That did not work');
    await onChange();
  }
  return (
    <li className={CARD} aria-label={`Nomination of ${n.who.name}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Who p={n.who} />
        <span className="text-xs text-slate-400">{STATUS_WORD[n.status]}{n.reviewed_by ? ` · ${n.reviewed_by}` : ''}</span>
      </div>
      <p className="text-sm text-slate-200 mt-2 whitespace-pre-line break-words">{n.story}</p>
      <p className="text-xs text-slate-400 mt-2">
        From {n.from?.name ?? 'somebody no longer here'}
        {n.show_name ? '' : ' (not named on the wall)'} · {posted(n.at)}
      </p>
      {n.about_me ? (
        <p className="text-xs text-slate-500 mt-2">This one is about you, so somebody else reviews it.</p>
      ) : (
        <div className="mt-3 space-y-2">
          <label className="block">
            <span className={LABEL}>Note for the reviewers (not shown on the wall)</span>
            <input className={FIELD} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
          </label>
          <div className="flex flex-wrap gap-2">
            {n.status !== 'posted' && (
              <button type="button" className={PRIMARY} disabled={busy} onClick={() => void decide(true)}>
                {n.status === 'declined' ? 'Post it after all' : 'Post to the wall'}
              </button>
            )}
            {n.status !== 'declined' && (
              <button type="button" className={BUTTON} disabled={busy} onClick={() => void decide(false)}>
                {n.status === 'posted' ? 'Take it down' : 'Don’t post'}
              </button>
            )}
          </div>
        </div>
      )}
    </li>
  );
}

const blankRound = (): RoundForm => ({ id: null, title: '', blurb: '', startsOn: '', endsOn: '' });

function Rounds({ rounds, rows, me, onChange }: { rounds: Round[]; rows: ReviewRow[]; me: string; onChange: () => Promise<void> }) {
  const [form, setForm] = useState<RoundForm | null>(null);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className={H2}>Award rounds</h2>
        {!form && (
          <button type="button" className={BUTTON} onClick={() => setForm(blankRound())}>New round</button>
        )}
      </div>
      {form && (
        <RoundEditor start={form} onDone={async (saved) => {
          setForm(null);
          if (saved) await onChange();
        }} />
      )}
      {rounds.length === 0 && !form && (
        <p className="text-sm text-slate-400">
          No rounds yet. A round is a stretch of days, a month or Employee Ownership Month, whose nominations are in
          the running for its award.
        </p>
      )}
      <ul className="space-y-3">
        {rounds.map((r) => (
          <RoundItem key={r.id} r={r} pool={candidates(rows, r)} me={me} onChange={onChange}
                     onEdit={() => setForm({ id: r.id, title: r.title, blurb: r.blurb ?? '', startsOn: r.starts_on, endsOn: r.ends_on })} />
        ))}
      </ul>
    </div>
  );
}

function RoundItem({ r, pool, me, onChange, onEdit }: {
  r: Round; pool: ReviewRow[]; me: string; onChange: () => Promise<void>; onEdit: () => void;
}) {
  const [pick, setPick] = useState(r.winner?.nomination ?? '');
  const [note, setNote] = useState(r.winner?.note ?? '');
  const [busy, setBusy] = useState(false);
  return (
    <li className={CARD} aria-label={r.title}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-semibold text-slate-200">{r.title}</p>
        <p className="text-xs text-slate-400">
          {roundDates(r)} · {r.state === 'soon' ? 'not started' : r.state === 'open' ? 'open now' : 'over'}
        </p>
      </div>
      {r.winner && <p className="text-xs text-emerald-300 mt-1">Winner: {r.winner.who.name}</p>}
      {pool.length === 0 ? (
        <p className="text-xs text-slate-400 mt-2">No nominations on the wall from these dates yet.</p>
      ) : (
        <fieldset className="mt-3 space-y-2">
          <legend className={LABEL}>Pick the winner from the {pool.length} on the wall</legend>
          {pool.map((n) => (
            <label key={n.id} className="flex items-start gap-2 text-sm text-slate-200">
              <input type="radio" name={`winner-${r.id}`} className="mt-1" checked={pick === n.id}
                     disabled={n.who.user === me} onChange={() => setPick(n.id)} />
              <span className="min-w-0">
                <span className="font-semibold">{n.who.name}</span>
                {n.who.user === me && <span className="text-xs text-slate-500"> (you: somebody else picks)</span>}
                <span className="block text-xs text-slate-400 line-clamp-2 break-words">{n.story}</span>
              </span>
            </label>
          ))}
          <label className="block">
            <span className={LABEL}>A line for the winner (optional, on the wall and in their email)</span>
            <input className={FIELD} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
          </label>
        </fieldset>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {pool.length > 0 && (
          <button type="button" className={PRIMARY} disabled={busy || !pick}
                  onClick={async () => {
                    setBusy(true);
                    const res = await pickWinner(r.id, pick, note.trim() || null);
                    setBusy(false);
                    if (!res.ok) return window.alert(res.reason ?? 'That did not work');
                    await onChange();
                  }}>
            {r.winner ? 'Save the winner' : 'Announce the winner'}
          </button>
        )}
        {r.winner && (
          <button type="button" className={BUTTON} disabled={busy}
                  onClick={async () => {
                    if (!window.confirm(`Take ${r.winner!.who.name} off as the winner of ${r.title}?`)) return;
                    await pickWinner(r.id, null);
                    setPick('');
                    await onChange();
                  }}>
            No winner
          </button>
        )}
        <button type="button" className={BUTTON} onClick={onEdit}>Change</button>
        <button type="button" className={BUTTON}
                onClick={async () => {
                  if (!window.confirm(`Delete ${r.title}? Its nominations stay on the wall.`)) return;
                  await deleteRound(r.id);
                  await onChange();
                }}>
          Delete
        </button>
      </div>
    </li>
  );
}

function RoundEditor({ start, onDone }: { start: RoundForm; onDone: (saved: boolean) => void }) {
  const [f, setF] = useState(start);
  const [problem, setProblem] = useState<string | null>(null);
  const set = <K extends keyof RoundForm>(k: K, v: RoundForm[K]) => setF((x) => ({ ...x, [k]: v }));
  return (
    <form
      className={`${CARD} space-y-3`}
      aria-label={f.id ? 'Change the round' : 'New round'}
      onSubmit={async (e) => {
        e.preventDefault();
        const res = await saveRound(f);
        if (!res.ok) return setProblem(res.reason ?? 'That did not save');
        onDone(true);
      }}
    >
      <label className="block">
        <span className={LABEL}>Name</span>
        <input className={FIELD} value={f.title} maxLength={80} placeholder="Employee Ownership Month"
               onChange={(e) => set('title', e.target.value)} />
      </label>
      <label className="block">
        <span className={LABEL}>About it (optional, shown while it is open)</span>
        <input className={FIELD} value={f.blurb} maxLength={1000} onChange={(e) => set('blurb', e.target.value)} />
      </label>
      <div className="grid gap-3 grid-cols-2">
        <label className="block">
          <span className={LABEL}>First day</span>
          <input className={FIELD} type="date" value={f.startsOn} onChange={(e) => set('startsOn', e.target.value)} />
        </label>
        <label className="block">
          <span className={LABEL}>Last day</span>
          <input className={FIELD} type="date" value={f.endsOn} onChange={(e) => set('endsOn', e.target.value)} />
        </label>
      </div>
      {problem && <p className="text-sm text-rose-300">{problem}</p>}
      <div className="flex gap-2">
        <button type="submit" className={PRIMARY}>{f.id ? 'Save' : 'Open the round'}</button>
        <button type="button" className={BUTTON} onClick={() => onDone(false)}>Cancel</button>
      </div>
    </form>
  );
}
