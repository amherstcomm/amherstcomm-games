// The tournament's own page: what round is on, and its games.
//
// Each game opens at /tournament/<game>, where it is played inside the round's
// channel -- its own board, kept and recorded apart from the daily, one attempt
// and the first finish counts. This page is the way in, and says plainly when
// nothing is running, which is most of the year.
import { useEffect, useState } from 'react';
import { Trophy } from 'lucide-react';
import RouteLink from '@/RouteLink';
import { BOARD_LABELS, type BoardGame } from '@/leaderboard';
import { readTournamentStandings, type RoundStandings, type TournamentStandings } from '@/standings';
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

/** One round's leaderboards, one per game, labelled and worded the way the
 *  site's own boards are -- the same labels, so a round's Weave says "best
 *  1:35" exactly as the everyday board would. */
function RoundBoards({ round }: { round: RoundStandings }) {
  const games = Object.entries(round.boards) as [BoardGame, RoundStandings['boards'][BoardGame]][];
  if (games.length === 0) {
    return <p className="text-xs text-slate-400">Nobody has finished a board in this round yet.</p>;
  }
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {games.map(([game, rows]) => {
        const label = BOARD_LABELS[game];
        if (!label) return null;
        return (
          <div key={game} className="rounded-xl bg-white/5 border border-white/10 p-3">
            <p className="text-sm font-semibold text-white mb-1.5">{label.label}</p>
            {(rows ?? []).length === 0 ? (
              <p className="text-xs text-slate-400">No finishes yet.</p>
            ) : (
              <ol className="space-y-1 text-sm" aria-label={`${label.label} standings`}>
                {(rows ?? []).slice(0, 10).map((r, i) => (
                  <li key={r.name} className="flex items-baseline gap-2 text-slate-300">
                    <span className="w-5 shrink-0 text-xs text-slate-500 tabular-nums">{i + 1}</span>
                    <span className="flex-1 min-w-0 truncate">{r.name}</span>
                    <span className="tabular-nums shrink-0">{label.value(r.value)}</span>
                    {label.detail(r.detail ?? 0) !== '' && (
                      <span className="text-xs text-slate-500 tabular-nums shrink-0">
                        {label.detail(r.detail ?? 0)}
                      </span>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** The tournament table and every started round's boards. Fetched here rather
 *  than handed down, because only this page wants them and a leaderboard read
 *  on every page load would be a query for nothing most of the year. */
function Standings({ tournamentId, currentRound }: { tournamentId: string; currentRound: string }) {
  const [standings, setStandings] = useState<TournamentStandings | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    void readTournamentStandings(tournamentId).then((res) => {
      if (alive) setStandings(res.ok ? res.standings : null);
    });
    return () => {
      alive = false;
    };
  }, [tournamentId]);

  if (standings === undefined) return <p className="mt-6 text-sm text-slate-400">Loading the standings…</p>;
  if (standings === null) return null;

  const current = standings.rounds.find((r) => r.id === currentRound);
  const earlier = standings.rounds.filter((r) => r.id !== currentRound).reverse();

  return (
    <div className="mt-8 space-y-6">
      <section aria-label="Tournament table">
        <h3 className="text-base font-bold text-white">Tournament table</h3>
        <p className="text-xs text-slate-400 mb-2">
          Points for placing in each game of each round: 10 for first down to 1
          for tenth. Level on points, more wins goes first.
        </p>
        {standings.table.length === 0 ? (
          <p className="text-sm text-slate-400">No finishes yet.</p>
        ) : (
          <ol className="space-y-1 text-sm">
            {standings.table.map((row, i) => (
              <li key={row.name} className="flex items-baseline gap-2 text-slate-300">
                <span className="w-5 shrink-0 text-xs text-slate-500 tabular-nums">{i + 1}</span>
                <span className="flex-1 min-w-0 truncate">{row.name}</span>
                <span className="tabular-nums shrink-0 font-semibold text-white">{row.points} pts</span>
                <span className="text-xs text-slate-500 tabular-nums shrink-0">
                  {row.wins} win{row.wins === 1 ? '' : 's'}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>

      {current && (
        <section aria-label="This round's standings">
          <h3 className="text-base font-bold text-white mb-2">This round</h3>
          <RoundBoards round={current} />
        </section>
      )}

      {earlier.map((r) => (
        <details key={r.id} className="rounded-xl border border-white/10 p-3">
          <summary className="cursor-pointer text-sm font-semibold text-slate-200">
            Round {r.number} · {span(r.starts_on, r.ends_on)}
          </summary>
          <div className="mt-3">
            <RoundBoards round={r} />
          </div>
        </details>
      ))}
    </div>
  );
}

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

      <Standings tournamentId={round.tournament_id} currentRound={round.round_id} />
    </section>
  );
}
