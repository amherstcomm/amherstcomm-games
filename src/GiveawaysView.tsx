// Giveaways: tickets and the like, drawn for staff.
//
// Four addresses. The list; one giveaway, with everything about it in the
// open -- who is in it, at what odds and why, every drawing and the record of
// every step; everybody's history over time; and a drawing replayed, which is
// GiveawayReplay and lives on a screen of its own.
//
// Asked for fully transparent, so nothing here is hidden from staff: the
// controls for running a giveaway are what giveaways.manage adds, and the
// server refuses anybody without it whatever this page draws.
import { useCallback, useEffect, useState } from 'react';
import Waiting from '@/Waiting';
import RouteLink from '@/RouteLink';
import GiveawayReplay from '@/GiveawayReplay';
import GiveawayJudging from '@/GiveawayJudging';
import PeoplePicker from '@/GiveawayPeoplePicker';
import {
  addEntrant,
  cancelGiveaway,
  chance,
  checkDraw,
  curveFor,
  oddsSettings,
  commitDraw,
  decideWinner,
  deleteAttendance,
  enterGiveaway,
  findGiveawayPeople,
  offerPlace,
  readJudging,
  readTriviaChoices,
  setGiveawayTrivia,
  readGiveaway,
  readGiveawayHistory,
  readGiveaways,
  recordAttendance,
  removeEntrant,
  saveGiveaway,
  updatePerson,
  weightFor,
  type Check,
  type Draw,
  type Found,
  type GiveawayDetail,
  type GiveawayForm,
  type GiveawayMode,
  type Tie,
  type TriviaSession,
  type Giveaway,
  type GiveawayStatus,
  type GiveawaySummary,
  type HistoryPerson,
  type LogEntry,
  type WinnerStatus,
} from '@/giveaways';
import type { GiveawayView } from '@/routes';

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
// A box for a two- or three-digit percentage: sized to that, not to the row.
const PERCENT = FIELD.replace('w-full', 'w-24');

/** How this page addresses another one. */
export type GiveawayLink = (p: { kind: 'giveaways'; giveaway: string | null; view: GiveawayView }) => {
  to: string;
  onGo: () => void;
};

const STATUS_WORD: Record<GiveawayStatus, string> = {
  open: 'Taking entries',
  drawing: 'Drawing now',
  judging: 'Being judged',
  qualified: 'Ready to draw',
  drawn: 'Drawn',
  cancelled: 'Called off',
};
/** A judged one has winners the judges chose, not a drawing. */
const statusWord = (status: GiveawayStatus, mode?: GiveawayMode) =>
  mode === 'judged' && status === 'drawn'
    ? 'Decided'
    : mode === 'screened' && status === 'judging'
      ? 'Being rated'
      : STATUS_WORD[status];

const WINNER_WORD: Record<WinnerStatus, string> = {
  pending: 'Drawn, not yet confirmed',
  accepted: 'Going',
  declined: 'Declined',
};

const day = (d: string) =>
  new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
const when = (t: string) =>
  new Date(t).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const today = () => new Date().toLocaleDateString('en-CA');

export default function GiveawaysView({
  giveaway,
  view,
  link,
}: {
  giveaway: string | null;
  view: GiveawayView;
  link: GiveawayLink;
}) {
  if (view === 'history') return <History link={link} />;
  if (giveaway && view === 'replay') return <GiveawayReplay id={giveaway} link={link} />;
  if (giveaway) return <OneGiveaway id={giveaway} link={link} />;
  return <GiveawayList link={link} />;
}

// ---------------------------------------------------------------------------
// The list
// ---------------------------------------------------------------------------

function GiveawayList({ link }: { link: GiveawayLink }) {
  const [rows, setRows] = useState<GiveawaySummary[] | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [refused, setRefused] = useState('');
  const [making, setMaking] = useState(false);

  const load = useCallback(async () => {
    const got = await readGiveaways();
    if (!got.ok) return setRefused(got.reason === 'not allowed' ? 'Sign in to see the giveaways.' : got.reason);
    setRefused('');
    setRows(got.giveaways);
    setCanManage(got.can_manage);
  }, []);
  useEffect(() => void load(), [load]);

  if (refused) return <p className="max-w-2xl mx-auto px-4 py-10 text-sm text-slate-400">{refused}</p>;
  if (!rows) return <Waiting what="the giveaways" onRetry={() => void load()} />;

  const open = rows.filter((r) => r.status === 'open' || r.status === 'drawing');
  const past = rows.filter((r) => r.status === 'drawn' || r.status === 'cancelled');

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <h1 className="text-xl font-semibold text-slate-200">Giveaways</h1>
        <RouteLink
          {...link({ kind: 'giveaways', giveaway: null, view: 'history' })}
          className="text-sm text-accent hover:brightness-110"
        >
          Who has been to what
        </RouteLink>
      </div>
      <p className="text-sm text-slate-400 mt-2">
        Tickets and other things we get to give away, drawn at random. Everybody starts with the
        same chance; going to one lowers your chance at the next, by less the longer ago it was.
        Every drawing can be checked and replayed by anyone.
      </p>

      {canManage &&
        (making ? (
          <GiveawayEditor
            onDone={(id) => {
              setMaking(false);
              if (id) link({ kind: 'giveaways', giveaway: id, view: 'page' }).onGo();
            }}
          />
        ) : (
          <button type="button" className={`${BUTTON} mt-4`} onClick={() => setMaking(true)}>
            New giveaway
          </button>
        ))}

      <h2 className="text-sm font-semibold text-slate-200 mt-6">Open now</h2>
      {open.length === 0 ? (
        <p className="text-sm text-slate-400 mt-2">Nothing is open just now.</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {open.map((g) => (
            <SummaryRow key={g.id} g={g} link={link} />
          ))}
        </ul>
      )}

      {past.length > 0 && (
        <>
          <h2 className="text-sm font-semibold text-slate-200 mt-8">Earlier</h2>
          <ul className="mt-2 space-y-2">
            {past.map((g) => (
              <SummaryRow key={g.id} g={g} link={link} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function SummaryRow({ g, link }: { g: GiveawaySummary; link: GiveawayLink }) {
  return (
    <li>
      <RouteLink
        {...link({ kind: 'giveaways', giveaway: g.id, view: 'page' })}
        className="block rounded-xl border border-white/15 bg-white/5 px-4 py-3 hover:bg-white/10"
      >
        <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <span className="font-semibold text-slate-200 min-w-0 break-words">{g.title}</span>
          <span className="text-xs text-slate-400">
            {statusWord(g.status, g.mode)}
            {g.mode === 'judged' && ' · judged'}
            {g.mode === 'screened' && ' · rated, then drawn'}
          </span>
        </span>
        <span className="block text-xs text-slate-400 mt-1 break-words">
          {[
            g.prize,
            g.event_on && day(g.event_on),
            `${g.entrants} ${g.entrants === 1 ? 'entrant' : 'entrants'}`,
            g.entered && 'you are in',
          ]
            .filter(Boolean)
            .join(' · ')}
        </span>
        {g.drawn.length > 0 && (
          <span className="block text-xs text-accent mt-1 break-words">Drawn: {g.drawn.join(', ')}</span>
        )}
      </RouteLink>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Setting one up
// ---------------------------------------------------------------------------

const BLANK: GiveawayForm = {
  title: '',
  prize: '',
  details: '',
  winners: 1,
  eventOn: '',
  selfEntry: true,
  entriesCloseAt: '',
  strength: 1,
  halfLifeDays: 365,
  mode: 'draw',
  picks: 3,
  questions: [],
  bar: 3,
};

/** A datetime-local field's value for a stored time, in this browser's zone. */
function localInput(t: string | null): string {
  if (!t) return '';
  const d = new Date(t);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** The odds settings, said as what they do to a person. */
function oddsInWords(strength: number, halfLife: number): string {
  if (Number(strength) === 0) return 'Past attendance does not change anybody’s chance.';
  const now = today();
  const back = (days: number) => new Date(Date.now() - days * 86_400_000).toLocaleDateString('en-CA');
  const pct = (days: number) => Math.round(weightFor([{ on: back(days) }], now, strength, halfLife) / 10_000);
  const twice = Math.round(weightFor([{ on: back(30) }, { on: back(365) }], now, strength, halfLife) / 10_000);
  return (
    `Somebody who has been has this much of the chance of somebody who never has: ` +
    `${pct(0)}% right after, ${pct(30)}% a month later, ${pct(365)}% a year later, ${pct(2 * 365)}% after two ` +
    `years, ${pct(3 * 365)}% after three. Each visit counts, so somebody who went last month and last year ` +
    `has ${twice}%.`
  );
}

function GiveawayEditor({
  id,
  initial,
  onDone,
}: {
  id?: string;
  initial?: GiveawayForm;
  /** the saved giveaway's id, or null when cancelled */
  onDone: (id: string | null) => void;
}) {
  const [form, setForm] = useState<GiveawayForm>(initial ?? BLANK);
  // The odds are asked as chances and stored as a curve; the fields hold what
  // was typed, and the curve follows whenever the two make one.
  const [odds, setOdds] = useState(() => {
    const o = oddsSettings(Number((initial ?? BLANK).strength), (initial ?? BLANK).halfLifeDays);
    return { after: String(o.after), year: String(o.year) };
  });
  // Left as shown, the odds stay exactly as they were: the figures are
  // rounded, and fitting a curve back to them would shift it a little on
  // every save.
  const shown = oddsSettings(Number((initial ?? BLANK).strength), (initial ?? BLANK).halfLifeDays);
  const curve =
    Number(odds.after) === shown.after && Number(odds.year) === shown.year
      ? { ok: true as const, strength: Number((initial ?? BLANK).strength), halfLifeDays: (initial ?? BLANK).halfLifeDays }
      : curveFor(Number(odds.after), Number(odds.year));
  const [said, setSaid] = useState('');
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof GiveawayForm>(k: K, v: GiveawayForm[K]) => setForm((f) => ({ ...f, [k]: v }));

  const judged = form.mode === 'judged';
  const screened = form.mode === 'screened';
  // the drawing's odds matter wherever there is a drawing
  const drawn = !judged;
  async function save() {
    if (drawn && !curve.ok) return setSaid(curve.reason);
    setBusy(true);
    const got = await saveGiveaway(id ?? null, {
      ...form,
      ...(curve.ok ? { strength: curve.strength, halfLifeDays: curve.halfLifeDays } : {}),
    });
    setBusy(false);
    if (!got.ok) return setSaid(got.reason);
    onDone(got.id);
  }

  return (
    <section className={`${CARD} mt-4 space-y-3`} aria-label={id ? 'Change the giveaway' : 'New giveaway'}>
      <fieldset>
        <legend className="text-xs font-semibold text-slate-300">How winners are chosen</legend>
        <div className="mt-1 flex flex-wrap gap-x-5 gap-y-1">
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input type="radio" name="giveaway-mode" checked={form.mode === 'draw'} onChange={() => set('mode', 'draw')} />
            Random drawing
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input type="radio" name="giveaway-mode" checked={judged} onChange={() => set('mode', 'judged')} />
            Answer questions, judged
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input type="radio" name="giveaway-mode" checked={screened} onChange={() => set('mode', 'screened')} />
            Answer questions, rated, then drawn
          </label>
        </div>
      </fieldset>
      <label className="block text-xs text-slate-400">
        What it is
        <input className={`${FIELD} mt-1`} value={form.title} placeholder="e.g. Brewers vs Cubs"
               onChange={(e) => set('title', e.target.value)} />
      </label>
      <label className="block text-xs text-slate-400">
        The prize, for each winner
        <input className={`${FIELD} mt-1`} value={form.prize} placeholder="e.g. 2 tickets, section 112"
               onChange={(e) => set('prize', e.target.value)} />
      </label>
      <label className="block text-xs text-slate-400">
        Anything else people should know
        <textarea className={`${FIELD} mt-1`} rows={2} value={form.details}
                  onChange={(e) => set('details', e.target.value)} />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs text-slate-400">
          How many winners
          <input className={`${FIELD} mt-1`} type="number" min={1} max={100} value={form.winners}
                 onChange={(e) => set('winners', Number(e.target.value))} />
        </label>
        <label className="block text-xs text-slate-400">
          The day of the event
          <input className={`${FIELD} mt-1`} type="date" value={form.eventOn}
                 onChange={(e) => set('eventOn', e.target.value)} />
        </label>
      </div>
      <label className="flex items-start gap-2 text-sm text-slate-300">
        <input type="checkbox" className="mt-1" checked={form.selfEntry}
               onChange={(e) => set('selfEntry', e.target.checked)} />
        <span>Staff can enter themselves</span>
      </label>
      {form.selfEntry && (
        <label className="block text-xs text-slate-400">
          Until (leave empty to take entries until {judged ? 'the judging starts' : screened ? 'the rating starts' : 'the drawing'})
          <input className={`${FIELD} mt-1`} type="datetime-local" value={form.entriesCloseAt}
                 onChange={(e) => set('entriesCloseAt', e.target.value)} />
        </label>
      )}
      {(judged || screened) && (
        <fieldset className="space-y-2">
          <legend className="text-xs font-semibold text-slate-300">The questions</legend>
          <label className="block text-xs text-slate-400">
            One per line. Entrants answer every one; up to ten.
            <textarea className={`${FIELD} mt-1`} rows={3} value={form.questions.join('\n')}
                      placeholder="e.g. What does being an owner mean to you?"
                      onChange={(e) => set('questions', e.target.value.split('\n'))} />
          </label>
          {judged && (<>
          <label className="block text-xs text-slate-400">
            Each judge ranks their top
            <span className="mt-1 flex items-center gap-2">
              <input className={PERCENT} type="number" min={1} max={10} value={form.picks}
                     onChange={(e) => set('picks', Number(e.target.value))} />
              <span>entries</span>
            </span>
          </label>
          <p className="text-xs text-slate-400">
            A judge’s 1st is worth {form.picks} {form.picks === 1 ? 'point' : 'points'}
            {form.picks > 1 ? `, their ${form.picks === 2 ? '2nd' : form.picks === 3 ? '3rd' : `${form.picks}th`} 1` : ''}
            ; the most points win. Judges see the answers without names until the winners are announced.
          </p>
          </>)}
          {screened && (<>
          <label className="block text-xs text-slate-400">
            Into the drawing at an average rating of at least
            <span className="mt-1 flex items-center gap-2">
              <input className={PERCENT} type="number" min={1} max={5} step={0.5} value={form.bar}
                     onChange={(e) => set('bar', Number(e.target.value))} />
              <span>out of 5</span>
            </span>
          </label>
          <p className="text-xs text-slate-400">
            Judges rate every answer from 1 to 5 without seeing names. You confirm the bar when you set
            the pool, with every average in front of you, and the pool is then drawn with the usual odds.
          </p>
          </>)}
        </fieldset>
      )}
      {drawn && (
      <fieldset className="space-y-2">
        <legend className="text-xs font-semibold text-slate-300">The odds</legend>
        <p className="text-xs text-slate-400">
          Each as a share of the chance of somebody who has never been. Set right after going to
          100% and past visits do not count at all.
        </p>
        <div className="grid gap-3 grid-cols-2">
          <label className="block text-xs text-slate-400">
            Right after going
            <span className="mt-1 flex items-center gap-2">
              <input className={PERCENT} type="number" min={10} max={100} value={odds.after}
                     onChange={(e) => setOdds((o) => ({ ...o, after: e.target.value }))} />
              <span aria-hidden="true">%</span>
            </span>
          </label>
          <label className="block text-xs text-slate-400">
            A year after
            <span className="mt-1 flex items-center gap-2">
              <input className={PERCENT} type="number" min={11} max={99} value={odds.year}
                     disabled={Number(odds.after) === 100}
                     onChange={(e) => setOdds((o) => ({ ...o, year: e.target.value }))} />
              <span aria-hidden="true">%</span>
            </span>
          </label>
        </div>
        {curve.ok ? (
          <p className="text-xs text-slate-400">{oddsInWords(curve.strength, curve.halfLifeDays)}</p>
        ) : (
          <p className="text-xs text-rose-300" role="status">{curve.reason}</p>
        )}
      </fieldset>
      )}
      {said && <p className="text-xs text-rose-300" role="status">{said}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" className={BUTTON} disabled={busy || (drawn && !curve.ok)} onClick={() => void save()}>
          {id ? 'Save changes' : 'Create it'}
        </button>
        <button type="button" className={BUTTON} onClick={() => onDone(null)}>
          Cancel
        </button>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// One giveaway
// ---------------------------------------------------------------------------

function OneGiveaway({ id, link }: { id: string; link: GiveawayLink }) {
  const [got, setGot] = useState<GiveawayDetail | null>(null);
  const [problem, setProblem] = useState('');
  const [said, setSaid] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  // A judged one's questions, for its editor; the rest of judging is its own
  // component's.
  const [questions, setQuestions] = useState<string[]>([]);
  // A place offered to the next in the judges' ranking, when two tie for it.
  const [offerTie, setOfferTie] = useState<Tie | null>(null);

  const load = useCallback(async () => {
    const res = await readGiveaway(id);
    if (!res.ok) return setProblem(res.reason === 'not allowed' ? 'Sign in to see the giveaways.' : res.reason);
    setProblem('');
    setGot(res);
    if (res.giveaway.mode === 'judged' || res.giveaway.mode === 'screened') {
      const j = await readJudging(id);
      if (j.ok) setQuestions(j.questions.map((q) => q.prompt));
    }
  }, [id]);
  useEffect(() => void load(), [load]);

  // A drawing waiting on its round comes out by itself; keep the page current.
  useEffect(() => {
    if (got?.giveaway.status !== 'drawing') return;
    const t = window.setInterval(() => void load(), 5000);
    return () => window.clearInterval(t);
  }, [got?.giveaway.status, load]);

  async function act(run: () => Promise<{ ok: boolean; reason?: string }>) {
    setBusy(true);
    const res = await run();
    setBusy(false);
    setSaid(res.ok ? '' : (res.reason ?? 'That did not work'));
    await load();
    return res.ok;
  }

  if (problem) return <p className="max-w-2xl mx-auto px-4 py-10 text-sm text-slate-400">{problem}</p>;
  if (!got) return <Waiting what="the giveaway" onRetry={() => void load()} />;

  const g = got.giveaway;
  const manage = got.can_manage;
  const mine = got.entrants.some((e) => e.person === got.me);
  const closed = g.entries_close_at !== null && Date.now() >= Date.parse(g.entries_close_at);
  const judged = g.mode === 'judged';
  const screened = g.mode === 'screened';
  // entered by answering, rather than by putting yourself in
  const answered = judged || screened;
  // who the drawing is between: everybody, or a rated one's pool once set
  const pool = screened ? got.entrants.filter((e) => e.qualified) : got.entrants;
  const total = pool.reduce((s, e) => s + e.weight, 0);
  const missing = g.winners - got.winners.filter((w) => w.status !== 'declined').length;
  const undrawn = pool.filter((e) => !got.winners.some((w) => w.person === e.person)).length;
  const pending = got.draws.find((d) => !d.randomness);

  async function offer(person?: string) {
    setBusy(true);
    const res = await offerPlace(id, person);
    setBusy(false);
    if (!res.ok && res.tie) return setOfferTie(res.tie);
    setOfferTie(null);
    setSaid(res.ok ? '' : res.reason);
    await load();
  }

  async function draw() {
    const n = got!.draws.length === 0 ? pool.length : undrawn;
    const ok = window.confirm(
      `This freezes the ${n} ${n === 1 ? 'person' : 'people'} in the drawing and their odds, and names a ` +
        'public drand round about 30 seconds from now. That round decides who wins; it cannot be undone or redone.'
    );
    if (!ok) return;
    setBusy(true);
    const res = await commitDraw(id);
    setBusy(false);
    if (!res.ok) return setSaid(res.reason);
    link({ kind: 'giveaways', giveaway: id, view: 'replay' }).onGo();
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <RouteLink {...link({ kind: 'giveaways', giveaway: null, view: 'page' })} className="text-sm text-accent">
        ← All giveaways
      </RouteLink>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 mt-3">
        <h1 className="text-xl font-semibold text-slate-200 min-w-0 break-words">{g.title}</h1>
        <span className="text-sm text-slate-400">{statusWord(g.status, g.mode)}</span>
      </div>
      <p className="text-sm text-slate-300 mt-1 break-words">
        {[g.prize, g.winners > 1 && `${g.winners} ${judged ? 'winners' : 'people drawn'}`, g.event_on && day(g.event_on)]
          .filter(Boolean)
          .join(' · ')}
      </p>
      {g.details && <p className="text-sm text-slate-400 mt-2 whitespace-pre-line break-words">{g.details}</p>}
      {g.status === 'cancelled' && (
        <p className="text-sm text-rose-300 mt-2">Called off: {g.cancelled_reason}</p>
      )}
      <p className="text-xs text-slate-500 mt-2">
        {judged
          ? g.status === 'drawn'
            ? 'Chosen by the judges: every entry, with its points and each judge’s ranking, is below.'
            : 'Answer the questions to enter. Judges rank the entries without seeing names, and the most points win; every entry is shown here once the winners are announced.'
          : screened
            ? g.status === 'open' || g.status === 'judging'
              ? 'Answer the questions to enter. Judges rate every answer without seeing names; the best go into a drawing with the usual odds. Who made it in, and every rating, is shown once the pool is set.'
              : `Rated by the judges: entries averaging ${g.bar ?? 3} or more went into the drawing. ${oddsInWords(g.strength, g.half_life_days)}`
            : oddsInWords(g.strength, g.half_life_days)}
      </p>

      {said && <p className="text-sm text-rose-300 mt-3" role="status">{said}</p>}

      {!judged && (
        <Trivia
          g={g}
          manage={manage}
          entered={mine}
          editable={['open', 'judging', 'qualified'].includes(g.status) && got.draws.length === 0}
          onChanged={() => void load()}
        />
      )}

      {!answered && g.status === 'open' && g.self_entry && (
        <div className="mt-4">
          {closed && !mine ? (
            <p className="text-sm text-slate-400">Entries closed {when(g.entries_close_at!)}.</p>
          ) : (
            <button
              type="button"
              className={mine ? BUTTON : PRIMARY}
              disabled={busy || (closed && mine)}
              onClick={() => void act(() => enterGiveaway(id, !mine))}
            >
              {mine ? 'Take me out' : 'Put me in'}
            </button>
          )}
          {!closed && g.entries_close_at && (
            <p className="text-xs text-slate-400 mt-1">Entries close {when(g.entries_close_at)}.</p>
          )}
        </div>
      )}

      {manage && g.status === 'open' && (
        <section className={`${CARD} mt-6`} aria-label="Running it">
          <h2 className="text-sm font-semibold text-slate-200">Running it</h2>
          {editing ? (
            <GiveawayEditor
              id={id}
              initial={{
                title: g.title,
                prize: g.prize,
                details: g.details,
                winners: g.winners,
                eventOn: g.event_on ?? '',
                selfEntry: g.self_entry,
                entriesCloseAt: localInput(g.entries_close_at),
                strength: Number(g.strength),
                halfLifeDays: g.half_life_days,
                mode: g.mode ?? 'draw',
                picks: g.picks ?? 3,
                questions,
                bar: g.bar ?? 3,
              }}
              onDone={() => {
                setEditing(false);
                void load();
              }}
            />
          ) : (
            <div className="flex flex-wrap gap-2 mt-2">
              {!answered && (
                <button type="button" className={PRIMARY} disabled={busy || got.entrants.length === 0}
                        onClick={() => void draw()}>
                  Draw {g.winners === 1 ? 'the winner' : `${g.winners} winners`}
                </button>
              )}
              <button type="button" className={BUTTON} onClick={() => setEditing(true)}>
                Change it
              </button>
              <CancelButton id={id} busy={busy} act={act} />
            </div>
          )}
          {!answered && <AddEntrant id={id} onAdded={() => void load()} />}
        </section>
      )}

      {/* While it is open or judged, the judging comes first; once decided,
          after the winners, which are what people came to see. */}
      {answered && g.status !== 'drawn' && (
        <GiveawayJudging giveaway={g} canManage={manage} onChanged={() => void load()} />
      )}

      {/* The pool is set: draw from it, the same drawing as any other. */}
      {screened && manage && g.status === 'qualified' && (
        <section className={`${CARD} mt-6`} aria-label="Draw from the pool">
          <h2 className="text-sm font-semibold text-slate-200">Draw from the pool</h2>
          <p className="text-sm text-slate-300 mt-1">
            {pool.length} {pool.length === 1 ? 'entry' : 'entries'} averaged {g.bar} or more.
          </p>
          <button type="button" className={`${PRIMARY} mt-2`} disabled={busy || pool.length === 0} onClick={() => void draw()}>
            Draw {g.winners === 1 ? 'the winner' : `${g.winners} winners`}
          </button>
        </section>
      )}

      {pending && (
        <section className={`${CARD} mt-6`} aria-label="Drawing now">
          <h2 className="text-sm font-semibold text-slate-200">Drawing now</h2>
          <p className="text-sm text-slate-300 mt-1">
            Decided by drand round {pending.round.toLocaleString()} at {when(pending.round_at)}.
          </p>
          <RouteLink {...link({ kind: 'giveaways', giveaway: id, view: 'replay' })} className={`${PRIMARY} mt-3`}>
            Watch it
          </RouteLink>
        </section>
      )}

      {got.winners.length > 0 && (
        <section className="mt-6" aria-label={judged ? 'Who won' : 'Who was drawn'}>
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 className="text-sm font-semibold text-slate-200">{judged ? 'Who won' : 'Who was drawn'}</h2>
            {!judged && (
              <RouteLink {...link({ kind: 'giveaways', giveaway: id, view: 'replay' })} className="text-sm text-accent">
                Replay the drawing
              </RouteLink>
            )}
          </div>
          <ul className="mt-2 space-y-2">
            {got.winners.map((w) => (
              <li key={w.person} className={`${CARD} flex flex-wrap items-center justify-between gap-3`}>
                <span className="min-w-0">
                  <span className="block font-semibold text-slate-200 break-words">{w.name}</span>
                  <span className="block text-xs text-slate-400">
                    {judged && w.status === 'pending' ? 'Chosen, not yet confirmed' : WINNER_WORD[w.status]}
                    {!judged && got.draws.length > 1 && ` · drawing ${w.draw}`}
                  </span>
                </span>
                {manage && g.status !== 'cancelled' && (
                  <span className="flex flex-wrap gap-2">
                    {w.status !== 'accepted' && (
                      <button type="button" className={BUTTON} disabled={busy}
                              onClick={() => void act(() => decideWinner(id, w.person, 'accepted'))}>
                        Going
                      </button>
                    )}
                    {w.status !== 'declined' && (
                      <button type="button" className={BUTTON} disabled={busy}
                              onClick={() => void act(() => decideWinner(id, w.person, 'declined'))}>
                        Declined
                      </button>
                    )}
                  </span>
                )}
              </li>
            ))}
          </ul>
          {!judged && manage && g.status === 'drawn' && missing > 0 && undrawn > 0 && (
            <button type="button" className={`${PRIMARY} mt-3`} disabled={busy} onClick={() => void draw()}>
              Draw {missing === 1 ? 'a replacement' : `${missing} replacements`}
            </button>
          )}
          {judged && manage && g.status === 'drawn' && missing > 0 && undrawn > 0 && (
            offerTie ? (
              <div className="mt-3 space-y-2" role="group" aria-label="Settle who is next">
                <p className="text-sm text-amber-200">
                  A tie at {offerTie.points} points for the next place. Who gets it?
                </p>
                <div className="flex flex-wrap gap-2">
                  {offerTie.tied.map((t) => (
                    <button key={t.key} type="button" className={BUTTON} disabled={busy} onClick={() => void offer(t.key)}>
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <button type="button" className={`${PRIMARY} mt-3`} disabled={busy} onClick={() => void offer()}>
                Offer it to the next in the ranking
              </button>
            )
          )}
          {manage && g.status === 'drawn' && missing > 0 && undrawn === 0 && (
            <p className="text-sm text-slate-400 mt-3">Everybody who entered has been drawn.</p>
          )}
        </section>
      )}

      {answered && g.status === 'drawn' && (
        <GiveawayJudging giveaway={g} canManage={manage} onChanged={() => void load()} />
      )}

      {judged || (screened && (g.status === 'open' || g.status === 'judging'))
        ? <JudgedEntrants got={got} busy={busy} act={act} />
        : <Entrants got={screened ? { ...got, entrants: pool } : got} total={total} busy={busy} act={act} />}

      {got.draws.map((d) => (
        <DrawRecord key={d.id} giveaway={id} draw={d} />
      ))}

      <Log entries={got.log} />
    </div>
  );
}

/** Trivia for extra chances: the sessions that score them, what a point is
 *  worth, and -- for an organiser, until the drawing -- which sessions. */
function Trivia({
  g,
  manage,
  entered,
  editable,
  onChanged,
}: {
  g: Giveaway;
  manage: boolean;
  /** only entrants can play a giveaway's trivia */
  entered: boolean;
  editable: boolean;
  onChanged: () => void;
}) {
  const sessions = g.sessions ?? [];
  const bonus = Number(g.trivia_bonus ?? 1);
  // linked, but with no way to open by itself
  const unstarted = sessions.filter((x) => x.state === 'draft' && !x.opens_at);
  const [editing, setEditing] = useState(false);
  const [choices, setChoices] = useState<TriviaSession[] | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [worth, setWorth] = useState(String(bonus));
  const [said, setSaid] = useState('');
  const [busy, setBusy] = useState(false);

  async function open() {
    setEditing(true);
    setPicked(sessions.map((x) => x.id));
    setWorth(String(bonus));
    const got = await readTriviaChoices();
    if (got.ok) setChoices(got.sessions);
    else setSaid(got.reason);
  }
  async function save() {
    setBusy(true);
    const res = await setGiveawayTrivia(g.id, picked, Number(worth));
    setBusy(false);
    if (!res.ok) return setSaid(res.reason);
    setSaid('');
    setEditing(false);
    onChanged();
  }

  if (sessions.length === 0 && !(manage && editable)) return null;
  const example = (n: number) => `${1 + bonus * n}×`;
  return (
    <section className={`${CARD} mt-4 space-y-2`} aria-label="Trivia for extra chances">
      <h2 className="text-sm font-semibold text-slate-200">Trivia for extra chances</h2>
      {sessions.length > 0 ? (
        <>
          <p className="text-sm text-slate-300">
            Each point you score adds {bonus === 1 ? 'an extra ticket' : `${bonus} extra tickets`}: score 3 and your chance
            is {example(3)} what it would be. The trivia is for entrants only:{' '}
            {entered ? 'you are in, so play away.' : 'enter the giveaway first, then play.'}
          </p>
          <ul className="space-y-1">
            {sessions.map((x) => (
              <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-300">
                <span className="min-w-0 break-words">
                  {x.title}
                  <span className="text-xs text-slate-500">
                    {' '}
                    ·{' '}
                    {x.state === 'closed'
                      ? 'over'
                      : x.state === 'live'
                        ? 'on now'
                        : x.opens_at
                          ? `opens ${when(x.opens_at)}`
                          : 'not open yet'}
                    {x.closes_at && x.state !== 'closed' && `, closes ${when(x.closes_at)}`}
                  </span>
                </span>
                {x.state === 'live' && (entered || manage) && (
                  <a className={BUTTON} href={`/live/${x.id}`}>
                    Play
                  </a>
                )}
              </li>
            ))}
          </ul>
          <p className="text-xs text-slate-500">Points count as they stand when the drawing is made.</p>
          {/* Only an organiser can do anything about it, and they need to know
              how: a session with no opening time stays shut until it is started. */}
          {manage && unstarted.length > 0 && (
            <p className="text-xs text-amber-200">
              {unstarted.map((x) => x.title).join(', ')} {unstarted.length === 1 ? 'has' : 'have'} no opening time
              and {unstarted.length === 1 ? 'is' : 'are'} not started: open {unstarted.length === 1 ? 'it' : 'them'} under
              Sessions, or give {unstarted.length === 1 ? 'it' : 'them'} an opening time, so people can play.
            </p>
          )}
        </>
      ) : (
        <p className="text-sm text-slate-400">None yet. Link a trivia session and every point scored in it adds chances.</p>
      )}
      {manage && editable && !editing && (
        <button type="button" className={BUTTON} onClick={() => void open()}>
          {sessions.length > 0 ? 'Change the trivia' : 'Add trivia'}
        </button>
      )}
      {editing && (
        <div className="space-y-2 border-t border-white/10 pt-3">
          {choices === null ? (
            <p className="text-sm text-slate-400">Loading the sessions…</p>
          ) : choices.length === 0 ? (
            <p className="text-sm text-slate-400">There are no sessions yet. Build one under Sessions first.</p>
          ) : (
            <ul className="space-y-1 max-h-60 overflow-y-auto" aria-label="Sessions to link">
              {choices.map((x) => (
                <li key={x.id}>
                  <label className="flex items-center gap-2 text-sm text-slate-300">
                    <input
                      type="checkbox"
                      checked={picked.includes(x.id)}
                      onChange={(e) =>
                        setPicked((p) => (e.target.checked ? [...p, x.id] : p.filter((id) => id !== x.id)))
                      }
                    />
                    <span className="min-w-0 break-words">
                      {x.title}{' '}
                      <span className="text-xs text-slate-500">
                        · {x.mode === 'open' ? 'on your own time' : 'run live'},{' '}
                        {x.state === 'draft' ? 'still being built' : x.state === 'live' ? 'on now' : 'over'}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          <label className="block text-xs text-slate-400">
            Extra tickets for each point
            <input className={`${PERCENT} mt-1 block`} type="number" min={0} max={10} step={0.5} value={worth}
                   onChange={(e) => setWorth(e.target.value)} />
          </label>
          {said && <p className="text-xs text-rose-300" role="status">{said}</p>}
          <div className="flex flex-wrap gap-2">
            <button type="button" className={PRIMARY} disabled={busy || choices === null} onClick={() => void save()}>
              Save the trivia
            </button>
            <button type="button" className={BUTTON} onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function CancelButton({
  id,
  busy,
  act,
}: {
  id: string;
  busy: boolean;
  act: (run: () => Promise<{ ok: boolean; reason?: string }>) => Promise<boolean>;
}) {
  return (
    <button
      type="button"
      className={BUTTON}
      disabled={busy}
      onClick={() => {
        const why = window.prompt('Why is it being called off? This goes on the record.');
        if (why?.trim()) void act(() => cancelGiveaway(id, why.trim()));
      }}
    >
      Call it off
    </button>
  );
}

function JudgedEntrants({
  got,
  busy,
  act,
}: {
  got: GiveawayDetail;
  busy: boolean;
  act: (run: () => Promise<{ ok: boolean; reason?: string }>) => Promise<boolean>;
}) {
  const g = got.giveaway;
  return (
    <section className="mt-8" aria-label="Who is in it">
      <h2 className="text-sm font-semibold text-slate-200">Who has entered ({got.entrants.length})</h2>
      {got.entrants.length === 0 ? (
        <p className="text-sm text-slate-400 mt-2">Nobody yet.</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {got.entrants.map((e) => (
            <li key={e.person} className="rounded-xl border border-white/15 bg-white/5 px-4 py-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <span className="min-w-0 text-sm font-semibold text-slate-200 break-words">
                {e.name}
                {!e.linked && <span className="text-xs font-normal text-slate-500"> · no account</span>}
              </span>
              {got.can_manage && g.status === 'open' && (
                <button
                  type="button"
                  className="text-xs text-rose-300 hover:underline"
                  disabled={busy}
                  aria-label={`Take ${e.name} out`}
                  onClick={() => {
                    if (window.confirm(`Take ${e.name} out? Their answers go with them.`)) {
                      void act(() => removeEntrant(g.id, e.person));
                    }
                  }}
                >
                  Take out
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Entrants({
  got,
  total,
  busy,
  act,
}: {
  got: GiveawayDetail;
  total: number;
  busy: boolean;
  act: (run: () => Promise<{ ok: boolean; reason?: string }>) => Promise<boolean>;
}) {
  const g = got.giveaway;
  return (
    <section className="mt-8" aria-label="Who is in it">
      <h2 className="text-sm font-semibold text-slate-200">
        Who is in it ({got.entrants.length})
      </h2>
      <p className="text-xs text-slate-400 mt-1">
        {g.status === 'open'
          ? 'Chances as they stand today. They are fixed when the drawing is made.'
          : 'Chances as they would be today. Each drawing below keeps the ones it was made with.'}
      </p>
      {got.entrants.length === 0 ? (
        <p className="text-sm text-slate-400 mt-2">Nobody yet.</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {got.entrants.map((e) => (
            <li key={e.person} className="rounded-xl border border-white/15 bg-white/5 px-4 py-3 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-200 break-words">
                  {e.name}
                  {!e.linked && <span className="text-xs font-normal text-slate-500"> · no account</span>}
                </p>
                <p className="text-xs text-slate-400 break-words">
                  {e.attended.length === 0
                    ? 'Has not been to one yet'
                    : `Went to ${e.attended.map((a) => `${a.what} (${day(a.on)})`).join(', ')}`}
                </p>
                {(g.sessions ?? []).length > 0 && (
                  <p className="text-xs text-slate-400">
                    Trivia: {Number(e.trivia ?? 0)} {Number(e.trivia ?? 0) === 1 ? 'point' : 'points'}
                    {Number(e.trivia ?? 0) > 0 && ` · ${1 + Number(g.trivia_bonus ?? 1) * Number(e.trivia)}× the chance`}
                  </p>
                )}
                <p className="text-xs text-slate-500">
                  {e.self ? 'Entered themselves' : `Entered by ${e.entered_by ?? 'an organiser'}`} · {when(e.entered_at)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-slate-200 tabular-nums">{chance(e.weight, total)}</p>
                <p className="text-xs text-slate-500 tabular-nums"
                   title={`weight ${e.weight.toLocaleString()} of ${total.toLocaleString()}`}>
                  weight {e.weight.toLocaleString()}
                </p>
                {got.can_manage && g.status === 'open' && (
                  <button
                    type="button"
                    className="text-xs text-rose-300 hover:underline mt-1"
                    disabled={busy}
                    aria-label={`Take ${e.name} out`}
                    onClick={() => {
                      if (window.confirm(`Take ${e.name} out of the drawing?`)) {
                        void act(() => removeEntrant(g.id, e.person));
                      }
                    }}
                  >
                    Take out
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function AddEntrant({ id, onAdded }: { id: string; onAdded: () => void }) {
  const [said, setSaid] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <div className="mt-4">
      <h3 className="text-xs font-semibold text-slate-300 mb-1">Enter somebody</h3>
      <PeoplePicker
        label="Enter somebody"
        action="Enter"
        busy={busy}
        onPick={async (who) => {
          setBusy(true);
          const got = await addEntrant(id, who);
          setBusy(false);
          setSaid(got.ok ? '' : got.reason);
          if (got.ok) onAdded();
        }}
      />
      {said && <p className="text-xs text-rose-300 mt-1" role="status">{said}</p>}
    </div>
  );
}

/** One drawing, as committed and as revealed, and whether it checks out. */
function DrawRecord({ giveaway, draw }: { giveaway: string; draw: Draw }) {
  const [check, setCheck] = useState<Check | null>(null);
  const [checking, setChecking] = useState(false);
  async function run() {
    setChecking(true);
    setCheck(await checkDraw(giveaway, draw));
    setChecking(false);
  }
  const verdict =
    check &&
    (!check.fingerprint
      ? { ok: false, text: 'The fingerprint does not match the entrants on record.' }
      : !check.beacon
        ? { ok: null, text: 'Could not get this round from drand to check it.' }
        : check.randomness === false
          ? { ok: false, text: 'The randomness on record is not what drand published for this round.' }
          : check.winners === false
            ? { ok: false, text: 'The winners on record are not the ones drand’s randomness picks.' }
            : check.winners
              ? { ok: true, text: 'Checks out: same entrants, drand’s own randomness, the same winners.' }
              : { ok: true, text: `Fingerprint matches; drand’s round picks ${check.picks?.map((p) => p.name).join(', ')}.` });

  return (
    <section className={`${CARD} mt-6`} aria-label={`Drawing ${draw.seq}`}>
      <h2 className="text-sm font-semibold text-slate-200">
        Drawing {draw.seq}: {draw.reason}
      </h2>
      <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-xs">
        <dt className="text-slate-400">Committed</dt>
        <dd className="text-slate-300">{when(draw.committed_at)} by {draw.committed_by ?? 'an organiser'}</dd>
        <dt className="text-slate-400">Between</dt>
        <dd className="text-slate-300">
          {draw.entrants.length} {draw.entrants.length === 1 ? 'person' : 'people'}, drawing {draw.wanted}
        </dd>
        <dt className="text-slate-400">Fingerprint</dt>
        <dd className="text-slate-300 font-mono break-all">{draw.snapshot_hash}</dd>
        <dt className="text-slate-400">drand round</dt>
        <dd className="text-slate-300">
          <a className="text-accent hover:underline break-all"
             href={`https://api.drand.sh/${draw.chain}/public/${draw.round}`} target="_blank" rel="noreferrer">
            {draw.round.toLocaleString()}
          </a>{' '}
          at {when(draw.round_at)}
        </dd>
        <dt className="text-slate-400">Randomness</dt>
        <dd className="text-slate-300 font-mono break-all">{draw.randomness ?? 'not out yet'}</dd>
        {draw.winners && (
          <>
            <dt className="text-slate-400">Drew</dt>
            <dd className="text-slate-300 break-words">
              {draw.winners.map((w) => w.name).join(', ')}
              {draw.revealed_at && ` · ${when(draw.revealed_at)}`}
            </dd>
          </>
        )}
      </dl>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" className={BUTTON} disabled={checking} onClick={() => void run()}>
          {checking ? 'Checking…' : 'Check it against drand'}
        </button>
        {verdict && (
          <p role="status"
             className={`text-xs ${verdict.ok === false ? 'text-rose-300' : verdict.ok ? 'text-emerald-300' : 'text-slate-400'}`}>
            {verdict.text}
          </p>
        )}
      </div>
    </section>
  );
}

const ACTION_WORD: Record<string, string> = {
  created: 'set it up',
  changed: 'changed it',
  cancelled: 'called it off',
  entered: 'entered',
  withdrew: 'withdrew',
  removed: 'took out',
  committed: 'committed a drawing',
  revealed: 'revealed the drawing',
  accepted: 'marked going',
  declined: 'marked declined',
  pending: 'marked unconfirmed',
  granted: 'gave the running of giveaways to',
  revoked: 'took the running of giveaways from',
  'attendance recorded': 'recorded an attendance for',
  'attendance deleted': 'deleted an attendance for',
  renamed: 'renamed',
  'joined to account': 'joined an account to',
  'answers changed': 'changed their answers',
  'judge added': 'added a judge:',
  'judge removed': 'removed a judge:',
  'judging started': 'started the judging',
  ranked: 'ranked the entries',
  announced: 'announced the winners',
  offered: 'offered a place to',
  rated: 'rated the entries',
  'trivia set': 'set the trivia',
  'pool set': 'set the pool'
};

function describe(e: LogEntry): string {
  const d = e.detail as Record<string, string | number | boolean | string[] | null>;
  const who = e.actor ?? 'Somebody';
  switch (e.action) {
    case 'entered':
      return d.self ? `${d.name} entered` : `${who} entered ${d.name}`;
    case 'withdrew':
      return `${d.name} withdrew`;
    case 'removed':
    case 'accepted':
    case 'declined':
    case 'pending':
      return `${who} ${ACTION_WORD[e.action]} ${d.name}`;
    case 'committed':
      return `${who} committed drawing ${d.draw}: ${d.entrants} people, ${d.wanted} to draw, drand round ${Number(d.round).toLocaleString()}`;
    case 'revealed':
      return `Drawing ${d.draw} revealed: ${(d.winners as string[] | null)?.join(', ') ?? 'nobody'}`;
    case 'cancelled':
      return `${who} called it off: ${d.reason}`;
    case 'granted':
    case 'revoked':
    case 'attendance recorded':
    case 'attendance deleted':
      return `${who} ${ACTION_WORD[e.action]} ${d.name}${d.what ? `: ${d.what}, ${d.on}` : ''}`;
    case 'renamed':
      return `${who} renamed ${d.from} to ${d.to}`;
    case 'joined to account':
      return `${who} joined ${d.name} to ${d.account}'s account`;
    case 'answers changed':
      return d.self ? `${d.name} changed their answers` : `${who} changed ${d.name}'s answers`;
    case 'judge added':
    case 'judge removed':
    case 'offered':
      return `${who} ${ACTION_WORD[e.action]} ${d.name}`;
    case 'judging started':
      return `${who} closed the entries and started the judging: ${d.entries} entries, ${d.judges} judges`;
    case 'ranked':
      return `${d.name} ranked ${d.count} ${d.count === 1 ? 'entry' : 'entries'}`;
    case 'trivia set':
      return `${who} set the trivia: ${((d.sessions as string[] | null) ?? []).join(', ') || 'none'}, ${d.bonus} extra ${Number(d.bonus) === 1 ? 'ticket' : 'tickets'} a point`;
    case 'rated':
      return `${d.name} rated ${d.count} ${d.count === 1 ? 'entry' : 'entries'}`;
    case 'pool set':
      return `${who} set the pool at an average of ${d.bar}: ${d.in} of ${d.of} entries in the drawing`;
    case 'announced':
      return `${who} announced the winners: ${(d.winners as string[] | null)?.join(', ') ?? 'nobody'}${d.tie_settled ? ' (a tie settled by the organiser)' : ''}`;
    default:
      return `${who} ${ACTION_WORD[e.action] ?? e.action}`;
  }
}

function Log({ entries }: { entries: LogEntry[] }) {
  if (entries.length === 0) return null;
  return (
    <section className="mt-8" aria-label="The record">
      <h2 className="text-sm font-semibold text-slate-200">The record</h2>
      <p className="text-xs text-slate-400 mt-1">Everything that has happened to it. Nothing here can be changed.</p>
      <ol className="mt-2 space-y-1">
        {entries.map((e, i) => (
          <li key={i} className="text-xs text-slate-300 flex flex-wrap gap-x-3">
            <span className="text-slate-500 tabular-nums">{when(e.at)}</span>
            <span className="min-w-0 break-words">{describe(e)}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

function History({ link }: { link: GiveawayLink }) {
  const [people, setPeople] = useState<HistoryPerson[] | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [problem, setProblem] = useState('');
  const [said, setSaid] = useState('');
  const [busy, setBusy] = useState(false);
  const [on, setOn] = useState(today());
  const [what, setWhat] = useState('');

  const load = useCallback(async () => {
    const got = await readGiveawayHistory();
    if (!got.ok) return setProblem(got.reason === 'not allowed' ? 'Sign in to see the giveaways.' : got.reason);
    setPeople(got.people);
    setLog(got.log);
    setCanManage(got.can_manage);
  }, []);
  useEffect(() => void load(), [load]);

  async function act(run: () => Promise<{ ok: boolean; reason?: string }>) {
    setBusy(true);
    const res = await run();
    setBusy(false);
    setSaid(res.ok ? '' : (res.reason ?? 'That did not work'));
    await load();
  }

  if (problem) return <p className="max-w-2xl mx-auto px-4 py-10 text-sm text-slate-400">{problem}</p>;
  if (!people) return <Waiting what="the history" onRetry={() => void load()} />;

  const sorted = [...people].sort(
    (a, b) => b.attended.length - a.attended.length || a.name.localeCompare(b.name)
  );

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <RouteLink {...link({ kind: 'giveaways', giveaway: null, view: 'page' })} className="text-sm text-accent">
        ← All giveaways
      </RouteLink>
      <h1 className="text-xl font-semibold text-slate-200 mt-3">Who has been to what</h1>
      <p className="text-sm text-slate-400 mt-1">
        Everybody a drawing has ever named, and what they went to. The chance shown is against
        somebody who has never been, with the usual settings: a past attendance counts half as
        much after a year.
      </p>

      {canManage && (
        <section className={`${CARD} mt-4 space-y-2`} aria-label="Record an attendance">
          <h2 className="text-sm font-semibold text-slate-200">Record an attendance</h2>
          <p className="text-xs text-slate-400">
            For tickets given out before this site kept track, or some other way. Pick the person
            after filling in what and when.
          </p>
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
            <input className={FIELD} value={what} placeholder="e.g. Brewers vs Cubs" aria-label="What they went to"
                   onChange={(e) => setWhat(e.target.value)} />
            <input className={FIELD} type="date" value={on} aria-label="When"
                   onChange={(e) => setOn(e.target.value)} />
          </div>
          <PeoplePicker
            label="Who went"
            action="Record"
            busy={busy || !what.trim() || !on}
            onPick={(who) => void act(() => recordAttendance(who, on, what.trim()))}
          />
          {said && <p className="text-xs text-rose-300" role="status">{said}</p>}
        </section>
      )}

      {sorted.length === 0 ? (
        <p className="text-sm text-slate-400 mt-6">Nobody yet.</p>
      ) : (
        <ul className="mt-6 space-y-2">
          {sorted.map((p) => (
            <HistoryRow key={p.person} p={p} canManage={canManage} busy={busy} act={act} />
          ))}
        </ul>
      )}

      {log.length > 0 && <Log entries={log} />}
    </div>
  );
}

function HistoryRow({
  p,
  canManage,
  busy,
  act,
}: {
  p: HistoryPerson;
  canManage: boolean;
  busy: boolean;
  act: (run: () => Promise<{ ok: boolean; reason?: string }>) => Promise<void>;
}) {
  const [joining, setJoining] = useState(false);
  return (
    <li className="rounded-xl border border-white/15 bg-white/5 px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-sm font-semibold text-slate-200 min-w-0 break-words">
          {p.name}
          {!p.linked && <span className="text-xs font-normal text-slate-500"> · no account</span>}
        </p>
        <p className="text-xs text-slate-400 tabular-nums">
          {p.attended.length} {p.attended.length === 1 ? 'attendance' : 'attendances'} · entered {p.entries} ·{' '}
          chance {Math.round(p.weight / 10_000)}%
        </p>
      </div>
      {p.attended.length > 0 && (
        <ul className="mt-1 space-y-0.5">
          {p.attended.map((a) => (
            <li key={a.id} className="text-xs text-slate-400 flex flex-wrap gap-x-2">
              <span className="tabular-nums">{day(a.on)}</span>
              <span className="min-w-0 break-words">{a.what}</span>
              {a.source === 'manual' && <span className="text-slate-500">recorded by hand</span>}
              {canManage && a.source === 'manual' && (
                <button type="button" className="text-rose-300 hover:underline" disabled={busy}
                        aria-label={`Delete ${a.what} for ${p.name}`}
                        onClick={() => {
                          if (window.confirm(`Delete ${a.what} (${a.on}) from ${p.name}'s history?`)) {
                            void act(() => deleteAttendance(a.id));
                          }
                        }}>
                  delete
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canManage && (
        <div className="mt-2 flex flex-wrap gap-3 text-xs">
          <button type="button" className="text-accent hover:underline" disabled={busy}
                  onClick={() => {
                    const name = window.prompt('Their name', p.name);
                    if (name?.trim() && name.trim() !== p.name) void act(() => updatePerson(p.person, { name: name.trim() }));
                  }}>
            Rename
          </button>
          {!p.linked && (
            <button type="button" className="text-accent hover:underline" onClick={() => setJoining((j) => !j)}>
              Join to their account
            </button>
          )}
        </div>
      )}
      {joining && <JoinAccount person={p} busy={busy} act={act} />}
    </li>
  );
}

/** A typed name, joined to the account its owner has since signed in with. */
function JoinAccount({
  person,
  busy,
  act,
}: {
  person: HistoryPerson;
  busy: boolean;
  act: (run: () => Promise<{ ok: boolean; reason?: string }>) => Promise<void>;
}) {
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<Found[]>([]);
  useEffect(() => {
    const t = window.setTimeout(() => void findGiveawayPeople(query).then(setFound), 250);
    return () => window.clearTimeout(t);
  }, [query]);
  const accounts = found.filter((f) => f.user);
  return (
    <div className="mt-2">
      <input className={FIELD} value={query} placeholder="Their name or address"
             aria-label={`Account for ${person.name}`} onChange={(e) => setQuery(e.target.value)} />
      <ul className="mt-1 space-y-1">
        {accounts.map((f) => (
          <li key={f.user!} className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-300">
            <span className="min-w-0 break-words">
              {f.name} <span className="text-xs text-slate-500">{f.email}</span>
            </span>
            <button type="button" className={BUTTON} disabled={busy}
                    onClick={() => {
                      const merge = f.person ? ' Their own history will be added to this one.' : '';
                      if (window.confirm(`Join ${person.name} to ${f.email}?${merge}`)) {
                        void act(() => updatePerson(person.person, { user: f.user! }));
                      }
                    }}>
              Join
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
