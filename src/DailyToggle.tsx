// Daily or practice — the third rung of the control ladder.
//
// Every game climbs the same ladder (see CLAUDE.md): surface, then what the
// board is built from, then *which board*, then the game. This is that third
// rung, and until now it was written out inside each game that had it. Six
// carried an identical copy; Squares and Cryptogram carry variants with their
// own extra controls in the same row; Ladder offered a grey text link below
// the board instead, and Bridge had nothing at all — its practice mode could
// not be reached by any control on the page.
//
// So this exists to be the rung rather than to save lines. A game either shows
// it or has no practice; there is no third option, and a text link below the
// board is not the same control in a different coat — it is a different answer
// to "which board am I playing".
//
// Hidden rather than disabled when practice is switched off in Settings: the
// choice is not merely unavailable, it does not exist, and a greyed pill
// invites you to work out why.
import { useEffect, useRef } from 'react';
import { CalendarDays, RefreshCw } from 'lucide-react';
import { usePrefs } from '@/prefs';
import { useUnavailable } from '@/availability';

export default function DailyToggle({
  daily,
  onChange,
}: {
  daily: boolean;
  onChange: (daily: boolean) => void;
}) {
  const { practiceAllowed } = usePrefs();
  // A deployment can switch the dailies off -- for a tournament month where the
  // round is the thing, and a daily beside it is a second puzzle competing with
  // it for the ten minutes anybody has. Then there is no choice to make here,
  // so this rung goes the way it goes when practice is off: hidden, not greyed.
  const dailiesOn = !useUnavailable().includes('site:dailies');

  // Games pass a fresh arrow each render; a ref keeps this from re-running on
  // identity alone while still calling the current one.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  useEffect(() => {
    // Somebody left on a daily that is no longer offered is moved to practice,
    // the same way a hidden game's address carries you to one that exists.
    // Unless practice is off as well, in which case moving them would leave
    // them with no board at all.
    if (!dailiesOn && daily && practiceAllowed) onChangeRef.current(false);
  }, [dailiesOn, daily, practiceAllowed]);

  // Nothing to choose between: the deployment offers one board, and a switch
  // with one position is clutter -- the rule the view switch follows too.
  if (!dailiesOn && practiceAllowed) return null;

  return (
    // Centred by this wrapper rather than by the caller. The rungs above sit in
    // a `text-center` section and centre for free; Ladder and Bridge render this
    // inside a plain `max-w-md mx-auto`, where the same markup sat hard against
    // the left edge — measured at 0px left, 77px right. A control centred in
    // eight games and not in two is the class of difference this rung exists to
    // remove.
    <div className={`mb-5 text-center ${practiceAllowed ? '' : 'hidden'}`}>
      {/* The inner container is what the other rungs use, character for
          character. `flex-wrap max-w-full` is why the view switch survives 320px
          at the largest text scale; two options never grow wide enough to need
          it — measured — but it is not worth losing the day a rung gains a
          third. */}
      <div className="inline-flex flex-wrap justify-center max-w-full rounded-xl bg-white/5 border border-white/10 p-1 gap-1">
        {(
        [
          { id: true, label: 'Daily', Icon: CalendarDays },
          { id: false, label: 'Practice', Icon: RefreshCw },
        ] as const
      ).map(({ id, label, Icon }) => (
        <button
          key={label}
          // the boards below hold focus in a text field; letting the pill take
          // it on mousedown moves the caret out from under the player mid-word
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onChange(id)}
          aria-pressed={daily === id}
          className={`inline-flex items-center gap-1.5 px-4 h-9 rounded-lg text-sm font-semibold transition-colors
            ${daily === id ? 'bg-emerald-400/15 text-emerald-300' : 'text-slate-400 hover:text-white'}`}
        >
          <Icon className="w-4 h-4" />
          {label}
          </button>
        ))}
      </div>
    </div>
  );
}
