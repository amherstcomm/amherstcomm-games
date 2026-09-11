// The tournament's own page: what round is on, and its games.
//
// Each game opens at /tournament/<game>, where it is played inside the round's
// channel -- its own board, kept and recorded apart from the daily, one attempt
// and the first finish counts. This page is the way in, and says plainly when
// nothing is running, which is most of the year.
import { Trophy } from 'lucide-react';
import RouteLink from '@/RouteLink';
import { DIFFICULTY_LABEL } from '@/difficulty';
import { MODE_SLUG, GAME_NAME, type Mode } from '@/games';
import { roundGameName } from '@/tournaments';
import type { CurrentRound } from '@/rounds';
import { FEED_NAME } from '@/games';
import type { Route } from '@/routes';

/** The mode whose board is published under this feed name. */
function modeOfFeed(feed: string): Mode | null {
  const hit = (Object.entries(FEED_NAME) as [Mode, string][]).find(([, f]) => f === feed);
  return hit ? hit[0] : null;
}

const span = (from: string, until: string) =>
  from === until ? `on ${from}` : `${from} to ${until}`;

export default function TournamentView({
  round,
  link,
}: {
  /** undefined while it is being asked, null when nothing is on */
  round: CurrentRound | null | undefined;
  /** the one kind of address this page links to: its own games */
  link: (route: Extract<Route, { kind: 'tournament' }>) => { to: string; onGo: () => void };
}) {
  if (round === undefined) {
    return <p className="max-w-2xl mx-auto px-4 py-10 text-sm text-slate-400">Loading…</p>;
  }
  if (round === null) {
    return (
      <section className="max-w-2xl mx-auto px-4 py-10">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <Trophy className="w-5 h-5 text-accent shrink-0" aria-hidden="true" />
          Tournament
        </h2>
        <p className="mt-2 text-sm text-slate-400">
          No tournament round is on today. The dailies are here as usual.
        </p>
      </section>
    );
  }

  return (
    <section className="max-w-2xl mx-auto px-4 py-6" aria-label="This round">
      <h2 className="text-xl font-bold text-white flex items-center gap-2">
        <Trophy className="w-5 h-5 text-accent shrink-0" aria-hidden="true" />
        {round.tournament}
      </h2>
      <p className="mt-1 text-sm text-slate-300">
        Round {round.number} of {round.of} · {span(round.starts_on, round.ends_on)} ·{' '}
        {DIFFICULTY_LABEL[round.difficulty]}
      </p>
      <p className="mt-2 text-sm text-slate-400">
        Each game has one board for the whole round. You get one attempt at it,
        and your first finish is the one that counts — so take your time
        before you start.
      </p>

      <ul className="mt-5 grid gap-2 sm:grid-cols-2" aria-label="Games in this round">
        {round.games.map((feed) => {
          const mode = modeOfFeed(feed);
          if (!mode) return null;
          const { to, onGo } = link({ kind: 'tournament', slug: MODE_SLUG[mode] });
          return (
            <li key={feed}>
              <RouteLink
                to={to}
                onGo={onGo}
                className="block rounded-xl bg-white/5 border border-white/10 p-4 hover:bg-white/10 hover:border-white/20 transition-colors"
              >
                <span className="text-sm font-semibold text-white">
                  {GAME_NAME[mode]?.full ?? roundGameName(feed)}
                </span>
              </RouteLink>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
