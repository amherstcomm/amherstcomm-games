// Giveaways: drawings for staff, from the browser's side.
//
// Two jobs here. One is talking to the server, which decides everything --
// who may run a giveaway, who is in it, what the odds are, who was drawn.
// The other is *checking* the server: a drawing is only trustworthy if
// somebody other than the people running it can redo it. So this file has its
// own copy of the fingerprint and the pick (snapshotText, pickWinners), which
// must match giveaway_snapshot_text and giveaway_pick in schema.sql exactly --
// tests/unit/giveaways.test.ts and supabase/tests/giveaways.sql pin both to
// the same inputs and the same answer -- and it fetches the round from drand
// itself rather than taking the server's word for it.
import { supabase } from '@/supabase';

export type GiveawayStatus = 'open' | 'drawing' | 'judging' | 'qualified' | 'drawn' | 'cancelled';

/** Drawn at random; answered and judged; or answered, rated, and drawn from
 *  the entries that met the bar. */
export type GiveawayMode = 'draw' | 'judged' | 'screened';

export type GiveawaySummary = {
  id: string;
  title: string;
  prize: string;
  winners: number;
  event_on: string | null;
  status: GiveawayStatus;
  self_entry: boolean;
  entries_close_at: string | null;
  entrants: number;
  /** whether the person reading is in it */
  entered: boolean;
  /** the names drawn so far, less anybody who declined */
  drawn: string[];
  mode?: GiveawayMode;
};

export type Giveaway = {
  id: string;
  title: string;
  prize: string;
  details: string;
  winners: number;
  event_on: string | null;
  self_entry: boolean;
  entries_close_at: string | null;
  strength: number;
  half_life_days: number;
  /** absent from a database that has not had judged giveaways applied */
  mode?: GiveawayMode;
  /** how many entries each judge ranks */
  picks?: number;
  /** the average rating that puts a rated entry into the drawing */
  bar?: number;
  status: GiveawayStatus;
  cancelled_reason: string | null;
  /** extra tickets per trivia point, and the sessions that score them */
  trivia_bonus?: number;
  sessions?: TriviaSession[];
  created_at: string;
  created_by: string | null;
};

export type Attended = { on: string; what: string };

export type Entrant = {
  person: string;
  name: string;
  /** joined to an account, rather than a name an organiser typed */
  linked: boolean;
  entered_at: string;
  entered_by: string | null;
  /** put themselves in, rather than being entered */
  self: boolean;
  /** today's weight; a committed drawing keeps its own */
  weight: number;
  attended: Attended[];
  /** a rated one's: in the pool or not, once it is set */
  qualified?: boolean | null;
  /** points scored in the giveaway's trivia */
  trivia?: number;
};

/** Who a drawing is between, frozen when it was committed. */
export type DrawEntrant = { person: string; name: string; weight: number; trivia?: number };

/** A trivia session linked to a giveaway: every point scored in it adds
 *  extra tickets in the drawing. */
export type TriviaSession = {
  id: string;
  title: string;
  state: 'draft' | 'live' | 'closed';
  mode: string;
  opens_at: string | null;
  closes_at: string | null;
};

export type Pick = DrawEntrant & {
  pick: number;
  /** sha256(randomness:fingerprint:pick), hex */
  hash: string;
  /** that hash's first 13 hex digits, modulo the weight left in the draw */
  target: number;
  total: number;
};

export type Draw = {
  id: string;
  seq: number;
  reason: string;
  wanted: number;
  entrants: DrawEntrant[];
  total: number;
  snapshot_hash: string;
  chain: string;
  round: number;
  round_at: string;
  committed_at: string;
  committed_by: string | null;
  randomness: string | null;
  signature: string | null;
  winners: Pick[] | null;
  revealed_at: string | null;
  revealed_by: string | null;
};

export type WinnerStatus = 'pending' | 'accepted' | 'declined';

export type Winner = {
  person: string;
  name: string;
  pick: number;
  draw: number;
  status: WinnerStatus;
  decided_at: string | null;
  decided_by: string | null;
};

export type LogEntry = {
  at: string;
  actor: string | null;
  action: string;
  detail: Record<string, unknown>;
};

export type Chain = { hash: string; genesis: number; period: number };

export type GiveawayDetail = {
  can_manage: boolean;
  /** the reader's own record, if a drawing has ever named them */
  me: string | null;
  chain: Chain;
  giveaway: Giveaway;
  entrants: Entrant[];
  draws: Draw[];
  winners: Winner[];
  log: LogEntry[];
};

export type HistoryPerson = {
  person: string;
  name: string;
  linked: boolean;
  entries: number;
  wins: number;
  /** at the default fade, as of today */
  weight: number;
  attended: (Attended & { id: string; source: 'giveaway' | 'manual'; giveaway: string | null })[];
};

export type Found = { person: string | null; user: string | null; name: string; email: string | null };

type Answer<T = object> = ({ ok: true } & T) | { ok: false; reason: string };

const fail = (reason: string) => ({ ok: false as const, reason });

async function call<T = object>(fn: string, args?: Record<string, unknown>): Promise<Answer<T>> {
  if (!supabase) return fail('not connected');
  const { data, error } = await supabase.rpc(fn, args);
  if (error) return fail(error.message);
  if (!data) return fail('no answer');
  const got = data as { ok?: boolean; reason?: string };
  if (!got.ok) return fail(got.reason ?? 'that did not work');
  return data as Answer<T>;
}

export const readGiveaways = () =>
  call<{ can_manage: boolean; giveaways: GiveawaySummary[] }>('giveaways_list');

export const readGiveaway = (id: string) => call<GiveawayDetail>('giveaway_detail', { p_id: id });

export const readGiveawayHistory = () =>
  call<{ can_manage: boolean; people: HistoryPerson[]; log: LogEntry[] }>('giveaway_history');

export async function findGiveawayPeople(query: string): Promise<Found[]> {
  if (query.trim().length < 2) return [];
  const got = await call<{ people: Found[] }>('find_giveaway_people', { p_query: query });
  return got.ok ? got.people : [];
}

export type GiveawayForm = {
  title: string;
  prize: string;
  details: string;
  winners: number;
  eventOn: string;
  selfEntry: boolean;
  /** local date-time, as a datetime-local field holds it; empty is never */
  entriesCloseAt: string;
  strength: number;
  halfLifeDays: number;
  mode: GiveawayMode;
  /** how many entries each judge ranks, for a judged one */
  picks: number;
  /** the questions, in order, for a judged one */
  questions: string[];
  /** the average rating an entry needs to go into the drawing, for a rated one */
  bar: number;
};

export const saveGiveaway = (id: string | null, f: GiveawayForm) =>
  call<{ id: string }>('save_giveaway', {
    p_id: id,
    p_title: f.title,
    p_prize: f.prize,
    p_details: f.details,
    p_winners: f.winners,
    p_event_on: f.eventOn || null,
    p_self_entry: f.selfEntry,
    p_entries_close_at: f.entriesCloseAt ? new Date(f.entriesCloseAt).toISOString() : null,
    p_strength: f.strength,
    p_half_life_days: f.halfLifeDays,
    p_mode: f.mode,
    p_picks: f.picks,
    p_questions: f.mode !== 'draw' ? f.questions.map((q) => q.trim()).filter(Boolean) : [],
    p_bar: f.bar,
  });

export const cancelGiveaway = (id: string, reason: string) =>
  call('cancel_giveaway', { p_id: id, p_reason: reason });

export const enterGiveaway = (id: string, inIt: boolean) => call('enter_giveaway', { p_id: id, p_in: inIt });

/** An organiser entering somebody: an existing record, an account, or a name. */
export const addEntrant = (id: string, who: { person?: string | null; user?: string | null; name?: string }) =>
  call<{ person: string }>('add_giveaway_entrant', {
    p_id: id,
    p_person: who.person ?? null,
    p_user: who.user ?? null,
    p_name: who.name ?? null,
  });

export const removeEntrant = (id: string, person: string) =>
  call('remove_giveaway_entrant', { p_id: id, p_person: person });

export const commitDraw = (id: string) =>
  call<{ draw: string; seq: number; round: number; round_at: string; snapshot_hash: string }>(
    'commit_giveaway_draw',
    { p_id: id }
  );

export const revealDraw = (draw: string, beacon: Beacon) =>
  call<{ winners: Pick[] }>('reveal_giveaway_draw', {
    p_draw: draw,
    p_round: beacon.round,
    p_randomness: beacon.randomness,
    p_signature: beacon.signature,
  });

export const decideWinner = (id: string, person: string, status: WinnerStatus) =>
  call('decide_giveaway_winner', { p_id: id, p_person: person, p_status: status });

export const recordAttendance = (
  who: { person?: string | null; user?: string | null; name?: string },
  on: string,
  what: string
) =>
  call<{ id: string; person: string }>('record_giveaway_attendance', {
    p_person: who.person ?? null,
    p_user: who.user ?? null,
    p_name: who.name ?? null,
    p_on: on,
    p_what: what,
  });

export const deleteAttendance = (id: string) => call('delete_giveaway_attendance', { p_id: id });

// ---------------------------------------------------------------------------
// Judged giveaways
// ---------------------------------------------------------------------------

export type JudgedEntry = {
  /** who it is, once the results are out */
  person: string | null;
  /** an organiser's handle on it, for settling a tie */
  key: string | null;
  /** what a judge sees instead of a name: "Entry 3" */
  label: string;
  name: string | null;
  /** the reader's own entry, which a judge may not rank */
  own: boolean;
  answers: { question: string; answer: string }[];
  points: number | null;
  firsts: number | null;
  /** each judge's rank for it, once the results are out */
  ranks: { judge: string; rank: number }[] | null;
  /** a rated one's: the average, how many judges rated it, whether it is in
   *  the pool, and each judge's rating once the pool is set */
  average?: number | null;
  rated_by?: number | null;
  qualified?: boolean | null;
  ratings?: { judge: string; rating: number }[] | null;
};

export type Judging = {
  is_judge: boolean;
  decided: boolean;
  picks: number;
  questions: { id: string; prompt: string }[];
  judges: { user: string; name: string; ranked: boolean }[];
  entries_count: number;
  /** the reader's own answers, by question id */
  mine: Record<string, string> | null;
  entered: boolean;
  entries: JudgedEntry[];
  /** a judge's own ranking, best first, by label */
  my_ranking: string[] | null;
  mode?: GiveawayMode;
  bar?: number;
  /** a judge's own ratings, by label, for a rated one */
  my_ratings?: Record<string, number> | null;
};

export const readJudging = (id: string) => call<Judging>('giveaway_judging', { p_id: id });

/** Enter by answering -- yourself, or for an organiser, somebody else. */
export const enterJudged = (
  id: string,
  answers: Record<string, string>,
  who?: { person?: string | null; user?: string | null; name?: string }
) =>
  call<{ person: string }>('enter_judged_giveaway', {
    p_id: id,
    p_answers: answers,
    p_person: who?.person ?? null,
    p_user: who?.user ?? null,
    p_name: who?.name ?? null,
  });

export const addJudge = (id: string, user: string) => call('add_giveaway_judge', { p_id: id, p_user: user });
export const removeJudge = (id: string, user: string) => call('remove_giveaway_judge', { p_id: id, p_user: user });
export const startJudging = (id: string) => call('start_giveaway_judging', { p_id: id });
export const saveRanking = (id: string, labels: string[]) =>
  call('save_giveaway_ranking', { p_id: id, p_labels: labels });

/** What a tie at the last winning place looks like: how many of the tied to
 *  choose, and which they are. */
export type Tie = { need: number; points: number; tied: { key: string; label: string }[] };

/** Announce, or hear that a tie needs settling first. */
async function settling(
  fn: string,
  args: Record<string, unknown>
): Promise<{ ok: true; person?: string } | { ok: false; reason: string; tie?: Tie }> {
  if (!supabase) return fail('not connected');
  const { data, error } = await supabase.rpc(fn, args);
  if (error) return fail(error.message);
  const got = (data ?? {}) as { ok?: boolean; reason?: string; person?: string } & Partial<Tie>;
  if (got.ok) return { ok: true, person: got.person };
  if (got.reason === 'tie') {
    return { ok: false, reason: 'tie', tie: { need: Number(got.need), points: Number(got.points), tied: got.tied ?? [] } };
  }
  return fail(got.reason ?? 'that did not work');
}

/** A judge's ratings, 1 to 5, by the labels they were shown. */
export const saveRatings = (id: string, ratings: Record<string, number>) =>
  call('save_giveaway_ratings', { p_id: id, p_ratings: ratings });

/** Set the pool: every entry averaging the bar or more goes into the drawing. */
export const qualifyGiveaway = (id: string, bar: number) =>
  call<{ in: number }>('qualify_giveaway', { p_id: id, p_bar: bar });

export const announceResults = (id: string, tiebreak?: string[]) =>
  settling('announce_giveaway_results', { p_id: id, p_tiebreak: tiebreak ?? null });

export const offerPlace = (id: string, person?: string) =>
  settling('offer_giveaway_place', { p_id: id, p_person: person ?? null });

export const updatePerson = (person: string, change: { name?: string; user?: string }) =>
  call('update_giveaway_person', { p_person: person, p_name: change.name ?? null, p_user: change.user ?? null });

// ---------------------------------------------------------------------------
// The beacon
// ---------------------------------------------------------------------------

export type Beacon = { round: number; randomness: string; signature: string };

/** Independent relays for the same chain. A drawing is checked against
 *  whichever answers; two that disagreed would mean one is lying, which is
 *  drand's problem to have, and the page says what it got. */
export const DRAND_RELAYS = ['https://api.drand.sh', 'https://drand.cloudflare.com'];

/** When a round comes out. */
export function roundTime(chain: Chain, round: number): number {
  return (chain.genesis + (round - 1) * chain.period) * 1000;
}

/** A round from drand, or null if it is not out yet or nobody answered. */
export async function fetchRound(
  chainHash: string,
  round: number,
  fetchImpl: typeof fetch = fetch
): Promise<Beacon | null> {
  for (const relay of DRAND_RELAYS) {
    try {
      const res = await fetchImpl(`${relay}/${chainHash}/public/${round}`);
      if (!res.ok) continue;
      const got = (await res.json()) as Partial<Beacon>;
      if (got.round === round && typeof got.randomness === 'string' && typeof got.signature === 'string') {
        return { round, randomness: got.randomness.toLowerCase(), signature: got.signature.toLowerCase() };
      }
    } catch {
      // the next relay
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// The arithmetic, which must agree with schema.sql to the character
// ---------------------------------------------------------------------------

export async function sha256Hex(text: string | Uint8Array): Promise<string> {
  const bytes = typeof text === 'string' ? new TextEncoder().encode(text) : text;
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function hexBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** Byte order, as Postgres sorts with collate "C". localeCompare would not
 *  do: it is the viewer's locale, and the order decides who wins. */
const byPerson = (a: DrawEntrant, b: DrawEntrant) => (a.person < b.person ? -1 : a.person > b.person ? 1 : 0);

/** Exactly the text the fingerprint is taken of: giveaway_snapshot_text. */
export function snapshotText(
  giveaway: string,
  draw: { seq: number; wanted: number; chain: string; round: number; entrants: DrawEntrant[] }
): string {
  return [
    'amherstcomm-giveaway-v1',
    `giveaway ${giveaway}`,
    `draw ${draw.seq}`,
    `winners ${draw.wanted}`,
    `chain ${draw.chain}`,
    `round ${draw.round}`,
    ...[...draw.entrants].sort(byPerson).map((e) => `${e.person} ${e.weight}`),
  ].join('\n');
}

/** Who a randomness picks: giveaway_pick. For each pick, hash the randomness,
 *  the fingerprint and the pick's number; read the first 13 hex digits (52
 *  bits, held exactly by a double); take that modulo the weight still in the
 *  draw; and the entrant whose share of the running total it lands in wins and
 *  leaves the draw. */
export async function pickWinners(
  entrants: DrawEntrant[],
  snapshotHash: string,
  randomness: string,
  wanted: number
): Promise<Pick[]> {
  const pool = [...entrants].sort(byPerson);
  const picked: Pick[] = [];
  for (let k = 1; k <= Math.min(wanted, entrants.length); k++) {
    const total = pool.reduce((sum, e) => sum + e.weight, 0);
    const hash = await sha256Hex(`${randomness}:${snapshotHash}:${k}`);
    const target = parseInt(hash.slice(0, 13), 16) % total;
    let acc = 0;
    for (let i = 0; i < pool.length; i++) {
      acc += pool[i].weight;
      if (target < acc) {
        picked.push({ ...pool[i], pick: k, hash, target, total });
        pool.splice(i, 1);
        break;
      }
    }
  }
  return picked;
}

export type Check = {
  /** the fingerprint is of exactly these entrants, weights and round */
  fingerprint: boolean;
  /** drand's own copy of the round, or null if drand could not be asked */
  beacon: Beacon | null;
  /** the randomness on record is drand's */
  randomness: boolean | null;
  /** the winners on record are the ones that randomness picks */
  winners: boolean | null;
  /** who drand's randomness picks, whatever the server says */
  picks: Pick[] | null;
};

/** Redo a drawing from nothing but its commitment and drand. */
export async function checkDraw(
  giveaway: string,
  draw: Draw,
  fetchImpl: typeof fetch = fetch
): Promise<Check> {
  const fingerprint = (await sha256Hex(snapshotText(giveaway, draw))) === draw.snapshot_hash;
  const beacon = Date.now() >= Date.parse(draw.round_at) ? await fetchRound(draw.chain, draw.round, fetchImpl) : null;
  // A relay is only trusted as far as its signature hashing to its randomness;
  // past that, two independent relays agreeing is the check.
  const genuine = beacon && (await sha256Hex(hexBytes(beacon.signature))) === beacon.randomness ? beacon : null;
  const picks = genuine ? await pickWinners(draw.entrants, draw.snapshot_hash, genuine.randomness, draw.wanted) : null;
  return {
    fingerprint,
    beacon: genuine,
    randomness: genuine && draw.randomness ? genuine.randomness === draw.randomness : null,
    winners:
      picks && draw.winners
        ? picks.length === draw.winners.length && picks.every((p, i) => p.person === draw.winners![i].person)
        : null,
    picks,
  };
}

/** The highlight's path to a winner: a run of steps through the tiles left in
 *  the draw, slowing down, ending on the winner. From the pick's hash, so it
 *  is the same every time. */
export function spinPath(hash: string, tiles: number, landOn: number): number[] {
  if (tiles <= 1) return [landOn];
  const steps = 18 + (parseInt(hash.slice(13, 15), 16) % tiles) + 2 * Math.min(tiles, 8);
  const start = (((landOn - steps) % tiles) + tiles) % tiles;
  return Array.from({ length: steps + 1 }, (_, i) => (start + i) % tiles);
}

/** A weight as a chance, given everybody else's. */
export function chance(weight: number, total: number): string {
  if (total <= 0) return '—';
  const pct = (100 * weight) / total;
  return pct >= 10 ? `${pct.toFixed(0)}%` : pct >= 1 ? `${pct.toFixed(1)}%` : `${pct.toFixed(2)}%`;
}

/** The odds settings as an organiser is asked them: somebody's chance right
 *  after going, and a year after, each as a percentage of the chance of
 *  somebody who has never been. The server stores the curve's two numbers
 *  instead -- how hard a visit counts against (strength) and how fast that
 *  fades (half-life) -- and these two convert between the pair.
 *
 *  Asked as chances because the curve's own terms read wrong: "counts half as
 *  much after a year" halves the penalty, not the chance, and a person a year
 *  on is at 67%, not 50%. */
export function oddsSettings(strength: number, halfLifeDays: number): { after: number; year: number } {
  return {
    after: Math.round(100 / (1 + strength)),
    year: Math.round(100 / (1 + strength * 0.5 ** (365 / halfLifeDays))),
  };
}

export function curveFor(
  after: number,
  year: number
): { ok: true; strength: number; halfLifeDays: number } | { ok: false; reason: string } {
  if (!(after >= 10 && after <= 100)) {
    return { ok: false, reason: 'Right after going is between 10% and 100%.' };
  }
  // 100% right after is "attendance does not count": no curve to fit.
  if (after === 100) return { ok: true, strength: 0, halfLifeDays: 365 };
  const strength = 100 / after - 1;
  if (!(year > after)) {
    return { ok: false, reason: 'A year after has to be higher than right after: the chance comes back over time.' };
  }
  if (!(year < 100)) return { ok: false, reason: 'A year after is under 100%: the chance never quite comes all the way back.' };
  const halfLifeDays = Math.round((365 * Math.LN2) / Math.log(strength / (100 / year - 1)));
  // The server's range: a week to ten years.
  if (halfLifeDays > 3650) {
    const least = Math.ceil(100 / (1 + strength / 2 ** (365 / 3650)));
    return { ok: false, reason: `That comes back too slowly to keep track of. Try ${least}% or more a year after.` };
  }
  if (halfLifeDays < 7) return { ok: false, reason: 'That comes back too quickly. Try a lower figure a year after.' };
  return { ok: true, strength: Math.round(strength * 10_000) / 10_000, halfLifeDays };
}

/** How the server weighs somebody: giveaway_weight. For explaining a weight
 *  on the page; the drawing uses the server's number, frozen at commit. */
export function weightFor(attended: { on: string }[], asOf: string, strength: number, halfLifeDays: number): number {
  const day = (d: string) => Date.parse(`${d}T00:00:00Z`) / 86_400_000;
  const load = attended.reduce((sum, a) => sum + 0.5 ** (Math.max(0, day(asOf) - day(a.on)) / halfLifeDays), 0);
  return Math.max(1, Math.round(1_000_000 / (1 + strength * load)));
}

// ---------------------------------------------------------------------------
// Trivia for extra chances
// ---------------------------------------------------------------------------

export const setGiveawayTrivia = (id: string, sessions: string[], bonus: number) =>
  call('set_giveaway_trivia', { p_id: id, p_sessions: sessions, p_bonus: bonus });

export const readTriviaChoices = () => call<{ sessions: TriviaSession[] }>('giveaway_trivia_choices');

/** Sessions belonging to a giveaway still taking part: a tournament that
 *  shuts other sessions out lets these in. Empty when the database cannot say. */
export async function readGiveawayTriviaSessions(): Promise<string[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc('giveaway_trivia_sessions');
  if (error || !Array.isArray(data)) return [];
  return data as string[];
}
