// The tournament's own page: what round is on, and its games.
//
// Each game opens at /tournament/<game>, where it is played inside the round's
// channel -- its own board, kept and recorded apart from the daily, one attempt
// and the first finish counts. This page is the way in, and says plainly when
// nothing is running, which is most of the year.
import { useEffect, useState } from 'react';
import { Trophy, MessagesSquare, Gift } from 'lucide-react';
import RouteLink from '@/RouteLink';
import { BOARD_LABELS, type BoardGame } from '@/leaderboard';
import {
  readTournamentStandings,
  type RoundStandings,
  type TournamentStandings,
} from '@/standings';
import { formatElapsed } from '@/useUpTimer';
import { DIFFICULTY_LABEL } from '@/difficulty';
import { MODE_SLUG, GAME_NAME, type Mode } from '@/games';
import { roundGameName } from '@/tournaments';
import type { CurrentRound, CurrentTournament } from '@/rounds';
import { FEED_NAME } from '@/games';
import type { Route } from '@/routes';

/** The mode whose board is published under this feed name. */
function modeOfFeed(feed: string): Mode | null {
  const hit = (Object.entries(FEED_NAME) as [Mode, string][]).find(([, f]) => f === feed);
  return hit ? hit[0] : null;
}

const span = (from: string, until: string) =>
  from === until ? `on ${from}` : `${from} to ${until}`;

/** What is on offer, where there is anything. Nothing at all when there is
 *  not: a tournament with no prize should read like one, not like one whose
 *  prize is blank. */
function Prize({ what, for: whose }: { what: string; for: string }) {
  return (
    <p className="inline-flex items-start gap-1.5 rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-sm text-white">
      <Gift className="w-4 h-4 text-accent shrink-0 mt-0.5" aria-hidden="true" />
      <span>
        <span className="text-slate-300">{whose}: </span>
        {what}
      </span>
    </p>
  );
}

/**
 * The prizes a page mentions, as one row.
 *
 * The row owns the spacing, and the chip owns none. Each chip used to carry
 * its own top margin and nothing else, so whatever sat beside it decided the
 * rest: two in a row were separated by the whitespace JSX strips out, which is
 * none, and a card below one touched it. Twelve pixels around the row and
 * eight between chips, wherever prizes appear -- and nothing at all, margins
 * included, when there is no prize to show.
 */
function Prizes({ items }: { items: [whose: string, what: string | null | undefined][] }) {
  const shown = items.filter((x): x is [string, string] => !!x[1]);
  if (shown.length === 0) return null;
  return (
    <div className="my-3 flex flex-wrap gap-2">
      {shown.map(([whose, what]) => (
        <Prize key={whose} what={what} for={whose} />
      ))}
    </div>
  );
}

/** One card of standings. The trivia's card is shaped like a game's on purpose:
 *  a round's trivia is one more thing you placed in, and reading it as a
 *  different kind of object would make the tournament table harder to follow,
 *  not easier. What differs is the value -- points and the time that broke the
 *  tie -- and the multiplier, which is said out loud because it is the one
 *  thing about a round that the points alone will not explain. */
function TriviaBoard({ trivia }: { trivia: RoundStandings['trivia'][number] }) {
  return (
    <div className="rounded-xl bg-white/5 border border-white/10 p-3">
      <p className="text-sm font-semibold text-white mb-1.5 flex items-baseline gap-2">
        <span className="min-w-0 truncate">{trivia.title}</span>
        {trivia.weight !== 1 && (
          <span className="text-xs font-normal text-accent shrink-0">
            worth {trivia.weight}×
          </span>
        )}
      </p>
      {trivia.standings.length === 0 ? (
        <p className="text-xs text-slate-400">Nobody has answered yet.</p>
      ) : (
        <ol className="space-y-1 text-sm" aria-label={`${trivia.title} standings`}>
          {trivia.standings.slice(0, 10).map((r) => (
            <li key={r.name} className="flex items-baseline gap-2 text-slate-300">
              <span className="w-5 shrink-0 text-xs text-slate-500 tabular-nums">{r.place}</span>
              <span className="flex-1 min-w-0 truncate">{r.name}</span>
              <span className="tabular-nums shrink-0">{r.points} pts</span>
              {r.seconds !== null && (
                <span className="text-xs text-slate-500 tabular-nums shrink-0">
                  {formatElapsed(Math.round(r.seconds * 1000))}
                </span>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/** One card for a contest a round counted.
 *
 *  Shaped like the trivia's and the games' for the same reason theirs match
 *  each other: it is one more thing you placed in. What it has to say that
 *  they do not is that an empty list can mean "not decided yet" as well as
 *  "nobody took part" -- a contest pays nothing until its voting closes, and a
 *  card that just looked empty would read as the latter. */
function ContestBoard({ contest }: { contest: RoundStandings['contests'][number] }) {
  return (
    <div className="rounded-xl bg-white/5 border border-white/10 p-3">
      <p className="text-sm font-semibold text-white mb-1.5 flex items-baseline gap-2">
        <span className="min-w-0 truncate">{contest.name}</span>
        {contest.weight !== 1 && (
          <span className="text-xs font-normal text-accent shrink-0">
            worth {contest.weight}×
          </span>
        )}
      </p>
      {contest.standings.length === 0 ? (
        <p className="text-xs text-slate-400">
          {contest.phase === 'over'
            ? 'Nobody voted on this one.'
            : 'This one counts once its voting closes.'}
        </p>
      ) : (
        <ol className="space-y-1 text-sm" aria-label={`${contest.name} standings`}>
          {contest.standings.slice(0, 10).map((r) => (
            <li key={r.name} className="flex items-baseline gap-2 text-slate-300">
              <span className="w-5 shrink-0 text-xs text-slate-500 tabular-nums">{r.place}</span>
              <span className="flex-1 min-w-0 truncate">{r.name}</span>
              <span className="tabular-nums shrink-0">{r.points} pts</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/** One round's leaderboards, one per game and one per session, labelled and
 *  worded the way the site's own boards are -- the same labels, so a round's
 *  Weave says "best 1:35" exactly as the everyday board would. */
function RoundBoards({ round }: { round: RoundStandings }) {
  const games = Object.entries(round.boards) as [BoardGame, RoundStandings['boards'][BoardGame]][];
  const trivia = round.trivia ?? [];
  const contests = round.contests ?? [];
  if (games.length === 0 && trivia.length === 0 && contests.length === 0) {
    return <p className="text-xs text-slate-400">Nobody has finished a board in this round yet.</p>;
  }
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {games.map(([game, rows]) => {
        const label = BOARD_LABELS[game];
        if (!label) return null;
        const worth = round.weights?.[game];
        return (
          <div key={game} className="rounded-xl bg-white/5 border border-white/10 p-3">
            <p className="text-sm font-semibold text-white mb-1.5 flex items-baseline gap-2">
              <span className="min-w-0 truncate">{label.label}</span>
              {/* Said where the points are, the same way a round's trivia says
                  it: a board paying triple and looking like the others is a
                  table nobody can check. */}
              {worth !== undefined && worth !== 1 && (
                <span className="text-xs font-normal text-accent shrink-0">worth {worth}×</span>
              )}
            </p>
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
                    {label.extra && (
                      <span className="text-xs text-slate-500 tabular-nums shrink-0">
                        {label.extra(r)}
                      </span>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </div>
        );
      })}
      {trivia.map((v) => (
        <TriviaBoard key={v.session_id} trivia={v} />
      ))}
      {contests.map((c) => (
        <ContestBoard key={c.contest_id} contest={c} />
      ))}
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
        <h3 className="text-base font-bold text-white mb-2">Tournament table</h3>
        <Prizes items={[['Overall prize', standings.tournament.prize]]} />
        <p className="text-xs text-slate-400 mb-2">
          Points for placing in each game of each round: 10 for first down to 1
          for tenth, times what that round said the game was worth. Level on
          points, more wins goes first.
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
          <Prizes items={[['This round', current.prize]]} />
          <RoundBoards round={current} />
        </section>
      )}

      {earlier.map((r) => (
        <details key={r.id} className="rounded-xl border border-white/10 p-3">
          <summary className="cursor-pointer text-sm font-semibold text-slate-200">
            Round {r.number} · {span(r.starts_on, r.ends_on)}
          </summary>
          <div className="mt-3">
            <Prizes items={[['Prize', r.prize]]} />
            <RoundBoards round={r} />
          </div>
        </details>
      ))}
    </div>
  );
}

export default function TournamentView({
  round,
  tournament = null,
  locked = false,
  link,
  sessionsOn = true,
}: {
  /** undefined while it is being asked, null when nothing is on */
  round: CurrentRound | null | undefined;
  /** the tournament covering today, round or no round */
  tournament?: CurrentTournament | null;
  /** the tournament is the only thing on offer until it ends */
  locked?: boolean;
  /** the two kinds of address this page links to: its games and its trivia */
  link: (
    route: Extract<Route, { kind: 'tournament' } | { kind: 'live' }>
  ) => { to: string; onGo: () => void };
  /** sessions switched off site-wide: the trivia is listed but not openable,
   *  the same refusal the address itself gives */
  sessionsOn?: boolean;
}) {
  if (round === undefined) {
    return <p className="max-w-2xl mx-auto px-4 py-10 text-sm text-slate-400">Loading…</p>;
  }
  // Between rounds of a tournament that is still running: its standings, and
  // when it picks up again. For a tournament holding the site this is the
  // whole site, so it has to say more than "nothing is on".
  if (round === null && tournament) {
    return (
      <section className="max-w-2xl mx-auto px-4 py-6" aria-label="Between rounds">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <Trophy className="w-5 h-5 text-accent shrink-0" aria-hidden="true" />
          {tournament.name}
        </h2>
        <p className="mt-2 text-sm text-slate-300">
          {tournament.next_round_starts_on
            ? `No round is on today. The next one starts ${tournament.next_round_starts_on}.`
            : `No round is on today, and none is left to start. It ends ${tournament.ends_on}.`}
        </p>
        {locked && (
          <p className="mt-1 text-sm text-slate-400">
            Until {tournament.ends_on}, the tournament is the only thing on the site.
          </p>
        )}
        <Prizes items={[['Overall prize', tournament.prize]]} />
        <Standings tournamentId={tournament.id} currentRound="" />
      </section>
    );
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
      {locked && (
        <p className="mt-2 text-sm text-slate-400">
          Until {round.tournament_ends_on}, the tournament is the only thing on the site.
        </p>
      )}
      <Prizes
        items={[
          ['This round', round.prize],
          ['Overall prize', round.tournament_prize],
        ]}
      />
      <p className="mt-2 text-sm text-slate-400">
        Each game has one board for the whole round. You get one attempt at it,
        and your first finish is the one that counts — so take your time
        before you start.
      </p>

      <ul className="mt-5 grid gap-2 sm:grid-cols-2" aria-label="In this round">
        {(round.trivia ?? []).map((v) => {
          const open = v.state === 'live' && sessionsOn;
          const card =
            'block rounded-xl bg-white/5 border border-white/10 p-4 ' +
            (open ? 'hover:bg-white/10 hover:border-white/20 transition-colors' : 'opacity-60');
          const note = !sessionsOn
            ? 'Sessions are off just now'
            : v.state === 'closed'
              ? 'Finished — the standings below are final'
              : v.state === 'draft'
                ? 'Not open yet'
                : v.mode === 'open'
                  ? 'Open now — play it on your own time'
                  : 'Live now';
          const inside = (
            <>
              <span className="text-sm font-semibold text-white flex items-center gap-2">
                <MessagesSquare className="w-4 h-4 text-accent shrink-0" aria-hidden="true" />
                <span className="min-w-0 truncate">{v.title}</span>
              </span>
              <span className="block mt-0.5 text-xs text-slate-400">
                {note}
                {v.weight !== 1 && ` · worth ${v.weight}×`}
              </span>
            </>
          );
          if (!open) {
            return (
              <li key={v.session_id}>
                <div className={card}>{inside}</div>
              </li>
            );
          }
          const { to, onGo } = link({ kind: 'live', session: v.session_id, host: false });
          return (
            <li key={v.session_id}>
              <RouteLink to={to} onGo={onGo} className={card}>
                {inside}
              </RouteLink>
            </li>
          );
        })}
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
                {round.game_weights?.[feed] !== undefined && round.game_weights[feed] !== 1 && (
                  <span className="block mt-0.5 text-xs text-accent">
                    worth {round.game_weights[feed]}×
                  </span>
                )}
              </RouteLink>
            </li>
          );
        })}
      </ul>

      <Standings tournamentId={round.tournament_id} currentRound={round.round_id} />
    </section>
  );
}
