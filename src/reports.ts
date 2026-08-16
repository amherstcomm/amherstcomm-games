// Reporting a puzzle or a player, through the definer functions and nothing
// else. There is no path from this module to reading a report back — only to
// asking a ticket whether it is still open, which is all a ticket answers.
//
// Note what does *not* get sent. A puzzle report is where the board was, not
// what it said: the server reads the actual payload out of daily_puzzles and
// snapshots it. Posting the board the client is holding would make a report of
// a puzzle that never existed worth the same as a real one, and the whole value
// of a report is that somebody can act on it without first having to establish
// whether it happened.
//
// The reason and the email are the only things here the player writes. Both are
// optional. A report with no words is still a signal — it says somebody looked
// at this and thought it was wrong — and a report with no address is the normal
// case, since most reporters have no account and want none.

import { DAILY_ENV } from '@/dailyData';
import { supabase } from '@/supabase';

/** Everything the caller can usefully distinguish.
 *
 *  `filed` carries a ticket when there is one. There isn't always: the server
 *  quietly drops a report once the same subject already has five inside a
 *  month, and answers as if it took it. The reporter did their part either
 *  way, and telling them it was dropped invites them to file it again by
 *  another route — but there is no new report for a ticket to name. */
export type ReportResult =
  | { state: 'filed'; ticket: string | null }
  | { state: 'unknown' }
  | { state: 'offline' }
  | { state: 'error' };

export const REASON_MAX = 500;

function readResult(data: unknown): ReportResult {
  const r = data as { ok?: boolean; reason?: string; ticket?: string } | null;
  if (r?.ok) return { state: 'filed', ticket: typeof r.ticket === 'string' ? r.ticket : null };
  // 'no such puzzle' is the only failure the server names, and it means the
  // client asked about a board that isn't in the table — a stale tab, or a
  // date that rolled out of the fortnight while it sat open.
  return r?.reason === 'no such puzzle' ? { state: 'unknown' } : { state: 'error' };
}

/** Report a daily board.
 *
 *  The date is the puzzle's own, not the browser's — a tab left open past
 *  3:15 a.m. Eastern is looking at yesterday, and reporting it against today
 *  would file a report about a board the reporter never saw. */
export async function reportPuzzle(
  game: string,
  date: string,
  difficulty: string,
  reason: string,
  email?: string
): Promise<ReportResult> {
  if (!supabase) return { state: 'offline' };
  try {
    const { data, error } = await supabase.rpc('report_puzzle', {
      p_game: game,
      p_date: date,
      p_difficulty: difficulty,
      p_env: DAILY_ENV,
      p_reason: reason.slice(0, REASON_MAX),
      p_email: email?.trim() || null,
    });
    if (error) return { state: 'error' };
    return readResult(data);
  } catch {
    return { state: 'error' };
  }
}

/** Report a display name seen on a leaderboard.
 *
 *  An unknown name answers 'filed' like any other, because the server refuses
 *  to say whether a name exists — an endpoint that did would be a way of
 *  asking, and claiming a name is careful not to answer that either. */
export async function reportPlayer(
  name: string,
  reason: string,
  email?: string
): Promise<ReportResult> {
  if (!supabase) return { state: 'offline' };
  try {
    const { data, error } = await supabase.rpc('report_player', {
      p_name: name,
      p_reason: reason.slice(0, REASON_MAX),
      p_email: email?.trim() || null,
    });
    if (error) return { state: 'error' };
    return readResult(data);
  } catch {
    return { state: 'error' };
  }
}

export type TicketStatus =
  | {
      found: true;
      open: boolean;
      resolution: string | null;
      /** what the owner wrote when they closed it, if they wrote anything */
      note: string | null;
      filed: string;
      closed: string | null;
    }
  | { found: false };

/** What a ticket answers: open or closed, and how it ended. Nothing else —
 *  not the board, not the name, not the reporter's own words back.
 *
 *  A wrong code and a real one both read as `found: false` on the server side
 *  of this, deliberately: the ticket names a report, it does not guard one, and
 *  an endpoint that confirmed codes would be a way of walking them. */
export async function ticketStatus(ticket: string): Promise<TicketStatus | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.rpc('report_status', { p_ticket: ticket.trim() });
    if (error) return null;
    const r = data as {
      found?: boolean;
      status?: string;
      resolution?: string | null;
      note?: string | null;
      filed?: string;
      closed?: string | null;
    } | null;
    if (!r?.found) return { found: false };
    return {
      found: true,
      open: r.status === 'new',
      resolution: r.resolution ?? null,
      note: r.note ?? null,
      filed: r.filed ?? '',
      closed: r.closed ?? null,
    };
  } catch {
    return null;
  }
}

// ---- the owner's side ------------------------------------------------------
// Both of these need two keys, checked on the server: the token from the
// digest link, and an owner account signed in. 'denied' is what a missing
// either looks like, and it is deliberately the same answer for both — a page
// that distinguished them would say which half somebody had got right.

export type ReportForAction = {
  ticket: string;
  kind: string;
  evidence: unknown;
  reason: string | null;
  status: string;
  resolution: string | null;
  filed: string;
};

export async function reportForAction(
  id: string,
  token: string
): Promise<ReportForAction | 'denied' | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.rpc('report_for_action', { p_id: id, p_token: token });
    if (error) return null;
    const r = data as ({ ok?: boolean; reason?: string } & ReportForAction) | null;
    if (!r?.ok) return r?.reason === 'not allowed' ? 'denied' : null;
    return {
      ticket: r.ticket,
      kind: r.kind,
      evidence: r.evidence,
      reason: r.reason ?? null,
      status: r.status,
      resolution: r.resolution ?? null,
      filed: r.filed,
    };
  } catch {
    return null;
  }
}

/** Returns 'ok', or the server's own word for why not. */
export async function actOnReport(
  id: string,
  token: string,
  action: string,
  note: string,
  target: string
): Promise<string> {
  if (!supabase) return 'error';
  try {
    const { data, error } = await supabase.rpc('report_act', {
      p_id: id,
      p_token: token,
      p_action: action,
      p_note: note.slice(0, 500),
      p_target: target.trim().toLowerCase() || null,
    });
    if (error) return 'error';
    const r = data as { ok?: boolean; reason?: string } | null;
    return r?.ok ? 'ok' : (r?.reason ?? 'error');
  } catch {
    return 'error';
  }
}

/** A site problem, or anything else.
 *
 *  Unlike the other two, the reason is required — there is no board to look up
 *  and no name to resolve, so the words are the whole report. `where` is the
 *  reporter's own account of where they were; it is a hint for whoever reads
 *  it and never evidence, which is why the server stores it under a key that
 *  says so. */
export type GeneralKind = 'site' | 'other' | 'privacy' | 'security';

export async function reportGeneral(
  kind: GeneralKind,
  reason: string,
  where: string,
  email?: string
): Promise<ReportResult> {
  if (!supabase) return { state: 'offline' };
  try {
    const { data, error } = await supabase.rpc('report_general', {
      p_kind: kind,
      p_reason: reason.slice(0, REASON_MAX),
      p_where: where.slice(0, 200),
      p_email: email?.trim() || null,
    });
    if (error) return { state: 'error' };
    return readResult(data);
  } catch {
    return { state: 'error' };
  }
}

// ---- the owner's queue -----------------------------------------------------

export type QueuedReport = {
  id: string;
  kind: string;
  ticket: string;
  evidence: Record<string, unknown>;
  reason: string | null;
  actionToken: string;
  filed: string;
  daysOpen: number;
};

/** Am I an owner? Answers false for everyone else, including signed out —
 *  there is no error case worth telling apart, because the only use of this is
 *  deciding whether to draw a link. */
export async function amOwner(): Promise<boolean> {
  if (!supabase) return false;
  try {
    const { data, error } = await supabase.rpc('is_owner');
    return !error && data === true;
  } catch {
    return false;
  }
}

/** Every open report, oldest first. Empty for everyone who isn't an owner —
 *  the server decides that, and an empty list is the honest answer rather than
 *  an error the caller has to special-case. */
export async function ownerReports(): Promise<QueuedReport[]> {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase.rpc('owner_reports');
    if (error || !Array.isArray(data)) return [];
    return data.map((r: Record<string, unknown>) => ({
      id: String(r.id),
      kind: String(r.kind),
      ticket: String(r.ticket),
      evidence: (r.evidence ?? {}) as Record<string, unknown>,
      reason: (r.reason as string) ?? null,
      actionToken: String(r.action_token),
      filed: String(r.created_at),
      daysOpen: Number(r.days_open) || 0,
    }));
  } catch {
    return [];
  }
}
