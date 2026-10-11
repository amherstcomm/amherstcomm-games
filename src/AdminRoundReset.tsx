// Giving one player another go at one thing in a round.
//
// Something went wrong for one person -- a board that stuck, a page that fell
// over mid-question -- and they need to start that one thing again. Per item
// rather than the whole round: the list shows where they got to on each game
// and each session, and each has its own reset, so fixing a Weave that errored
// does not throw away the same person's trivia answers.
//
// What a reset does is the server's (reset_round_player): a game's board and
// hints are cleared and their device starts on a fresh copy, a session's
// answers are cleared and they start again at question one. Only while the
// round is on -- after it, a reset could only take a result out of the final
// standings, which is not what this is for.
import { useCallback, useEffect, useState } from 'react';
import PersonSearch from '@/PersonSearch';
import type { Entrant } from '@/contests';
import { readRoundPlayer, resetRoundPlayer, type RoundPlayer } from '@/tournaments';

const BUTTON =
  'inline-flex items-center justify-center px-3 h-9 rounded-lg text-sm font-semibold ' +
  'bg-white/10 border border-white/15 text-slate-200 hover:bg-white/15 disabled:opacity-50';

const STATUS: Record<'finished' | 'started' | 'not started', string> = {
  finished: 'Finished',
  started: 'Started, not finished',
  'not started': 'Not started',
};

export default function AdminRoundReset({
  round,
  label,
  onClose,
}: {
  round: string;
  /** which round, in the words the list uses: "Round 3" */
  label: string;
  onClose: () => void;
}) {
  const [who, setWho] = useState<Entrant | null>(null);
  const [sheet, setSheet] = useState<RoundPlayer | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!who) {
      setSheet(null);
      return;
    }
    setSheet(await readRoundPlayer(round, who.user));
  }, [round, who]);

  useEffect(() => {
    setSaid(null);
    void load();
  }, [load]);

  const name = who?.name ?? who?.email ?? 'them';

  async function reset(what: { game: string } | { session: string }, thing: string, consequence: string) {
    if (!who) return;
    // The thing and what happens to it, by name: this deletes somebody's
    // progress and nothing here can put it back.
    if (!window.confirm(`Reset ${name}'s ${thing}? ${consequence}`)) return;
    setBusy(true);
    const got = await resetRoundPlayer(round, who.user, what);
    setBusy(false);
    setSaid(got.ok ? `${thing} reset. ${name} can start it again.` : (got.reason ?? 'That did not reset'));
    await load();
  }

  return (
    <section
      className="basis-full mt-2 rounded-lg border border-white/15 p-3 space-y-3"
      aria-label={`Reset a player in ${label}`}
    >
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-xs font-semibold text-slate-200">Reset a player in {label}</h4>
        <button type="button" className={BUTTON} onClick={onClose}>
          Done
        </button>
      </div>
      <PersonSearch
        chosen={who}
        onChoose={setWho}
        label="Who needs another go?"
        listLabel="People you can reset"
        chosenWord="Resetting"
      />

      {sheet && !sheet.ok && <p className="text-xs text-rose-300">{sheet.reason}</p>}
      {sheet?.ok && !sheet.on && (
        <p className="text-xs text-slate-400">
          This round is not on, so there is nothing to give another go at.
        </p>
      )}
      {sheet?.ok && sheet.on && (
        <ul className="space-y-1" aria-label={`What ${name} has in ${label}`}>
          {(sheet.games ?? []).map((g) => (
            <li
              key={g.game}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white/5 px-2.5 py-1.5"
            >
              <span className="min-w-0 text-xs">
                <span className="block font-semibold text-slate-200">{g.name}</span>
                <span className="block text-slate-400">
                  {STATUS[g.status]}
                  {g.hints > 0 && ` · ${g.hints} hint${g.hints === 1 ? '' : 's'}`}
                  {g.resets > 0 && ` · reset ${g.resets === 1 ? 'once' : `${g.resets} times`} already`}
                </span>
              </span>
              <button
                type="button"
                className={BUTTON}
                disabled={busy || g.status === 'not started'}
                onClick={() =>
                  void reset(
                    { game: g.game },
                    g.name,
                    'Their board and any hints are cleared, and they start it fresh -- on any device.'
                  )
                }
              >
                Reset {g.name}
              </button>
            </li>
          ))}
          {(sheet.sessions ?? []).map((v) => (
            <li
              key={v.session_id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white/5 px-2.5 py-1.5"
            >
              <span className="min-w-0 text-xs">
                <span className="block font-semibold text-slate-200">{v.title}</span>
                <span className="block text-slate-400">
                  {v.answered === 0 ? 'Not started' : `Answered ${v.answered} of ${v.total}`}
                </span>
              </span>
              <button
                type="button"
                className={BUTTON}
                disabled={busy || v.answered === 0}
                onClick={() =>
                  void reset(
                    { session: v.session_id },
                    v.title,
                    'Their answers are cleared and they start again at question one.'
                  )
                }
              >
                Reset {v.title}
              </button>
            </li>
          ))}
        </ul>
      )}
      {said && (
        <p className="text-xs text-slate-300" role="status">
          {said}
        </p>
      )}
    </section>
  );
}
