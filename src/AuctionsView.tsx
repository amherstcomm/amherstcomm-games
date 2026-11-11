// Auctions, for the people bidding and the people running them.
//
// Without an id this is the list; with one it is the auction: what it is, how
// the bidding works, each item with its bid box, and -- for whoever runs
// auctions -- the editing, the bids with names on them, who has paid, and the
// log. On one page rather than an admin tab, the way giveaways are, because
// the person running it is usually watching it at the same time.
import { useCallback, useEffect, useState } from 'react';
import Waiting from '@/Waiting';
import RouteLink from '@/RouteLink';
import { drawable, officeZoneWord } from '@/contests';
import { toOfficeInput } from '@/schedule';
import {
  STATE_WORD,
  PICTURE_ACCEPT,
  deleteAuction,
  deleteItem,
  dollars,
  logWords,
  moment,
  pictureLink,
  placeBid,
  readAuction,
  readAuctions,
  removeBid,
  saveAuction,
  saveItem,
  setPaid,
  standing,
  uploadItemPicture,
  withdrawBid,
  type Auction,
  type AuctionForm,
  type AuctionItem,
  type AuctionPage,
  type AuctionRow,
  type ItemForm,
} from '@/auctions';

const FIELD =
  'w-full rounded-lg bg-white/5 border border-white/15 px-3 py-2 text-sm text-slate-200 ' +
  'placeholder:text-slate-500 focus:outline-none focus:border-accent';
const BUTTON =
  'inline-flex items-center justify-center px-3 h-9 rounded-lg text-sm font-semibold ' +
  'bg-white/10 border border-white/15 text-slate-200 hover:bg-white/15 disabled:opacity-50';
const PRIMARY =
  'inline-flex items-center justify-center px-4 h-9 rounded-lg text-sm font-semibold ' +
  'bg-accent text-slate-950 hover:brightness-110 disabled:opacity-50';
const CARD = 'rounded-xl border border-white/15 bg-white/5 p-4';
const LABEL = 'block text-xs font-semibold text-slate-400 mb-1';

/** Open bidding moves on other people's bids, so the page keeps up. */
const POLL_MS = 10_000;

/** How this page addresses another one: the app's own page link, narrowed to
 *  the one route this page ever points at. */
export type AuctionLink = (p: { kind: 'auctions'; auction: string | null }) => {
  to: string;
  onGo: () => void;
};

export default function AuctionsView({ auction, link }: { auction: string | null; link: AuctionLink }) {
  if (!auction) return <AuctionList link={link} />;
  return <OneAuction id={auction} link={link} />;
}

function AuctionList({ link }: { link: AuctionLink }) {
  const [rows, setRows] = useState<AuctionRow[] | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    void readAuctions().then((got) => {
      if (!got.ok) {
        setProblem(got.reason ?? 'That did not load');
        setRows([]);
        return;
      }
      setRows(got.auctions);
      setCanManage(got.can_manage);
    });
  }, []);

  if (!rows) return <Waiting what="auctions" />;
  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-slate-200">Auctions</h1>
        {canManage && !adding && (
          <button type="button" className={BUTTON} onClick={() => setAdding(true)}>
            New auction
          </button>
        )}
      </div>
      {problem === 'not signed in' ? (
        <p className="text-sm text-slate-400 mt-3">Sign in to see the auctions and bid.</p>
      ) : problem ? (
        <p className="text-sm text-rose-300 mt-3">{problem}</p>
      ) : null}
      {adding && (
        <div className="mt-4">
          <AuctionEditor
            auction={null}
            onDone={(id) => (id ? link({ kind: 'auctions', auction: id }).onGo() : setAdding(false))}
          />
        </div>
      )}
      {!problem && rows.length === 0 && (
        <p className="text-sm text-slate-400 mt-3">
          Nothing is up for auction just now. One shows up here once bidding opens.
        </p>
      )}
      {rows.length > 0 && (
        <ul className="mt-4 space-y-2">
          {rows.map((a) => (
            <li key={a.id}>
              <RouteLink
                {...link({ kind: 'auctions', auction: a.id })}
                className="block rounded-xl border border-white/15 bg-white/5 px-4 py-3 hover:bg-white/10"
              >
                <span className="flex items-center justify-between gap-3">
                  <span className="font-semibold text-slate-200">{a.title}</span>
                  <span className="text-xs text-slate-400">{STATE_WORD[a.state]}</span>
                </span>
                <span className="block text-xs text-slate-400 mt-1">
                  {a.items} {a.items === 1 ? 'item' : 'items'} · {a.bids} {a.bids === 1 ? 'bid' : 'bids'} ·{' '}
                  {a.state === 'soon'
                    ? `Opens ${moment(a.opens_at)}`
                    : a.state === 'open'
                      ? `Closes ${moment(a.ends_at)}`
                      : `Closed ${moment(a.ends_at)}`}
                </span>
              </RouteLink>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function OneAuction({ id, link }: { id: string; link: AuctionLink }) {
  const [page, setPage] = useState<AuctionPage | null>(null);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => setPage(await readAuction(id)), [id]);
  useEffect(() => {
    void load();
  }, [load]);

  const running = page?.auction?.state !== 'closed';
  useEffect(() => {
    if (!running) return;
    const t = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, POLL_MS);
    return () => window.clearInterval(t);
  }, [running, load]);

  if (!page) return <Waiting what="the auction" />;
  if (!page.ok || !page.auction) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <p className="text-sm text-slate-400">
          {page.reason === 'not signed in' ? 'Sign in to see this auction and bid.' : 'There is no such auction.'}
        </p>
        <RouteLink {...link({ kind: 'auctions', auction: null })} className="text-sm text-accent mt-3 inline-block">
          All auctions
        </RouteLink>
      </div>
    );
  }

  const a = page.auction;
  const items = page.items ?? [];
  const manage = !!page.can_manage;
  const sold = items.filter((i) => i.state === 'closed' && i.leader);

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <RouteLink {...link({ kind: 'auctions', auction: null })} className="text-sm text-accent hover:brightness-110">
        ← All auctions
      </RouteLink>

      <div className="mt-3 flex items-start justify-between gap-3">
        <h1 className="text-2xl font-bold text-white">{a.title}</h1>
        <span className="shrink-0 text-xs text-slate-400 mt-2">{STATE_WORD[a.state]}</span>
      </div>
      <p className="text-sm text-slate-300 mt-1">{headline(a)}</p>
      {a.blurb && <p className="text-sm text-slate-300 mt-3 whitespace-pre-line">{a.blurb}</p>}
      <p className="text-xs text-slate-400 mt-3">{howItWorks(a)}</p>
      {a.payment_note && (
        <div className={`${CARD} mt-4`}>
          <p className="text-xs uppercase tracking-wider text-slate-500 font-semibold">How winners pay</p>
          <p className="text-sm text-slate-200 mt-1 whitespace-pre-line">{a.payment_note}</p>
        </div>
      )}

      {manage && (
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className={BUTTON} onClick={() => setEditing((e) => !e)}>
            {editing ? 'Close the settings' : 'Change the auction'}
          </button>
          <button
            type="button"
            className={BUTTON}
            onClick={async () => {
              const bids = items.reduce((n, i) => n + i.bids, 0);
              const sure = window.confirm(
                `Delete ${a.title}${bids > 0 ? ` and its ${bids} ${bids === 1 ? 'bid' : 'bids'}` : ''}? This cannot be undone.`
              );
              if (!sure) return;
              const res = await deleteAuction(a.id);
              if (res.ok) link({ kind: 'auctions', auction: null }).onGo();
              else window.alert(res.reason ?? 'That did not work');
            }}
          >
            Delete the auction
          </button>
        </div>
      )}
      {manage && editing && (
        <div className="mt-4">
          <AuctionEditor
            auction={a}
            onDone={() => {
              setEditing(false);
              void load();
            }}
          />
        </div>
      )}

      {manage && sold.length > 0 && <Winners items={sold} onChange={load} />}

      {items.length === 0 ? (
        <p className="text-sm text-slate-400 mt-6">
          {manage ? 'Nothing in it yet. Add the first item below.' : 'Nothing has been put up yet.'}
        </p>
      ) : (
        <ul className="mt-6 grid gap-4 sm:grid-cols-2">
          {items.map((i) => (
            <li key={i.id}>
              <ItemCard item={i} auction={a} manage={manage} onChange={load} />
            </li>
          ))}
        </ul>
      )}

      {manage &&
        (adding ? (
          <div className="mt-6">
            <ItemEditor
              auction={a}
              item={null}
              onDone={() => {
                setAdding(false);
                void load();
              }}
            />
          </div>
        ) : (
          <button type="button" className={`${BUTTON} mt-6`} onClick={() => setAdding(true)}>
            Add an item
          </button>
        ))}

      {manage && page.log && page.log.length > 0 && (
        <section className="mt-10" aria-label="What has been done">
          <h2 className="text-sm font-semibold text-slate-200">What has been done</h2>
          <ul className="mt-2 space-y-1 text-xs text-slate-400">
            {page.log.map((l, n) => (
              <li key={n}>
                <span className="tabular-nums">{moment(l.at)}</span> · {l.actor ?? 'Somebody'} {logWords(l)}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function headline(a: Auction): string {
  if (a.state === 'soon') return `Bidding opens ${moment(a.opens_at)}.`;
  if (a.state === 'closed') return 'Bidding has closed.';
  return `Bidding closes ${moment(a.closes_at)}.`;
}

function howItWorks(a: Auction): string {
  if (a.bidding === 'sealed') {
    return (
      'Sealed bids: nobody sees anybody else’s bid until it closes. You can change yours or take it ' +
      'back until then. The highest bid wins, and on a tie the one made first.'
    );
  }
  const late =
    a.extend_minutes > 0
      ? ` A bid in the last ${a.extend_minutes} ${a.extend_minutes === 1 ? 'minute' : 'minutes'} moves the close ` +
        `to ${a.extend_minutes} ${a.extend_minutes === 1 ? 'minute' : 'minutes'} after it, so everybody gets a chance to answer.`
      : ' It closes on the dot.';
  return `Open bidding: the highest bid shows, and each new bid has to beat it by the amount on the item.${late}`;
}

function Picture({ path, alt }: { path: string | null; alt: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    if (!path) setUrl(null);
    else void pictureLink(path).then((u) => alive && setUrl(u));
    return () => {
      alive = false;
    };
  }, [path]);
  const src = drawable(url);
  if (!path) return null;
  return src ? (
    <img src={src} alt={alt} className="w-full aspect-[4/3] object-cover rounded-lg bg-black/20" />
  ) : (
    <div className="w-full aspect-[4/3] rounded-lg bg-black/20" />
  );
}

function ItemCard({
  item: i,
  auction: a,
  manage,
  onChange,
}: {
  item: AuctionItem;
  auction: Auction;
  manage: boolean;
  onChange: () => Promise<void>;
}) {
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const sealed = a.bidding === 'sealed';
  const me = standing(i, a.bidding);

  // The box starts at the least that will be taken, and follows it up as
  // other people bid -- unless somebody is part-way through typing.
  useEffect(() => {
    if (i.min_bid != null) setAmount((was) => (was === '' || Number(was) < i.min_bid! ? String(i.min_bid) : was));
  }, [i.min_bid]);

  async function bid() {
    const n = Number(amount);
    if (!Number.isInteger(n) || n < 1) {
      setNote('A bid is a whole number of dollars.');
      return;
    }
    const sure = window.confirm(
      `Bid ${dollars(n)} on ${i.title}? If you win, you are agreeing to pay it.`
    );
    if (!sure) return;
    setBusy(true);
    const res = await placeBid(i.id, n);
    setBusy(false);
    if (!res.ok) {
      setNote(res.reason ?? 'That bid did not go in');
      if (res.min_bid) setAmount(String(res.min_bid));
    } else {
      setNote(res.extended ? 'Your bid is in, and the close has moved back.' : 'Your bid is in.');
    }
    await onChange();
  }

  return (
    <article className={`${CARD} h-full flex flex-col gap-2`} aria-label={i.title}>
      <Picture path={i.image_path} alt={i.title} />
      <h2 className="text-base font-semibold text-white">{i.title}</h2>
      {i.donated_by && <p className="text-xs text-slate-400 -mt-1">Donated by {i.donated_by}</p>}
      {i.blurb && <p className="text-sm text-slate-300 whitespace-pre-line">{i.blurb}</p>}

      <p className="text-sm text-slate-200 tabular-nums">{priceLine(i, sealed)}</p>
      {i.state !== 'closed' && (i.own_close || i.extended) && (
        <p className="text-xs text-slate-400">
          {i.extended ? 'A late bid moved the close: now ' : 'This one closes '}
          {moment(i.closes_at)}
        </p>
      )}
      {me && (
        <p
          className={`text-sm font-semibold ${
            i.won || i.leading ? 'text-emerald-300' : i.leading === false ? 'text-amber-300' : 'text-slate-200'
          }`}
          role="status"
        >
          {me}
        </p>
      )}
      {i.won && a.payment_note && <p className="text-xs text-slate-400">{a.payment_note}</p>}

      {i.state === 'open' && !(i.leading && !sealed) && (
        <form
          className="mt-auto flex gap-2 items-end"
          onSubmit={(e) => {
            e.preventDefault();
            void bid();
          }}
        >
          <label className="flex-1">
            <span className={LABEL}>Your bid, in dollars</span>
            <input
              className={FIELD}
              type="number"
              inputMode="numeric"
              min={i.min_bid ?? 1}
              step={1}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </label>
          <button type="submit" className={PRIMARY} disabled={busy}>
            {sealed && i.my_bid != null ? 'Change bid' : 'Bid'}
          </button>
        </form>
      )}
      {i.state === 'open' && sealed && i.my_bid != null && (
        <button
          type="button"
          className={`${BUTTON} self-start`}
          disabled={busy}
          onClick={async () => {
            if (!window.confirm(`Take back your ${dollars(i.my_bid!)} bid on ${i.title}?`)) return;
            const res = await withdrawBid(i.id);
            setNote(res.ok ? 'Your bid has been taken back.' : (res.reason ?? 'That did not work'));
            await onChange();
          }}
        >
          Take my bid back
        </button>
      )}
      {note && (
        <p className="text-xs text-slate-300" role="status">
          {note}
        </p>
      )}

      {manage && (
        <div className="mt-3 pt-3 border-t border-white/10 space-y-2">
          {i.leader && (
            <p className="text-xs text-slate-300">
              {i.state === 'closed' ? 'Won by' : 'Highest'}: {i.leader.name} ({i.leader.email}),{' '}
              {dollars(i.leader_bid ?? 0)}
            </p>
          )}
          {(i.bid_list ?? []).length > 0 && (
            <details>
              <summary className="text-xs text-accent cursor-pointer">
                All {i.bid_list!.length} {i.bid_list!.length === 1 ? 'bid' : 'bids'}
              </summary>
              <ul className="mt-2 space-y-1">
                {i.bid_list!.map((b) => (
                  <li key={b.id} className="flex items-center justify-between gap-2 text-xs text-slate-300">
                    <span className="tabular-nums">
                      {dollars(b.amount)} · {b.who.name} · {moment(b.at)}
                    </span>
                    <button
                      type="button"
                      className="text-rose-300 hover:underline"
                      onClick={async () => {
                        const sure = window.confirm(
                          `Remove ${b.who.name}'s ${dollars(b.amount)} bid on ${i.title}? It goes in the log.`
                        );
                        if (!sure) return;
                        const res = await removeBid(b.id);
                        if (!res.ok) window.alert(res.reason ?? 'That did not work');
                        await onChange();
                      }}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="button" className={BUTTON} onClick={() => setEditing((e) => !e)}>
              {editing ? 'Close' : 'Change'}
            </button>
            <button
              type="button"
              className={BUTTON}
              onClick={async () => {
                const sure = window.confirm(
                  `Delete ${i.title}${i.bids > 0 ? ` and its ${i.bids} ${i.bids === 1 ? 'bid' : 'bids'}` : ''}?`
                );
                if (!sure) return;
                const res = await deleteItem(i.id);
                if (!res.ok) window.alert(res.reason ?? 'That did not work');
                await onChange();
              }}
            >
              Delete
            </button>
          </div>
          {editing && (
            <ItemEditor
              auction={a}
              item={i}
              onDone={() => {
                setEditing(false);
                void onChange();
              }}
            />
          )}
        </div>
      )}
    </article>
  );
}

function priceLine(i: AuctionItem, sealed: boolean): string {
  const count = `${i.bids} ${i.bids === 1 ? 'bid' : 'bids'}`;
  if (i.state === 'closed') return i.high != null ? `Sold for ${dollars(i.high)}` : 'No bids';
  if (sealed) return i.bids > 0 ? `Bids start at ${dollars(i.starting_bid)} · ${count} so far` : `Bids start at ${dollars(i.starting_bid)}`;
  if (i.high == null) return `Bidding starts at ${dollars(i.starting_bid)}`;
  return `Highest bid ${dollars(i.high)} · ${count} · next at least ${dollars(i.min_bid ?? i.high + i.increment)}`;
}

/** Who owes what, for whoever is collecting it. */
function Winners({ items, onChange }: { items: AuctionItem[]; onChange: () => Promise<void> }) {
  const owed = items.filter((i) => !i.paid_at).reduce((n, i) => n + (i.leader_bid ?? 0), 0);
  return (
    <section className={`${CARD} mt-6`} aria-label="Winners">
      <h2 className="text-sm font-semibold text-slate-200">Winners</h2>
      <p className="text-xs text-slate-400 mt-1">
        {owed > 0 ? `${dollars(owed)} still to collect.` : 'Everything sold has been paid for.'}
      </p>
      <div className="overflow-x-auto mt-2">
        <table className="w-full text-sm text-slate-300">
          <thead>
            <tr className="text-left text-xs text-slate-500">
              <th className="py-1 pr-3 font-semibold">Item</th>
              <th className="py-1 pr-3 font-semibold">Winner</th>
              <th className="py-1 pr-3 font-semibold text-right">Amount</th>
              <th className="py-1 font-semibold">Paid</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id} className="border-t border-white/10">
                <td className="py-1.5 pr-3">{i.title}</td>
                <td className="py-1.5 pr-3">
                  {i.leader?.name}
                  <span className="block text-xs text-slate-500">{i.leader?.email}</span>
                </td>
                <td className="py-1.5 pr-3 text-right tabular-nums">{dollars(i.leader_bid ?? 0)}</td>
                <td className="py-1.5">
                  <input
                    type="checkbox"
                    aria-label={`${i.title} is paid for`}
                    checked={!!i.paid_at}
                    onChange={async (e) => {
                      const res = await setPaid(i.id, e.target.checked);
                      if (!res.ok) window.alert(res.reason ?? 'That did not work');
                      await onChange();
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function AuctionEditor({ auction, onDone }: { auction: Auction | null; onDone: (id?: string) => void }) {
  const [f, setF] = useState<AuctionForm>(() => ({
    id: auction?.id ?? null,
    title: auction?.title ?? '',
    blurb: auction?.blurb ?? '',
    paymentNote: auction?.payment_note ?? '',
    bidding: auction?.bidding ?? 'open',
    extendMinutes: auction?.extend_minutes ?? 2,
    opensAt: toOfficeInput(auction?.opens_at),
    closesAt: toOfficeInput(auction?.closes_at),
  }));
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const zone = officeZoneWord();
  const set = <K extends keyof AuctionForm>(k: K, v: AuctionForm[K]) => setF((x) => ({ ...x, [k]: v }));

  return (
    <form
      className={`${CARD} space-y-3`}
      aria-label={auction ? 'Change the auction' : 'New auction'}
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const res = await saveAuction(f);
        setBusy(false);
        if (!res.ok) setProblem(res.reason ?? 'That did not save');
        else onDone(auction ? undefined : res.id);
      }}
    >
      <label className="block">
        <span className={LABEL}>Name</span>
        <input className={FIELD} value={f.title} maxLength={80} onChange={(e) => set('title', e.target.value)} />
      </label>
      <label className="block">
        <span className={LABEL}>What it is for</span>
        <textarea className={FIELD} rows={3} value={f.blurb} maxLength={2000} onChange={(e) => set('blurb', e.target.value)} />
      </label>
      <label className="block">
        <span className={LABEL}>How winners pay</span>
        <textarea
          className={FIELD}
          rows={2}
          value={f.paymentNote}
          maxLength={500}
          placeholder="Who to pay, how, and by when"
          onChange={(e) => set('paymentNote', e.target.value)}
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className={LABEL}>Bidding opens ({zone})</span>
          <input className={FIELD} type="datetime-local" value={f.opensAt} onChange={(e) => set('opensAt', e.target.value)} />
        </label>
        <label className="block">
          <span className={LABEL}>Bidding closes ({zone})</span>
          <input className={FIELD} type="datetime-local" value={f.closesAt} onChange={(e) => set('closesAt', e.target.value)} />
        </label>
      </div>
      <fieldset>
        <legend className={LABEL}>Bidding</legend>
        <div className="flex flex-wrap gap-4 text-sm text-slate-200">
          <label className="inline-flex items-center gap-2">
            <input type="radio" name="bidding" checked={f.bidding === 'open'} onChange={() => set('bidding', 'open')} />
            Open: everybody sees the highest bid
          </label>
          <label className="inline-flex items-center gap-2">
            <input type="radio" name="bidding" checked={f.bidding === 'sealed'} onChange={() => set('bidding', 'sealed')} />
            Sealed: nobody sees a bid until it closes
          </label>
        </div>
      </fieldset>
      {f.bidding === 'open' ? (
        <fieldset>
          <legend className={LABEL}>At the close</legend>
          <div className="flex flex-wrap items-center gap-4 text-sm text-slate-200">
            <label className="inline-flex items-center gap-2">
              <input
                type="radio"
                name="ending"
                checked={f.extendMinutes === 0}
                onChange={() => set('extendMinutes', 0)}
              />
              Close on the dot
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="radio"
                name="ending"
                checked={f.extendMinutes > 0}
                onChange={() => set('extendMinutes', f.extendMinutes > 0 ? f.extendMinutes : 2)}
              />
              A late bid moves the close back by
            </label>
            {f.extendMinutes > 0 && (
              <label className="inline-flex items-center gap-2">
                <input
                  className={`${FIELD} w-20`}
                  type="number"
                  min={1}
                  max={30}
                  value={f.extendMinutes}
                  aria-label="Minutes a late bid adds"
                  onChange={(e) => set('extendMinutes', Math.max(1, Math.min(30, Number(e.target.value) || 1)))}
                />
                minutes
              </label>
            )}
          </div>
        </fieldset>
      ) : (
        <p className="text-xs text-slate-400">Sealed bids close on time: there is nothing to see, so nothing to snipe.</p>
      )}
      {problem && <p className="text-sm text-rose-300">{problem}</p>}
      <div className="flex gap-2">
        <button type="submit" className={PRIMARY} disabled={busy}>
          {auction ? 'Save' : 'Create the auction'}
        </button>
        <button type="button" className={BUTTON} onClick={() => onDone()}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function ItemEditor({
  auction,
  item,
  onDone,
}: {
  auction: Auction;
  item: AuctionItem | null;
  onDone: () => void;
}) {
  const [f, setF] = useState<ItemForm>(() => ({
    id: item?.id ?? null,
    title: item?.title ?? '',
    blurb: item?.blurb ?? '',
    donatedBy: item?.donated_by ?? '',
    imagePath: item?.image_path ?? null,
    startingBid: item?.starting_bid ?? 1,
    increment: item?.increment ?? 1,
    closesAt: item?.own_close ? toOfficeInput(item.closes_at) : '',
  }));
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const zone = officeZoneWord();
  const set = <K extends keyof ItemForm>(k: K, v: ItemForm[K]) => setF((x) => ({ ...x, [k]: v }));

  return (
    <form
      className={`${CARD} space-y-3`}
      aria-label={item ? `Change ${item.title}` : 'New item'}
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const res = await saveItem(auction.id, f);
        setBusy(false);
        if (!res.ok) setProblem(res.reason ?? 'That did not save');
        else onDone();
      }}
    >
      <label className="block">
        <span className={LABEL}>Item</span>
        <input className={FIELD} value={f.title} maxLength={80} onChange={(e) => set('title', e.target.value)} />
      </label>
      <label className="block">
        <span className={LABEL}>About it</span>
        <textarea className={FIELD} rows={3} value={f.blurb} maxLength={1000} onChange={(e) => set('blurb', e.target.value)} />
      </label>
      <label className="block">
        <span className={LABEL}>Donated by (optional)</span>
        <input className={FIELD} value={f.donatedBy} maxLength={120} onChange={(e) => set('donatedBy', e.target.value)} />
      </label>
      <div className="block">
        <span className={LABEL}>Picture</span>
        <div className="flex flex-wrap items-center gap-3">
          {f.imagePath && (
            <div className="w-32">
              <Picture path={f.imagePath} alt="" />
            </div>
          )}
          <input
            type="file"
            accept={PICTURE_ACCEPT}
            aria-label="Picture"
            className="text-sm text-slate-300"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setBusy(true);
              const res = await uploadItemPicture(file);
              setBusy(false);
              if (res.ok) set('imagePath', res.path);
              else setProblem(res.reason ?? 'That picture did not upload');
            }}
          />
          {f.imagePath && (
            <button type="button" className={BUTTON} onClick={() => set('imagePath', null)}>
              No picture
            </button>
          )}
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block">
          <span className={LABEL}>Bids start at ($)</span>
          <input
            className={FIELD}
            type="number"
            min={1}
            step={1}
            value={f.startingBid}
            onChange={(e) => set('startingBid', Math.max(1, Math.floor(Number(e.target.value) || 1)))}
          />
        </label>
        {auction.bidding === 'open' && (
          <label className="block">
            <span className={LABEL}>Each bid goes up by ($)</span>
            <input
              className={FIELD}
              type="number"
              min={1}
              step={1}
              value={f.increment}
              onChange={(e) => set('increment', Math.max(1, Math.floor(Number(e.target.value) || 1)))}
            />
          </label>
        )}
        <label className="block">
          <span className={LABEL}>Closes at ({zone})</span>
          <input className={FIELD} type="datetime-local" value={f.closesAt} onChange={(e) => set('closesAt', e.target.value)} />
          <span className="block text-xs text-slate-500 mt-1">Empty closes it with the auction.</span>
        </label>
      </div>
      {problem && <p className="text-sm text-rose-300">{problem}</p>}
      <div className="flex gap-2">
        <button type="submit" className={PRIMARY} disabled={busy}>
          {item ? 'Save' : 'Add it'}
        </button>
        <button type="button" className={BUTTON} onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  );
}
