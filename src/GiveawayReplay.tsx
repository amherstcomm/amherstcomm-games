// A drawing, played out: for the room, for a recording, or for anybody who
// wants to watch it again.
//
// Nothing here is staged. The page asks drand for the round the drawing named,
// redoes the pick itself (pickWinners), and lands on whoever that picks -- so
// what plays out is the drawing, not a picture of one. The spin before each
// landing is decoration, but deterministic decoration: it is worked out from
// the pick's own hash, so every replay of a drawing looks the same.
//
// While a drawing is waiting on its round this is also where it happens: the
// countdown runs to the round, and once drand has published it the organiser's
// copy of the page records it on the server.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Waiting from '@/Waiting';
import RouteLink from '@/RouteLink';
import {
  chance,
  checkDraw,
  fetchRound,
  readGiveaway,
  revealDraw,
  spinPath,
  type Check,
  type Draw,
  type GiveawayDetail,
  type Pick,
} from '@/giveaways';
import type { GiveawayLink } from '@/GiveawaysView';

const BUTTON =
  'inline-flex items-center justify-center px-3 h-9 rounded-lg text-sm font-semibold ' +
  'bg-white/10 border border-white/15 text-slate-200 hover:bg-white/15 disabled:opacity-50';
const PRIMARY =
  'inline-flex items-center justify-center px-5 h-11 rounded-lg text-base font-semibold ' +
  'bg-accent text-slate-950 hover:brightness-110 disabled:opacity-50';

type Phase =
  | { at: 'ready' }
  | { at: 'countdown'; until: number }
  | { at: 'beacon' }
  | { at: 'spinning'; pick: number; lit: number }
  | { at: 'landed'; pick: number }
  | { at: 'done' };

const sleep = (ms: number) => new Promise((r) => window.setTimeout(r, ms));
const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export default function GiveawayReplay({ id, link }: { id: string; link: GiveawayLink }) {
  const [got, setGot] = useState<GiveawayDetail | null>(null);
  const [problem, setProblem] = useState('');
  const [which, setWhich] = useState<number | null>(null);
  const load = useCallback(async () => {
    const res = await readGiveaway(id);
    if (!res.ok) return setProblem(res.reason === 'not allowed' ? 'Sign in to see the giveaways.' : res.reason);
    setGot(res);
  }, [id]);
  useEffect(() => void load(), [load]);

  if (problem) return <p className="max-w-2xl mx-auto px-4 py-10 text-sm text-slate-400">{problem}</p>;
  if (!got) return <Waiting what="the drawing" onRetry={() => void load()} />;
  if (got.draws.length === 0) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-10">
        <p className="text-sm text-slate-400">This one has not been drawn yet.</p>
        <RouteLink {...link({ kind: 'giveaways', giveaway: id, view: 'page' })} className="text-sm text-accent">
          Back to {got.giveaway.title}
        </RouteLink>
      </div>
    );
  }
  const draw = got.draws.find((d) => d.seq === which) ?? got.draws[got.draws.length - 1];
  return (
    <div className="px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <RouteLink {...link({ kind: 'giveaways', giveaway: id, view: 'page' })} className="text-sm text-accent">
          ← {got.giveaway.title}
        </RouteLink>
        {got.draws.length > 1 && (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Which drawing">
            {got.draws.map((d) => (
              <button key={d.id} type="button" className={BUTTON} aria-pressed={d.seq === draw.seq}
                      onClick={() => setWhich(d.seq)}>
                Drawing {d.seq}
              </button>
            ))}
          </div>
        )}
      </div>
      <Stage key={draw.id} got={got} draw={draw} onRecorded={() => void load()} />
    </div>
  );
}

function Stage({ got, draw, onRecorded }: { got: GiveawayDetail; draw: Draw; onRecorded: () => void }) {
  const g = got.giveaway;
  const live = !draw.randomness;
  const stageRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<Phase>(
    live ? { at: 'countdown', until: Date.parse(draw.round_at) } : { at: 'ready' }
  );
  const [now, setNow] = useState(Date.now());
  const [check, setCheck] = useState<Check | null>(null);
  const [note, setNote] = useState('');
  const [revealed, setRevealed] = useState<string | null>(draw.randomness);
  const running = useRef(false);

  const sorted = useMemo(
    () => [...draw.entrants].sort((a, b) => (a.person < b.person ? -1 : a.person > b.person ? 1 : 0)),
    [draw.entrants]
  );

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(t);
  }, []);

  /** The picks to play: the ones drand's own round makes, or failing that the
   *  ones on record. */
  const picks: Pick[] | null = check?.picks ?? draw.winners;
  const pickedSoFar = (upTo: number) => (picks ?? []).filter((p) => p.pick <= upTo).map((p) => p.person);

  const play = useCallback(
    async (checked: Check | null) => {
      if (running.current) return;
      running.current = true;
      const order = checked?.picks ?? draw.winners ?? [];
      setPhase({ at: 'beacon' });
      await sleep(reducedMotion() ? 600 : 2200);
      for (const p of order) {
        const left = sorted.filter((e) => !order.some((o) => o.pick < p.pick && o.person === e.person));
        const landOn = left.findIndex((e) => e.person === p.person);
        if (!reducedMotion()) {
          const path = spinPath(p.hash, left.length, landOn);
          for (let i = 0; i < path.length; i++) {
            const tile = sorted.indexOf(left[path[i]]);
            setPhase({ at: 'spinning', pick: p.pick, lit: tile });
            const t = i / Math.max(1, path.length - 1);
            await sleep(45 + 420 * t * t * t);
          }
        }
        setPhase({ at: 'landed', pick: p.pick });
        await sleep(reducedMotion() ? 800 : 2600);
      }
      setPhase({ at: 'done' });
      running.current = false;
    },
    [draw.winners, sorted]
  );

  // A drawing waiting on its round: at the round, ask drand until it answers,
  // check it, record it if this is an organiser, and play it.
  useEffect(() => {
    if (!live) return;
    let alive = true;
    void (async () => {
      const wait = Date.parse(draw.round_at) - Date.now();
      if (wait > 0) await sleep(wait + 300);
      for (let tries = 0; alive && tries < 60; tries++) {
        const beacon = await fetchRound(draw.chain, draw.round);
        if (beacon) break;
        await sleep(1500);
      }
      if (!alive) return;
      const checked = await checkDraw(g.id, draw);
      if (!alive) return;
      setCheck(checked);
      if (!checked.beacon) {
        setNote('Could not reach drand. This page will try again if you reload it.');
        return;
      }
      setRevealed(checked.beacon.randomness);
      if (got.can_manage) {
        const res = await revealDraw(draw.id, checked.beacon);
        if (!res.ok && res.reason !== 'that drawing has been revealed') setNote(`Not recorded: ${res.reason}`);
      } else {
        setNote('drand has published the round. The organisers’ record of it follows.');
      }
      await play(checked);
      if (alive) onRecorded();
    })();
    return () => {
      alive = false;
    };
    // once per drawing; the stage is keyed by it
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function replay() {
    const checked = check ?? (await checkDraw(g.id, draw));
    setCheck(checked);
    setPhase({ at: 'countdown', until: Date.now() + 3000 });
    await sleep(3000);
    await play(checked);
  }

  const fullscreen = () => {
    const el = stageRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen?.();
  };

  const current = phase.at === 'spinning' || phase.at === 'landed' ? phase.pick : phase.at === 'done' ? Infinity : 0;
  const won = new Set(pickedSoFar(phase.at === 'spinning' ? current - 1 : current));
  const landed = phase.at === 'landed' ? picks?.find((p) => p.pick === phase.pick) : null;
  const shownRandomness = revealed ?? check?.beacon?.randomness ?? null;
  const left = Math.max(0, Math.ceil(((phase.at === 'countdown' ? phase.until : 0) - now) / 1000));
  const remainingTotal = (pick: number) =>
    sorted.filter((e) => !pickedSoFar(pick - 1).includes(e.person)).reduce((s, e) => s + e.weight, 0);
  const shareTotal = phase.at === 'spinning' || phase.at === 'landed' ? remainingTotal(phase.pick) : draw.total;

  const mismatch =
    check &&
    (check.fingerprint === false || check.randomness === false || check.winners === false);

  return (
    <div ref={stageRef} className="mt-4 rounded-2xl border border-white/15 bg-slate-950 p-5 sm:p-8 overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wider text-slate-400">
            Drawing {draw.seq} · {draw.reason}
          </p>
          <h1 className="text-2xl sm:text-4xl font-bold text-white mt-1 break-words">{g.title}</h1>
          {g.prize && <p className="text-base sm:text-lg text-slate-300 mt-1 break-words">{g.prize}</p>}
        </div>
        <button type="button" className={BUTTON} onClick={fullscreen}>
          Full screen
        </button>
      </div>

      <div className="mt-6 min-h-[7rem]" aria-live="polite">
        {phase.at === 'ready' && (
          <div className="flex flex-wrap items-center gap-4">
            <button type="button" className={PRIMARY} onClick={() => void replay()}>
              Play the drawing
            </button>
            <p className="text-sm text-slate-400">
              {draw.entrants.length} people, {draw.wanted} to draw. Played from drand round{' '}
              {draw.round.toLocaleString()}.
            </p>
          </div>
        )}
        {phase.at === 'countdown' && (
          <div>
            <p className="text-sm text-slate-400">
              {live
                ? `Decided by drand round ${draw.round.toLocaleString()}, which nobody can know until it is published.`
                : 'Here it comes.'}
            </p>
            <p className="text-6xl sm:text-8xl font-bold text-white tabular-nums mt-2">
              {left > 0 ? left : '…'}
            </p>
          </div>
        )}
        {(phase.at === 'beacon' || phase.at === 'spinning' || phase.at === 'landed' || phase.at === 'done') && (
          <div>
            <p className="text-sm text-slate-400">drand round {draw.round.toLocaleString()} randomness</p>
            <p className="font-mono text-sm sm:text-lg text-accent break-all mt-1">{shownRandomness}</p>
          </div>
        )}
        {landed && (
          <div className="mt-4" role="status">
            <p className="text-sm text-slate-400">
              {draw.wanted > 1 ? `Winner ${landed.pick} of ${draw.wanted}` : 'The winner'}
            </p>
            <p className="text-4xl sm:text-6xl font-bold text-white break-words">{landed.name}</p>
            <p className="text-xs text-slate-500 font-mono break-all mt-2">
              sha256(randomness:fingerprint:{landed.pick}) = {landed.hash.slice(0, 13)}… → 0x
              {landed.hash.slice(0, 13)} mod {landed.total.toLocaleString()} = {landed.target.toLocaleString()}
            </p>
          </div>
        )}
        {phase.at === 'done' && picks && (
          <div className="mt-4">
            <p className="text-sm text-slate-400">{picks.length === 1 ? 'The winner' : 'The winners'}</p>
            <p className="text-3xl sm:text-5xl font-bold text-white break-words">
              {picks.map((p) => p.name).join(', ')}
            </p>
            <button type="button" className={`${BUTTON} mt-4`} onClick={() => {
              running.current = false;
              void replay();
            }}>
              Play it again
            </button>
          </div>
        )}
      </div>

      {note && <p className="text-sm text-slate-300 mt-3">{note}</p>}
      {mismatch && (
        <p className="text-sm text-rose-300 mt-3" role="alert">
          {check!.fingerprint === false
            ? 'The entrants on record do not match this drawing’s fingerprint.'
            : check!.randomness === false
              ? 'The randomness on record is not what drand published. This shows what drand’s round picks.'
              : 'The winners on record are not the ones drand’s round picks. This shows what drand’s round picks.'}
        </p>
      )}

      <ul className="mt-6 grid gap-2 grid-cols-[repeat(auto-fill,minmax(10rem,1fr))]" aria-label="In the drawing">
        {sorted.map((e, i) => {
          const isLit = phase.at === 'spinning' && phase.lit === i;
          const isWon = won.has(e.person) || (landed?.person === e.person);
          const out = !isWon && phase.at === 'done';
          return (
            <li
              key={e.person}
              className={
                'rounded-xl border px-3 py-2 transition-colors duration-75 min-w-0 ' +
                (isLit
                  ? 'border-accent bg-accent text-slate-950'
                  : isWon
                    ? 'border-accent bg-accent/20 text-white'
                    : out
                      ? 'border-white/10 bg-white/5 text-slate-400'
                      : 'border-white/15 bg-white/5 text-slate-200')
              }
            >
              <span className="block text-sm font-semibold break-words">{e.name}</span>
              <span className={`block text-xs tabular-nums ${isLit ? 'text-slate-900' : 'text-slate-400'}`}>
                {isWon ? 'drawn' : chance(e.weight, shareTotal)}
              </span>
            </li>
          );
        })}
      </ul>

      <dl className="mt-6 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-xs">
        <dt className="text-slate-500">Fingerprint</dt>
        <dd className="text-slate-400 font-mono break-all">{draw.snapshot_hash}</dd>
        <dt className="text-slate-500">Committed</dt>
        <dd className="text-slate-400">{new Date(draw.committed_at).toLocaleString()}</dd>
        <dt className="text-slate-500">drand round</dt>
        <dd className="text-slate-400">
          {draw.round.toLocaleString()} at {new Date(draw.round_at).toLocaleString()}
        </dd>
      </dl>
    </div>
  );
}
