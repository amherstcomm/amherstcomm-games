// What the presenter should press next.
//
// This was five raw verbs on screen at once — Start, Next question, Lock,
// Reveal, Close — with nothing saying which question you were on, how many were
// left, or which of the five was the sensible one now. Working that out is the
// presenter's job in front of a room, which is exactly when it should not be.
//
// A separate module because it is the only interesting logic on that screen and
// it is worth pinning: the states form a sequence, the sequence has ends, and
// every wrong answer here happens live.
//
// It decides what to *offer*. It does not decide what is allowed —
// advance_session checks that itself, and disagreeing with it here produces a
// button that does nothing rather than a security problem.

/** What the presenter's screen knows about the run. Mirrors `session_door`. */
export type Door = {
  ok: boolean;
  title?: string;
  code?: string | null;
  state?: 'draft' | 'live' | 'closed';
  total?: number;
  /** questions not yet shown */
  pending?: number;
  /** which one is up, 1-based, or null before anything is shown */
  position?: number | null;
  mode?: 'live' | 'open';
  /** open mode: how many people have answered anything */
  players?: number;
  item_state?: 'pending' | 'open' | 'locked' | 'revealed' | null;
  /** open mode: the window it keeps, either end of which may be unset */
  opens_at?: string | null;
  closes_at?: string | null;
};

export type Action = 'start' | 'show' | 'lock' | 'reveal' | 'close';

export type Move = { action: Action; label: string };

/** The one thing to press, or null when there is nothing left to do.
 *
 *  Order matters and is the running order: open the question, close it, show
 *  the answer, move on. The end of the list is `close` rather than another
 *  `show`, so a session finishes by being finished rather than by the presenter
 *  running out of things to click. */
export function nextMove(door: Door): Move | null {
  if (!door.ok || !door.state) return null;
  if (door.state === 'closed') return null;

  const total = door.total ?? 0;

  // An open session has nobody at the front, so there is no show, lock or
  // reveal — only starting it and finishing it. Offering the rest would be
  // offering buttons the server refuses.
  if (door.mode === 'open') {
    if (door.state === 'draft') {
      return total === 0 ? null : { action: 'start', label: 'Open it for playing' };
    }
    return { action: 'close', label: 'Close it' };
  }

  if (door.state === 'draft') {
    // Refusing to start an empty session here rather than letting the server
    // do it: "nothing left to show" arriving after Start looks like a fault,
    // and the fix is on a different screen.
    if (total === 0) return null;
    return { action: 'start', label: 'Start the session' };
  }

  switch (door.item_state) {
    case 'open':
      return { action: 'lock', label: 'Close the answers' };
    case 'locked':
      return { action: 'reveal', label: 'Show the answer' };
    default:
      break;
  }

  // Nothing on screen, or the one on screen is done with.
  const pending = door.pending ?? 0;
  if (pending > 0) {
    const n = total - pending + 1;
    return { action: 'show', label: `Show question ${n} of ${total}` };
  }
  return { action: 'close', label: 'Finish the session' };
}

/** The moves worth offering besides the obvious one, in the order they belong
 *  on screen. Deliberately short: a row of everything that is technically legal
 *  is the thing this replaced. */
export function otherMoves(door: Door): Move[] {
  if (!door.ok || door.state !== 'live') return [];
  // Finishing is the only other thing an open session can be told to do, and
  // nextMove already offers it.
  if (door.mode === 'open') return [];
  const out: Move[] = [];
  // Skipping the reveal is a real thing to want — a survey has no answer to
  // show, and sometimes a question is simply moved past.
  if ((door.item_state === 'open' || door.item_state === 'locked') && (door.pending ?? 0) > 0) {
    out.push({ action: 'show', label: 'Skip to the next question' });
  }
  if (door.item_state === 'open') {
    out.push({ action: 'reveal', label: 'Show the answer now' });
  }
  out.push({ action: 'close', label: 'Finish' });
  return out;
}

/** Where the room is, in words, for the line above the controls. */
export function whereWeAre(door: Door): string {
  if (!door.ok || !door.state) return '';

  if (door.mode === 'open') {
    const total = door.total ?? 0;
    if (door.state === 'draft') {
      return total === 0
        ? 'No questions yet — add some before opening it.'
        : `Not open yet · ${total} ${total === 1 ? 'question' : 'questions'}`;
    }
    const players = door.players ?? 0;
    const who = `${players} ${players === 1 ? 'person has' : 'people have'} played`;
    return door.state === 'closed' ? `Closed · ${who}` : `Open for playing · ${who}`;
  }

  if (door.state === 'draft') {
    const total = door.total ?? 0;
    return total === 0
      ? 'No questions yet — add some before starting.'
      : `Not started · ${total} ${total === 1 ? 'question' : 'questions'}`;
  }
  if (door.state === 'closed') return 'Finished';
  if (!door.position) return `Ready · ${door.pending ?? 0} to come`;
  const where = `Question ${door.position} of ${door.total ?? 0}`;
  switch (door.item_state) {
    case 'open':
      return `${where} · answers open`;
    case 'locked':
      return `${where} · answers closed`;
    case 'revealed':
      return `${where} · answer shown`;
    default:
      return where;
  }
}

/** Seconds left on the clock, or null when there is no clock.
 *
 *  `skewMs` is what the server's clock read minus what this browser's did at
 *  the same moment. Without it a laptop twenty seconds out counts down to a
 *  time nobody else in the room agrees with — including the server, which is
 *  the only opinion that decides whether an answer counts. */
export function secondsLeft(
  openedAt: string | null | undefined,
  seconds: number | null | undefined,
  skewMs: number,
  nowMs: number
): number | null {
  if (!openedAt || !seconds) return null;
  const deadline = Date.parse(openedAt) + seconds * 1000;
  if (Number.isNaN(deadline)) return null;
  return Math.max(0, Math.ceil((deadline - (nowMs + skewMs)) / 1000));
}
