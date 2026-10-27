// The top of the home page: what organisers have featured, one card each --
// what kind of thing, its picture, its title, their blurb, where it stands,
// and a button. Side by side on a desk; swiped sideways on a phone.
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
  useEffect(() => {
    let alive = true;
    // Signed out, the server says no, and there is simply no strip.
    void readHomeFeatures().then(
      (got) => alive && setFeatures(got.ok && Array.isArray(got.features) ? got.features : [])
    );
    return () => {
      alive = false;
    };
  }, []);

  const shown = features.filter((f) => f.kind !== 'session' || (sessionsOn && sessionAllowed(f.ref)));
  if (shown.length === 0) return null;
  const one = shown.length === 1;

  return (
    <section aria-label="Featured" className="mb-6">
      <ul className={`flex gap-3 overflow-x-auto snap-x snap-mandatory pb-1
                      ${one ? '' : 'sm:grid sm:grid-cols-2 sm:overflow-visible'}`}>
        {shown.map((f) => (
          <li key={f.id} className={`snap-start shrink-0 ${one ? 'w-full' : 'w-[85%] sm:w-auto'}`}>
            <Card f={f} link={link} />
          </li>
        ))}
      </ul>
    </section>
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
