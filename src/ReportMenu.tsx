// "Report a problem", from the footer, on every page.
//
// It started as a link on the daily board, which was wrong twice over. It hung
// off a date the game had to report through the bus, and half the games keep
// their date somewhere else — so it silently wasn't there on Guess, Scramble,
// Hive, Grid, Boxed and Ladder, which is the worst possible failure for a
// control whose entire job is to be findable. And it only covered the half of
// the problem a generator can cause. A page that renders wrong, or something
// nobody thought of, had nowhere to go at all.
//
// The footer is on every page by construction, so there is nothing to forget.
// The four choices ask for different things because they can check different
// things: a puzzle and a player are looked up on the server and need almost
// nothing from the browser, while a site problem has no evidence but the words,
// which is why those are the ones where the words are required.
import { useRef, useState } from 'react';
import { Flag } from 'lucide-react';
import ReportDialog from '@/ReportDialog';
import {
  reportGeneral,
  reportPlayer,
  reportPuzzle,
  type GeneralKind,
  type ReportResult,
} from '@/reports';
import { DIFFICULTIES, difficulty, type Difficulty } from '@/difficulty';
import { useModalA11y } from '@/useModalA11y';

export type ReportContext = {
  /** the daily board on screen, if there is one — so the commonest report is
   *  one click and no typing */
  game?: string;
  gameLabel?: string;
  date?: string;
  level?: Difficulty;
};

type Choice = 'site' | 'puzzle' | 'player' | 'privacy' | 'security' | 'other';

const CHOICES: { id: Choice; label: string; hint: string }[] = [
  { id: 'site', label: 'A problem with the site', hint: 'Something broken, missing or wrong.' },
  { id: 'puzzle', label: 'A puzzle', hint: 'A board with something offensive on it.' },
  { id: 'player', label: 'A player', hint: 'A display name on a leaderboard.' },
  // Privacy and security used to be a mailto and a line in the terms — a route
  // with no ticket, no queue, and no way for the person reporting to tell
  // whether anyone had read it. They are the two kinds where that matters most.
  { id: 'privacy', label: 'A privacy concern', hint: 'Your data, or anyone else’s.' },
  { id: 'security', label: 'A security problem', hint: 'A vulnerability or a way in.' },
  { id: 'other', label: 'Something else', hint: 'Anything the others don’t cover.' },
];

const SUBJECT: Record<Choice, string> = {
  site: 'a problem with the site',
  puzzle: 'a puzzle',
  player: 'a player',
  privacy: 'a privacy concern',
  security: 'a security problem',
  other: 'something else',
};

export default function ReportMenu({
  context,
  label = 'Report a problem',
  className = 'inline-flex items-center gap-1.5 hover:text-slate-300 transition-colors',
  showIcon = true,
}: {
  context: ReportContext;
  /** the trigger's words, so About can name it in a sentence */
  label?: string;
  className?: string;
  showIcon?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<Choice | null>(null);
  // what the chosen kind needs beyond a reason: a name, or a board
  const [name, setName] = useState('');
  // the board on screen; there is no picker, because a report about a board
  // you are not looking at is a report about a board you cannot describe
  const game = context.game ?? '';
  const [level, setLevel] = useState<Difficulty>(context.level ?? difficulty());

  const close = () => {
    setOpen(false);
    setChoice(null);
    setName('');
  };

  const send = async (reason: string, email: string): Promise<ReportResult> => {
    if (choice === 'player') {
      if (!name.trim()) return { state: 'error' };
      return reportPlayer(name, reason, email);
    }
    if (choice === 'puzzle') {
      if (!game || !context.date) return { state: 'unknown' };
      return reportPuzzle(game, context.date, level, reason, email);
    }
    return reportGeneral(choice as GeneralKind, reason, window.location.pathname, email);
  };

  return (
    <>
      {/* A button rather than a link, in both places it appears, because it
          opens a dialog rather than going anywhere — an anchor here would
          promise an address that does not exist, and would break a
          middle-click. About renders it inline in a sentence, styled as the
          links around it. */}
      <button onClick={() => setOpen(true)} className={className}>
        {showIcon && <Flag className="w-3.5 h-3.5" aria-hidden="true" />}
        {label}
      </button>

      {open && !choice && (
        <ChoiceDialog
          onPick={(c) => setChoice(c)}
          onClose={close}
          canReportPuzzle={Boolean(context.date && context.game)}
          boardLabel={context.gameLabel}
        />
      )}

      {open && choice && (
        <ReportDialog
          subject={SUBJECT[choice]}
          detail={
            choice === 'puzzle' && context.date
              ? `${context.gameLabel ?? game} · ${level} · ${context.date} — we read the board off the server.`
              : choice === 'player'
                ? undefined
                : 'There’s nothing for us to look up here, so please say as much as you can.'
          }
          reasonRequired={choice !== 'puzzle' && choice !== 'player'}
          extra={
            choice === 'security' ? (
              /* The upstream project named GitHub's advisory form first, because
                 it is private by construction and carries a disclosure process a
                 report table does not. Neither applies here: this queue is already
                 inside the company, and pointing an employee at a public code host
                 to report a hole in an internal tool is the opposite of private. */
              <p className="mt-3 rounded-lg bg-white/5 border border-white/10 p-3 text-xs text-slate-400">
                This goes to the internal queue and nowhere else. Please don’t post it
                anywhere public while it is unfixed — you’ll get a reference back you can
                check, and an answer when it is dealt with.
              </p>
            ) : choice === 'player' ? (
              <>
                <label htmlFor="report-name" className="mt-3 block text-xs text-slate-500">
                  The display name, as it appears on the board
                </label>
                <input
                  id="report-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1 w-full rounded-lg bg-slate-950 border border-white/10 px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-accent"
                />
              </>
            ) : choice === 'puzzle' ? (
              <>
                <label htmlFor="report-level" className="mt-3 block text-xs text-slate-500">
                  Which difficulty — they’re three separate boards
                </label>
                <select
                  id="report-level"
                  value={level}
                  onChange={(e) => setLevel(e.target.value as Difficulty)}
                  className="mt-1 w-full rounded-lg bg-slate-950 border border-white/10 px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-accent"
                >
                  {DIFFICULTIES.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </>
            ) : null
          }
          onSend={send}
          onClose={close}
        />
      )}
    </>
  );
}

function ChoiceDialog({
  onPick,
  onClose,
  canReportPuzzle,
  boardLabel,
}: {
  onPick: (c: Choice) => void;
  onClose: () => void;
  canReportPuzzle: boolean;
  boardLabel?: string;
}) {
  // The chooser is a dialog too, and it shipped without this — no Escape, no
  // focus trap, no focus handed back — because it looked like a menu rather
  // than a modal. Anything that covers the page and takes focus owes the same
  // manners as the thing it opens.
  const ref = useRef<HTMLDivElement>(null);
  useModalA11y(ref, onClose);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="What would you like to report?"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl bg-slate-900 border border-white/10 text-left shadow-2xl p-6"
      >
        <h2 className="text-lg font-bold">What would you like to report?</h2>
        <div className="mt-4 space-y-2">
          {CHOICES.map((c) => {
            // Reporting a puzzle needs a board to report. Off a daily there
            // isn't one, so the option says so rather than opening a form that
            // cannot be sent — and "Something else" is right there for the
            // person who wants to describe one from memory.
            const stranded = c.id === 'puzzle' && !canReportPuzzle;
            return (
              <button
                key={c.id}
                onClick={() => onPick(c.id)}
                disabled={stranded}
                className="w-full text-left rounded-lg bg-white/5 border border-white/10 px-3 py-2.5 hover:bg-white/10 disabled:opacity-40 disabled:hover:bg-white/5 transition-colors"
              >
                <span className="block text-sm font-semibold text-slate-200">{c.label}</span>
                <span className="block text-xs text-slate-500">
                  {stranded
                    ? 'Open the daily board you mean, then report it from there.'
                    : c.id === 'puzzle' && boardLabel
                      ? `Today’s ${boardLabel}.`
                      : c.hint}
                </span>
              </button>
            );
          })}
        </div>
        <div className="mt-4 flex justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-slate-400 hover:text-white transition">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
