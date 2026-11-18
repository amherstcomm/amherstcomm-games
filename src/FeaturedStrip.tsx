// "Happening now", on the home page (the layout spec): what organisers have
// featured, one card each -- what kind of thing, in that kind's colour, its
// picture if it has one, its title, their blurb, where it stands, and the way
// in. Two across on a desk, one under another on a phone.
//
// This week's whiteboard question goes first, by itself: it is up every week
// there is one, so nobody has to remember to feature it. Nothing happening,
// and the section is not drawn.
import { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import RouteLink from '@/RouteLink';
import {
  KIND_WORD,
  type FeatureKind,
  cardWords,
  featureRoute,
  pictureLink,
  readHomeFeatures,
  type Feature,
  type FeaturePage,
} from '@/featured';
import { AvatarStack } from '@/Avatar';
import { answerChoice, answered, readBoard, type Board } from '@/whiteboard';

export default function FeaturedStrip({
  link,
  sessionsOn,
  sessionAllowed = () => true,
}: {
  link: (p: FeaturePage) => { to: string; onGo: () => void };
  /** sessions switched off for the site: no trivia cards either */
  sessionsOn: boolean;
  /** whether this session may be joined just now -- a tournament holding the
   *  site refuses most of them, and a card for one would lead to a refusal */
  sessionAllowed?: (id: string) => boolean;
}) {
  const [features, setFeatures] = useState<Feature[]>([]);
  const [board, setBoard] = useState<Board | null>(null);
  useEffect(() => {
    let alive = true;
    // Signed out, the server says no, and there is simply no strip.
    void readHomeFeatures().then(
      (got) => alive && setFeatures(got.ok && Array.isArray(got.features) ? got.features : [])
    );
    void readBoard().then((got) => alive && setBoard(got.ok && got.question ? got : null));
    return () => {
      alive = false;
    };
  }, []);

  const shown = features.filter((f) => f.kind !== 'session' || (sessionsOn && sessionAllowed(f.ref)));
  const total = shown.length + (board ? 1 : 0);
  if (total === 0) return null;

  return (
    <section aria-labelledby="happening-heading">
      <h2 id="happening-heading" className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
        Happening now
      </h2>
      <ul className="grid gap-3 sm:grid-cols-2">
        {board && (
          <li>
            <BoardCard board={board} link={link}
                       onAnswered={() => void readBoard().then((got) => setBoard(got.ok && got.question ? got : null))} />
          </li>
        )}
        {shown.map((f) => (
          <li key={f.id}>
            <Card f={f} link={link} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Each kind's colour, on its label: so a live session, the thing with a
 *  clock on it, stands out from a giveaway at a glance -- and never by colour
 *  alone, since the label says what it is. */
const KIND_TONE: Record<FeatureKind, string> = {
  session: 'text-violet-300',
  giveaway: 'text-rose-300',
  contest: 'text-sky-300',
  tournament: 'text-sky-300',
  auction: 'text-amber-300',
};
const CARD = 'h-full flex flex-col rounded-2xl border bg-slate-900 overflow-hidden';
const GO = 'inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:underline';

/** This week's whiteboard question. A pick-an-answer one is answered right
 *  here, and once it is, the card is the board: the pictures under each
 *  choice, with nothing more to press. A written one needs the page to type
 *  on, and shows everybody's pictures once answered. */
function BoardCard({ board, link, onAnswered }: {
  board: Board;
  link: (p: FeaturePage) => { to: string; onGo: () => void };
  onAnswered: () => void;
}) {
  const q = board.question!;
  const mine = board.mine;
  const answers = board.answers ?? null;
  const n = board.count ?? 0;
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const full = link({ kind: 'whiteboard', question: null });
  const picks = (choice: number | null) =>
    (answers ?? [])
      .filter((a) => choice === null || a.choice === choice)
      .map((a) => ({ option: String(a.choice ?? ''), user: a.user, name: a.name, avatar: a.avatar }));

  return (
    <article className={`${CARD} border-white/10`} aria-label="This week’s question">
      <div className="flex-1 flex flex-col gap-2 p-4">
        <p className="text-xs font-semibold text-accent">Whiteboard · this week</p>
        <h3 className="text-base font-semibold text-white break-words">{q.prompt}</h3>

        {answers ? (
          q.kind === 'choice' ? (
            <ul className="space-y-1.5" aria-label="Who picked what">
              {q.options.map((o, k) => {
                const here = picks(k);
                return (
                  <li key={k} className="flex items-center justify-between gap-2 min-h-8">
                    <span className={`text-sm ${mine?.choice === k ? 'font-semibold text-emerald-300' : 'text-slate-200'}`}>
                      {o} <span className="text-xs text-slate-400 tabular-nums">{here.length}</span>
                    </span>
                    <AvatarStack picks={here} max={6} />
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-slate-400">{answered(answers.length)}</span>
              <AvatarStack picks={picks(null)} max={8} />
            </div>
          )
        ) : q.kind === 'choice' ? (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Your answer">
            {q.options.map((o, k) => (
              <button key={k} type="button" disabled={busy}
                      className="px-3 h-9 rounded-full text-sm font-semibold border bg-white/5 border-white/20 text-slate-200 hover:bg-white/15 disabled:opacity-50"
                      onClick={async () => {
                        setBusy(true);
                        const res = await answerChoice(q.id, k);
                        setBusy(false);
                        if (!res.ok) return setProblem(res.reason ?? 'That did not go in');
                        onAnswered();
                      }}>
                {o}
              </button>
            ))}
          </div>
        ) : null}

        {problem && <p className="text-xs text-rose-300" role="status">{problem}</p>}
        {!answers && (
          <p className="text-xs text-slate-400">{n > 0 ? `${answered(n)}. Answer to see who said what.` : 'Be the first to answer.'}</p>
        )}

        <div className="mt-auto pt-1">
          {!answers && q.kind === 'text' ? (
            <RouteLink {...full} className={GO}>
              Answer
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </RouteLink>
          ) : (
            <RouteLink {...full} className="text-xs text-accent hover:underline">
              {answers && q.kind === 'text' ? 'Read the answers' : 'The whiteboard'}
            </RouteLink>
          )}
        </div>
      </div>
    </article>
  );
}

function Card({ f, link }: { f: Feature; link: (p: FeaturePage) => { to: string; onGo: () => void } }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    if (f.image) void pictureLink(f.image).then((u) => alive && setUrl(u));
    return () => {
      alive = false;
    };
  }, [f.image]);
  const { status, action } = cardWords(f);
  const live = f.kind === 'session' && f.item.state === 'live';
  return (
    <article className={`${CARD} ${live ? 'border-violet-400/50 bg-violet-400/10' : 'border-white/10'}`}>
      {f.image && (
        <div className="aspect-[16/9] bg-white/5">
          {url && <img src={url} alt="" className="w-full h-full object-cover" />}
        </div>
      )}
      <div className="flex-1 flex flex-col gap-1 p-4">
        <p className={`text-xs font-semibold ${KIND_TONE[f.kind]}`}>
          {live ? `LIVE · ${KIND_WORD[f.kind]}` : KIND_WORD[f.kind]}
        </p>
        <h3 className="text-base font-semibold text-white break-words">{f.item.title}</h3>
        {f.blurb && <p className="text-sm text-slate-300 break-words">{f.blurb}</p>}
        <p className="text-xs text-slate-400">{status}</p>
        <div className="mt-auto pt-2">
          <RouteLink {...link(featureRoute(f))} className={GO}>
            {action}
            <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </RouteLink>
        </div>
      </div>
    </article>
  );
}
