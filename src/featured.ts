// What is featured on the home page: a trivia session, a giveaway, a contest
// or a tournament, put there by whoever runs it, with a blurb and a picture
// if they like, between dates if they like. The server decides what shows
// (home_features); this reads it, and words each card.
import { supabase } from '@/supabase';
import { cropped, signedLinker } from '@/signedLinks';
import type { Page } from '@/routing/nav';
import { timeWord } from '@/contests';

export type FeaturePage = Exclude<Page, { kind: 'game' }>;

export type FeatureKind = 'session' | 'giveaway' | 'contest' | 'tournament';

export const KIND_WORD: Record<FeatureKind, string> = {
  session: 'Trivia',
  giveaway: 'Giveaway',
  contest: 'Contest',
  tournament: 'Tournament',
};

/** What the server says about the thing itself; which fields depends on the kind. */
export type FeatureItem = {
  title: string;
  // session
  state?: string;
  mode?: 'live' | 'open';
  opens_at?: string | null;
  closes_at?: string | null;
  // giveaway
  prize?: string | null;
  status?: string;
  entries_close_at?: string | null;
  entered?: boolean;
  // contest
  phase?: 'soon' | 'entries' | 'judging' | 'voting' | 'over';
  entries_open_on?: string;
  entries_close_on?: string;
  votes_open_on?: string;
  votes_close_on?: string;
  entries_close_time?: string | null;
  votes_close_time?: string | null;
  // tournament
  starts_on?: string;
  ends_on?: string;
  on?: boolean;
};

export type Feature = {
  id: string;
  kind: FeatureKind;
  ref: string;
  blurb: string;
  image: string | null;
  item: FeatureItem;
};

export type FeatureRow = Omit<Feature, 'item'> & {
  item: FeatureItem | null;
  title: string | null;
  starts_at: string | null;
  ends_at: string | null;
  position: number;
  showing: boolean;
  why_not: string | null;
};

export type Choice = { id: string; title: string; state: string };

type Answer<T = object> = ({ ok: true } & T) | { ok: false; reason: string };

async function call<T = object>(fn: string, args?: Record<string, unknown>): Promise<Answer<T>> {
  if (!supabase) return { ok: false, reason: 'not connected' };
  const { data, error } = await supabase.rpc(fn, args);
  if (error) return { ok: false, reason: error.message };
  // An array, or anything else that is not one of our answers, is no answer:
  // a stub or an older database, and a page should not trust its fields.
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { ok: false, reason: 'no answer' };
  const d = data as { ok?: boolean; reason?: string };
  return d.ok === false ? { ok: false, reason: d.reason ?? 'refused' } : ({ ok: true, ...(data as T) } as Answer<T>);
}

export const readHomeFeatures = () => call<{ features: Feature[] }>('home_features');

export const readFeaturesSheet = () =>
  call<{
    can: Record<FeatureKind, boolean>;
    features: FeatureRow[];
    choices: Record<FeatureKind, Choice[]>;
  }>('home_features_sheet');

export type FeatureForm = {
  kind: FeatureKind;
  ref: string;
  blurb: string;
  image: string | null;
  /** local date-time, as a datetime-local field holds it; empty is open-ended */
  startsAt: string;
  endsAt: string;
  position: number;
};

export const saveFeature = (f: FeatureForm) =>
  call<{ id: string }>('save_home_feature', {
    p_kind: f.kind,
    p_ref: f.ref,
    p_blurb: f.blurb,
    p_image: f.image,
    p_starts_at: f.startsAt ? new Date(f.startsAt).toISOString() : null,
    p_ends_at: f.endsAt ? new Date(f.endsAt).toISOString() : null,
    p_position: f.position,
  });

export const removeFeature = (id: string) => call('remove_home_feature', { p_id: id });

// ---------------------------------------------------------------------------
// Pictures
// ---------------------------------------------------------------------------

export const BUCKET = 'featured';
export const pictureLink = signedLinker(BUCKET);

/** A card's picture, cropped to 16:9 at 960 by 540 in the browser. Returns
 *  the stored path, for the save that follows. */
export async function uploadFeaturePicture(file: File): Promise<Answer<{ path: string }>> {
  if (!supabase) return { ok: false, reason: 'not connected' };
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    return { ok: false, reason: 'A JPEG, PNG or WebP picture, please.' };
  }
  if (file.size > 20 * 1024 * 1024) return { ok: false, reason: 'That picture is over 20 MB.' };
  const { data: u } = await supabase.auth.getUser();
  const uid = u.user?.id;
  if (!uid) return { ok: false, reason: 'not signed in' };
  let blob: Blob;
  try {
    blob = await cropped(file, 960, 540);
  } catch {
    return { ok: false, reason: 'That picture could not be read.' };
  }
  const ext = blob.type === 'image/webp' ? 'webp' : 'jpg';
  const path = `${uid}/feature-${crypto.randomUUID()}.${ext}`;
  const up = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: blob.type, upsert: false });
  if (up.error) return { ok: false, reason: up.error.message };
  return { ok: true, path };
}

// ---------------------------------------------------------------------------
// Wording a card
// ---------------------------------------------------------------------------

const when = (t: string) =>
  new Date(t).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });
const day = (d: string, t?: string | null) =>
  new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) +
  (t ? ` at ${timeWord(t)}` : '');

/** Where the card's button goes. */
export function featureRoute(f: Pick<Feature, 'kind' | 'ref'>): FeaturePage {
  switch (f.kind) {
    case 'session':
      return { kind: 'live', session: f.ref, host: false };
    case 'giveaway':
      return { kind: 'giveaways', giveaway: f.ref, view: 'page' };
    case 'contest':
      return { kind: 'contest', contest: f.ref };
    case 'tournament':
      return { kind: 'tournament', slug: null };
  }
}

/** One line on where it stands, and the button's word. */
export function cardWords(f: Pick<Feature, 'kind' | 'item'>): { status: string; action: string } {
  const it = f.item;
  switch (f.kind) {
    case 'session':
      if (it.mode === 'open') {
        return { status: it.closes_at ? `Open until ${when(it.closes_at)}` : 'Open now', action: 'Play' };
      }
      return it.state === 'live' ? { status: 'Live now', action: 'Join' } : { status: 'Coming up', action: 'See it' };
    case 'giveaway':
      if (it.status !== 'open') return { status: 'Being decided', action: 'See it' };
      if (it.entered) return { status: 'You’re in', action: 'See it' };
      return { status: it.entries_close_at ? `Entries close ${when(it.entries_close_at)}` : 'Taking entries', action: 'Enter' };
    case 'contest':
      switch (it.phase) {
        case 'entries':
          return { status: it.entries_close_on ? `Entries close ${day(it.entries_close_on, it.entries_close_time)}` : 'Taking entries', action: 'Enter' };
        case 'voting':
          return { status: it.votes_close_on ? `Voting until ${day(it.votes_close_on, it.votes_close_time)}` : 'Voting now', action: 'Vote' };
        case 'judging':
          return { status: 'Being judged', action: 'See it' };
        default:
          return { status: it.entries_open_on ? `Opens ${day(it.entries_open_on)}` : 'Coming soon', action: 'See it' };
      }
    case 'tournament':
      return it.on
        ? { status: it.ends_on ? `On now · ends ${day(it.ends_on)}` : 'On now', action: 'Play' }
        : { status: it.starts_on ? `Starts ${day(it.starts_on)}` : 'Coming soon', action: 'See it' };
  }
}
