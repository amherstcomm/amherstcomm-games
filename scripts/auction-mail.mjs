// What an auction email says. Pure, so the words can be tested without a mail
// server; scripts/send-auction-mail.mjs does the sending.
//
// Plain text and never HTML: item titles and the payment note are typed by
// people, and a mail client that renders them is one that can be handed markup.

/** The company's clock, as the site uses it when nothing else is set. */
export const DEFAULT_ZONE = 'America/Chicago';

const dollars = (n) => `$${Number(n).toLocaleString('en-US')}`;

/** "Friday, November 13 at 3:00 PM CST" */
export function moment(at, zone = DEFAULT_ZONE) {
  const d = new Date(at);
  const day = new Intl.DateTimeFormat('en-US', { timeZone: zone, weekday: 'long', month: 'long', day: 'numeric' }).format(d);
  const time = new Intl.DateTimeFormat('en-US', { timeZone: zone, hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(d);
  return `${day} at ${time}`;
}

/** A header holds one line. A title with a newline in it would otherwise be a
 *  second header. */
const oneLine = (s) => String(s ?? '').replace(/[\r\n]+/g, ' ').trim();

/**
 * One claimed email, as auction_mail_claim hands it over, made into a message.
 * `site` is the address people reach the games at, with no trailing slash.
 */
export function compose(m, { site, zone = DEFAULT_ZONE }) {
  const link = `${site.replace(/\/+$/, '')}/auctions/${m.auction_id}`;
  const hello = m.name ? `Hi ${oneLine(m.name)},` : 'Hi,';
  const item = oneLine(m.item);
  const auction = oneLine(m.auction);

  if (m.kind === 'outbid') {
    return {
      to: m.to,
      subject: `You've been outbid on ${item}`,
      text: [
        hello,
        '',
        `Somebody has bid ${dollars(m.high)} on ${item} in ${auction}, which beats your bid.`,
        `To get back on top, bid at least ${dollars(m.min_bid)}. Bidding closes ${moment(m.closes_at, zone)}.`,
        '',
        link,
        '',
        `You're getting this because you bid on ${item}.`,
      ].join('\n'),
    };
  }

  if (m.kind === 'won') {
    const note = String(m.payment_note ?? '').trim();
    return {
      to: m.to,
      subject: `You won ${item}`,
      text: [
        hello,
        '',
        `Bidding on ${item} in ${auction} has closed, and your bid of ${dollars(m.high)} won it.`,
        '',
        ...(note ? ['How to pay:', note] : ['Whoever is running the auction will be in touch about paying.']),
        '',
        link,
      ].join('\n'),
    };
  }

  throw new Error(`no words for an auction email of kind ${m.kind}`);
}
