// Send the auction emails that are waiting: run by the minute timer on the VM
// (ops/amherstcomm-games-mail.*), safe to run by hand.
//
// The database queues them (auction_mail) and decides who is told what; this
// claims a batch, sends each one, and reports back. A failure goes back in the
// queue for the next run, five tries in all.
//
// Two ways out, by MAIL_TRANSPORT:
//
//   smtp     Office 365, or any SMTP server. SMTP_HOST, SMTP_PORT (587),
//            and SMTP_USER and SMTP_PASS for a mailbox that sends; leave the
//            last two empty for a relay that knows this server by its address.
//   resend   Resend's API, with RESEND_API_KEY.
//
// Unset, it sends nothing and leaves the emails queued, so switching it on
// later sends what is still worth sending -- the database drops an outbid note
// that has stopped being true.
import { compose, DEFAULT_ZONE } from './auction-mail.mjs';

const env = process.env;
const TRANSPORT = (env.MAIL_TRANSPORT ?? '').trim().toLowerCase();

if (!TRANSPORT) {
  console.log('MAIL_TRANSPORT is not set, so auction emails stay queued');
  process.exit(0);
}

// No defaults for any of these: a guessed URL or address sends from somewhere
// this company does not own, or links to a site nobody can reach.
const need = (name) => {
  const v = (env[name] ?? '').trim();
  if (!v) throw new Error(`${name} is not set — see ops/publish.env.example`);
  return v;
};
const SUPABASE_URL = need('SUPABASE_URL');
const KEY = need('SUPABASE_SERVICE_ROLE_KEY');
const FROM = need('MAIL_FROM');
const SITE = need('MAIL_SITE_URL');
const ZONE = (env.MAIL_TIME_ZONE ?? '').trim() || DEFAULT_ZONE;

const rpc = async (fn, body = {}) => {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${fn} failed: ${res.status} ${await res.text()}`);
  return res.json();
};

async function smtpSender() {
  const { default: nodemailer } = await import('nodemailer');
  const port = Number(env.SMTP_PORT || 587);
  const user = (env.SMTP_USER ?? '').trim();
  const transport = nodemailer.createTransport({
    host: need('SMTP_HOST'),
    port,
    // 465 is TLS from the first byte; 587 (Office 365) starts plain and must
    // upgrade, and is refused rather than sent in the clear if it cannot.
    secure: port === 465,
    requireTLS: port !== 465 && port !== 25,
    auth: user ? { user, pass: need('SMTP_PASS') } : undefined,
  });
  const send = async (msg) => {
    await transport.sendMail({ from: FROM, to: msg.to, subject: msg.subject, text: msg.text });
  };
  send.close = () => transport.close();
  return send;
}

function resendSender() {
  const key = need('RESEND_API_KEY');
  return async (msg) => {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, to: msg.to, subject: msg.subject, text: msg.text }),
    });
    if (!res.ok) throw new Error(`Resend said ${res.status}: ${await res.text()}`);
  };
}

const send =
  TRANSPORT === 'smtp' ? await smtpSender()
  : TRANSPORT === 'resend' ? resendSender()
  : (() => {
      throw new Error(`MAIL_TRANSPORT is "${TRANSPORT}"; it is smtp or resend`);
    })();

let sent = 0;
let failed = 0;
// A batch at a time until the queue is empty: a closing auction can produce a
// few dozen at once, and a minute is long to wait for the second twenty.
for (;;) {
  const got = await rpc('auction_mail_claim', { p_limit: 20 });
  const batch = Array.isArray(got?.mail) ? got.mail : [];
  if (batch.length === 0) break;
  for (const m of batch) {
    try {
      await send(compose(m, { site: SITE, zone: ZONE }));
      await rpc('auction_mail_done', { p_id: m.id, p_error: null });
      sent++;
    } catch (e) {
      const why = String(e?.message ?? e).slice(0, 500);
      console.error(`::warning::auction email ${m.id} (${m.kind}) to ${m.to} did not go: ${why}`);
      await rpc('auction_mail_done', { p_id: m.id, p_error: why });
      failed++;
    }
  }
  // Everything so far failing is the mail server, not the messages; the rest
  // can wait for the next minute rather than all be tried now. (A failed one
  // is not handed back for ten minutes, so this loop does not retry it.)
  if (failed > 0 && sent === 0) break;
}

send.close?.();
if (sent || failed) console.log(`auction emails: ${sent} sent, ${failed} failed`);
// Set rather than exited with: process.exit while the SMTP connection is still
// closing aborts Node on Windows, and is abrupt everywhere else.
process.exitCode = failed > 0 && sent === 0 ? 1 : 0;
