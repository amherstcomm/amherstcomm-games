// A contest: entries with photographs, and later a vote on them.
//
// Not a session. A session question opens, is answered and closes inside a
// minute; a contest runs over days, in two phases, and what is being judged is
// a photograph rather than an answer. So it has its own dates, its own screen,
// and -- once the voting half lands -- its own way of paying a tournament
// round.
//
// The photographs live in a private storage bucket rather than in a row: a
// phone photo is megabytes, and a dozen of them coming back through an RPC is a
// page that never loads. A row holds the path; the browser asks for a signed
// link for the handful it is about to draw.
import { supabase } from '@/supabase';

/** Which of the four dates today falls in. The server decides this, so a
 *  clock that is wrong on somebody's laptop cannot open entries early. */
export type ContestPhase = 'soon' | 'entries' | 'judging' | 'voting' | 'over';

export type Contest = {
  id: string;
  name: string;
  blurb: string | null;
  entries_open_on: string;
  entries_close_on: string;
  votes_open_on: string;
  votes_close_on: string;
  /** the people themselves, or an organiser on their behalf */
  who_enters: 'players' | 'admins';
  /** whether whose entry it is appears on screen */
  entrants_shown: boolean;
  /** whether who voted for what can be seen afterwards */
  voters_shown: boolean;
  /** how many each voter ranks */
  picks: number;
  prize: string | null;
  phase: ContestPhase;
  /** whether this person may put something in right now */
  may_enter: boolean;
};

export type ContestEntry = {
  id: string;
  title: string;
  blurb: string | null;
  /** where the photograph is in the bucket; null until one is uploaded */
  image_path: string | null;
  /** whose it is, or null when the contest does not say */
  entrant: string | null;
  /** theirs to change */
  mine: boolean;
};

/** What the list page shows: the contests that are open or being judged. */
export type ContestOn = {
  id: string;
  name: string;
  phase: ContestPhase;
  entries_close_on: string;
  votes_open_on: string;
  votes_close_on: string;
  entries: number;
};

export const BUCKET = 'contest-entries';

/** What a phase means, in the words somebody looking at the page wants. */
export const PHASE_WORD: Record<ContestPhase, string> = {
  soon: 'Not open yet',
  entries: 'Taking entries',
  judging: 'Entries closed',
  voting: 'Voting',
  over: 'Finished',
};

export async function readContestsOn(): Promise<ContestOn[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc('contests_on');
  if (error) return [];
  return (data as ContestOn[]) ?? [];
}

export async function readContest(
  id: string
): Promise<{ ok: boolean; reason?: string; contest?: Contest; entries?: ContestEntry[] }> {
  if (!supabase) return { ok: false, reason: 'not connected' };
  const { data, error } = await supabase.rpc('contest_view', { p_contest: id });
  if (error) return { ok: false, reason: error.message };
  return data as { ok: boolean; reason?: string; contest?: Contest; entries?: ContestEntry[] };
}

/**
 * Links for the photographs about to be drawn.
 *
 * The bucket is private -- these are pictures taken on people's own phones in
 * their own kitchens, and a public bucket is a URL that keeps working for
 * anybody who ever sees it. So each path is exchanged for a link that expires,
 * in one round trip for the whole page rather than one per entry.
 *
 * A path that cannot be signed is left out rather than failing the page: one
 * photograph that has gone missing should cost its own tile, not the contest.
 */
export async function photoLinks(paths: string[]): Promise<Record<string, string>> {
  const want = [...new Set(paths.filter(Boolean))];
  if (!supabase || want.length === 0) return {};
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(want, 3600);
  if (error || !data) return {};
  const links: Record<string, string> = {};
  for (const row of data) {
    if (row.signedUrl && row.path) links[row.path] = row.signedUrl;
  }
  return links;
}

/** What a phone will hand us, and what the bucket accepts. HEIC is here
 *  because that is what an iPhone photographs in by default. */
const KINDS = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
const MOST = 10 * 1024 * 1024;

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
};

/**
 * Putting the photograph in the bucket.
 *
 * Under a folder named for the person uploading, which is what the storage
 * policy checks: everyone may read the bucket -- a contest is looked at by the
 * whole company -- but you may only write into your own folder, so nobody can
 * overwrite somebody else's pumpkin with their own.
 *
 * The size and kind are checked here as well as by the bucket so that a photo
 * that is never going to be accepted is refused in a sentence, rather than as
 * an HTTP status after a two-minute upload over hotel wifi.
 */
export async function uploadPhoto(file: File): Promise<{ ok: boolean; reason?: string; path?: string }> {
  if (!supabase) return { ok: false, reason: 'not connected' };
  if (!KINDS.includes(file.type)) {
    return { ok: false, reason: 'that needs to be a photo — JPEG, PNG, WebP or HEIC' };
  }
  if (file.size > MOST) {
    return { ok: false, reason: 'that photo is over 10MB; a smaller one will do' };
  }
  const { data: who } = await supabase.auth.getUser();
  const uid = who?.user?.id;
  if (!uid) return { ok: false, reason: 'sign in first' };
  const path = `${uid}/${crypto.randomUUID()}.${EXT[file.type] ?? 'jpg'}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (error) return { ok: false, reason: error.message };
  return { ok: true, path };
}

export async function saveEntry(e: {
  contest: string;
  /** the entry being changed, or null for a new one */
  id?: string | null;
  title: string;
  blurb?: string;
  imagePath?: string | null;
  /** whose it is; only an organiser entering on somebody's behalf may say */
  entrant?: string | null;
}): Promise<{ ok: boolean; reason?: string; id?: string }> {
  if (!supabase) return { ok: false, reason: 'not connected' };
  const { data, error } = await supabase.rpc('save_contest_entry', {
    p_contest: e.contest,
    p_entry: e.id ?? null,
    p_title: e.title.trim(),
    p_blurb: (e.blurb ?? '').trim() || null,
    p_image_path: e.imagePath ?? null,
    p_entrant: e.entrant ?? null,
  });
  if (error) return { ok: false, reason: error.message };
  return data as { ok: boolean; reason?: string; id?: string };
}

export async function deleteEntry(id: string): Promise<{ ok: boolean; reason?: string }> {
  if (!supabase) return { ok: false, reason: 'not connected' };
  const { data, error } = await supabase.rpc('delete_contest_entry', { p_entry: id });
  if (error) return { ok: false, reason: error.message };
  return data as { ok: boolean; reason?: string };
}

// --- setting one up -------------------------------------------------------

export type ContestRow = Omit<Contest, 'may_enter'> & { entries: number };

export async function readContests(): Promise<{ ok: boolean; reason?: string; contests?: ContestRow[] }> {
  if (!supabase) return { ok: false, reason: 'not connected' };
  const { data, error } = await supabase.rpc('contests_sheet');
  if (error) return { ok: false, reason: error.message };
  return data as { ok: boolean; reason?: string; contests?: ContestRow[] };
}

export async function saveContest(c: {
  id: string | null;
  name: string;
  blurb?: string;
  entriesOpen: string;
  entriesClose: string;
  votesOpen: string;
  votesClose: string;
  whoEnters: 'players' | 'admins';
  entrantsShown: boolean;
  votersShown: boolean;
  picks: number;
  prize?: string;
}): Promise<{ ok: boolean; reason?: string; id?: string }> {
  if (!supabase) return { ok: false, reason: 'not connected' };
  const { data, error } = await supabase.rpc('save_contest', {
    p_id: c.id,
    p_name: c.name.trim(),
    p_blurb: (c.blurb ?? '').trim() || null,
    p_entries_open: c.entriesOpen,
    p_entries_close: c.entriesClose,
    p_votes_open: c.votesOpen,
    p_votes_close: c.votesClose,
    p_who_enters: c.whoEnters,
    p_entrants_shown: c.entrantsShown,
    p_voters_shown: c.votersShown,
    p_picks: c.picks,
    p_prize: (c.prize ?? '').trim() || null,
  });
  if (error) return { ok: false, reason: error.message };
  return data as { ok: boolean; reason?: string; id?: string };
}

export async function deleteContest(id: string): Promise<{ ok: boolean; reason?: string }> {
  if (!supabase) return { ok: false, reason: 'not connected' };
  const { data, error } = await supabase.rpc('delete_contest', { p_id: id });
  if (error) return { ok: false, reason: error.message };
  return data as { ok: boolean; reason?: string };
}
