// Auctions: items people bid real money on, paid for somewhere else.
//
// The site keeps the bids, the winner and whether they have paid; the money
// changes hands in cash, by cheque or through payroll, however the organiser's
// note says. Everything that decides anything -- whether a bid is high enough,
// whether it has closed, who may see whose bid -- is the server's. This file
// carries the answers and words them.
import { supabase } from '@/supabase';
import { signedLinker } from '@/signedLinks';
import { fromOfficeInput, when } from '@/schedule';

export type AuctionState = 'soon' | 'open' | 'closed';
export type Bidding = 'open' | 'sealed';

export type AuctionRow = {
  id: string;
  title: string;
  bidding: Bidding;
  opens_at: string;
  /** when the last of its items closes */
  ends_at: string;
  state: AuctionState;
  items: number;
  bids: number;
};

export type Person = { id: string; name: string; email: string };

export type AuctionItem = {
  id: string;
  title: string;
  blurb: string | null;
  donated_by: string | null;
  image_path: string | null;
  starting_bid: number;
  increment: number;
  /** when it closes, late bids included */
  closes_at: string;
  /** whether it closes at its own time rather than the auction's */
  own_close: boolean;
  /** a late bid has pushed the close back */
  extended: boolean;
  state: AuctionState;
  bids: number;
  /** the highest bid: always for open bidding, only after the close for sealed */
  high: number | null;
  /** the least a bid can be now; null once it has closed */
  min_bid: number | null;
  /** the reader's own highest bid on it */
  my_bid: number | null;
  /** whether the reader's bid is the highest; null when that is a secret */
  leading: boolean | null;
  won: boolean;
  paid: boolean;
  // an organiser's view only
  leader?: Person | null;
  leader_bid?: number | null;
  paid_at?: string | null;
  bid_list?: { id: string; amount: number; at: string; who: Person }[];
};

export type Auction = {
  id: string;
  title: string;
  blurb: string | null;
  payment_note: string | null;
  bidding: Bidding;
  /** zero is a hard close */
  extend_minutes: number;
  opens_at: string;
  closes_at: string;
  state: AuctionState;
};

export type LogLine = { at: string; action: string; detail: Record<string, unknown>; actor: string | null };

export type AuctionPage = {
  ok: boolean;
  reason?: string;
  can_manage?: boolean;
  auction?: Auction;
  items?: AuctionItem[];
  log?: LogLine[] | null;
};

type Answer<T = object> = ({ ok: true } & T) | { ok: false; reason?: string; min_bid?: number };

async function call<T = object>(fn: string, args?: Record<string, unknown>): Promise<Answer<T>> {
  if (!supabase) return { ok: false, reason: 'not connected' };
  const { data, error } = await supabase.rpc(fn, args);
  if (error) return { ok: false, reason: error.message };
  return data as Answer<T>;
}

export const readAuctions = () => call<{ can_manage: boolean; auctions: AuctionRow[] }>('auctions_list');

export async function readAuction(id: string): Promise<AuctionPage> {
  const got = await call<AuctionPage>('auction_view', { p_auction: id });
  return got as AuctionPage;
}

export const placeBid = (item: string, amount: number) =>
  call<{ extended: boolean }>('place_auction_bid', { p_item: item, p_amount: amount });

export const withdrawBid = (item: string) => call('withdraw_auction_bid', { p_item: item });

// --- running one -----------------------------------------------------------

export type AuctionForm = {
  id: string | null;
  title: string;
  blurb: string;
  paymentNote: string;
  bidding: Bidding;
  extendMinutes: number;
  /** company-clock datetime-local values */
  opensAt: string;
  closesAt: string;
};

const instant = (v: string) => (v ? (fromOfficeInput(v)?.toISOString() ?? null) : null);

export const saveAuction = (f: AuctionForm) =>
  call<{ id: string }>('save_auction', {
    p_id: f.id,
    p_title: f.title.trim(),
    p_blurb: f.blurb.trim() || null,
    p_payment_note: f.paymentNote.trim() || null,
    p_bidding: f.bidding,
    p_extend_minutes: f.bidding === 'open' ? f.extendMinutes : 0,
    p_opens_at: instant(f.opensAt),
    p_closes_at: instant(f.closesAt),
  });

export const deleteAuction = (id: string) => call('delete_auction', { p_id: id });

export type ItemForm = {
  id: string | null;
  title: string;
  blurb: string;
  donatedBy: string;
  imagePath: string | null;
  startingBid: number;
  increment: number;
  /** company-clock datetime-local, or empty to close with the auction */
  closesAt: string;
};

export const saveItem = (auction: string, f: ItemForm) =>
  call<{ id: string }>('save_auction_item', {
    p_auction: auction,
    p_item: f.id,
    p_title: f.title.trim(),
    p_blurb: f.blurb.trim() || null,
    p_donated_by: f.donatedBy.trim() || null,
    p_image_path: f.imagePath,
    p_starting_bid: f.startingBid,
    p_increment: f.increment,
    p_closes_at: instant(f.closesAt),
  });

export const deleteItem = (id: string) => call('delete_auction_item', { p_item: id });
export const removeBid = (id: string) => call('remove_auction_bid', { p_bid: id });
export const setPaid = (item: string, paid: boolean) =>
  call('set_auction_item_paid', { p_item: item, p_paid: paid });

// --- pictures --------------------------------------------------------------

export const BUCKET = 'auction-items';
export const pictureLink = signedLinker(BUCKET);

const PICTURES = ['image/jpeg', 'image/png', 'image/webp'];
export const PICTURE_ACCEPT = PICTURES.join(',');

/** Into the uploader's own folder, which is what the bucket's policy checks. */
export async function uploadItemPicture(file: File): Promise<Answer<{ path: string }>> {
  if (!supabase) return { ok: false, reason: 'not connected' };
  if (!PICTURES.includes(file.type)) return { ok: false, reason: 'A JPEG, PNG or WebP picture, please.' };
  if (file.size > 10 * 1024 * 1024) return { ok: false, reason: 'That picture is over 10 MB.' };
  const { data: u } = await supabase.auth.getUser();
  const uid = u.user?.id;
  if (!uid) return { ok: false, reason: 'not signed in' };
  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
  const path = `${uid}/item-${crypto.randomUUID()}.${ext}`;
  const up = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false });
  if (up.error) return { ok: false, reason: up.error.message };
  return { ok: true, path };
}

// --- words -----------------------------------------------------------------

/** Whole dollars, with separators: $1,250. */
export const dollars = (n: number) => `$${n.toLocaleString('en-US')}`;

/** A moment on the company clock: "Friday at 3:00 PM CDT". */
export const moment = (at: string) => when(new Date(at), new Date());

export const STATE_WORD: Record<AuctionState, string> = {
  soon: 'Not open yet',
  open: 'Taking bids',
  closed: 'Closed',
};

/** Where the reader stands on an item, in one sentence, or null for nothing
 *  worth saying. */
export function standing(i: AuctionItem, bidding: Bidding): string | null {
  if (i.state === 'closed') {
    if (i.won) return `You won this for ${dollars(i.high ?? 0)}.`;
    if (i.my_bid != null) return `Your bid of ${dollars(i.my_bid)} did not win.`;
    return null;
  }
  if (i.my_bid == null) return null;
  if (bidding === 'sealed') return `Your sealed bid: ${dollars(i.my_bid)}.`;
  return i.leading ? 'You are the highest bidder.' : `You have been outbid. Your bid was ${dollars(i.my_bid)}.`;
}

/** What the log says happened, for the organiser's page. */
export function logWords(l: LogLine): string {
  const d = l.detail ?? {};
  const item = typeof d.item === 'string' ? d.item : '';
  switch (l.action) {
    case 'created':
      return 'set it up';
    case 'changed':
      return d.closes_at ? `changed it, closing ${moment(String(d.closes_at))}` : 'changed it';
    case 'item added':
      return `added ${item}`;
    case 'item changed':
      return `changed ${item}`;
    case 'item deleted':
      return `deleted ${item}${Number(d.bids) > 0 ? ` and its ${d.bids} bids` : ''}`;
    case 'bid removed':
      return `removed ${String(d.bidder ?? 'somebody')}'s ${dollars(Number(d.amount ?? 0))} bid on ${item}`;
    case 'paid':
      return `marked ${item} paid`;
    case 'not paid':
      return `marked ${item} not paid`;
    default:
      return l.action;
  }
}
