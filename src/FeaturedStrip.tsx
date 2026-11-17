// The top of the home page: what organisers have featured, one card each --
// what kind of thing, its picture, its title, their blurb, where it stands,
// and a button. Side by side on a desk; swiped sideways on a phone.
//
// This week's whiteboard question goes first, by itself: it is up every week
// there is one, so nobody has to remember to feature it.
import { useEffect, useState } from 'react';
import RouteLink from '@/RouteLink';
import {
  KIND_WORD,
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
  const one = total === 1;

  return (
    <section aria-label="Featured" className="mb-6">
      <ul className={`flex gap-3 overflow-x-auto snap-x snap-mandatory pb-1
                      ${one ? '' : 'sm:grid sm:grid-cols-2 sm:overflow-visible'}`}>
        {board && (
          <li className={`snap-start shrink-0 ${one ? 'w-full' : 'w-[85%] sm:w-auto'}`}>
            <BoardCard board={board} link={link}
                       onAnswered={() => void readBoard().then((got) => setBoard(got.ok && got.question ? got : null))} />
          </li>
        )}
        {shown.map((f) => (
          <li key={f.id} className={`snap-start shrink-0 ${one ? 'w-full' : 'w-[85%] sm:w-auto'}`}>
            <Card f={f} link={link} />
          </li>
        ))}
      </ul>
    </section>
  );
}

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
    <article className="h-full flex flex-col rounded-xl border border-accent/30 bg-accent/5 overflow-hidden"
             aria-label="This week’s question">
      <div className="flex-1 flex flex-col gap-2 p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-accent">This week’s question</p>
        <h2 className="text-base font-semibold text-white break-words">{q.prompt}</h2>

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
            <RouteLink {...full}
                       className="inline-flex items-center px-4 h-10 rounded-lg text-sm font-semibold bg-accent text-slate-950 hover:brightness-110">
              Answer
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
  return (
    <article className="h-full flex flex-col rounded-xl border border-accent/30 bg-accent/5 overflow-hidden">
      {f.image && (
        <div className="aspect-[16/9] bg-white/5">
          {url && <img src={url} alt="" className="w-full h-full object-cover" />}
        </div>
      )}
      <div className="flex-1 flex flex-col gap-1 p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-accent">{KIND_WORD[f.kind]}</p>
        <h2 className="text-base font-semibold text-white break-words">{f.item.title}</h2>
        {f.blurb && <p className="text-sm text-slate-300 break-words">{f.blurb}</p>}
        <p className="text-xs text-slate-400">{status}</p>
        <div className="mt-auto pt-2">
          <RouteLink {...link(featureRoute(f))}
                     className="inline-flex items-center px-4 h-10 rounded-lg text-sm font-semibold bg-accent text-slate-950 hover:brightness-110">
            {action}
          </RouteLink>
        </div>
      </div>
    </article>
  );
}
