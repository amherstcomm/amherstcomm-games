// Send the emails that are waiting: run by the minute timer on the VM
// (ops/amherstcomm-games-mail.*), safe to run by hand. Named for the first
// thing that sent mail; it works every queue now -- auctions (outbid, won),
// recognition (a nomination posted, an award won) and suggestion boxes (one
// left in a reader's box, a reader's answer to a named sender).
//
// The database queues them and decides who is told what; this claims a batch
// from each queue, sends each one, and reports back. A failure goes back in
// the queue for the next run, five tries in all.
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
import { composeRecognition } from './recognition-mail.mjs';
import { composeSuggestion } from './suggestion-mail.mjs';

const env = process.env;
const TRANSPORT = (env.MAIL_TRANSPORT ?? '').trim().toLowerCase();

if (!TRANSPORT) {
  console.log('MAIL_TRANSPORT is not set, so emails stay queued');
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

// Each queue: how to claim from it, how to say how it went, and the words.
const QUEUES = [
  { name: 'auction', claim: 'auction_mail_claim', done: 'auction_mail_done', words: (m) => compose(m, { site: SITE, zone: ZONE }) },
  { name: 'recognition', claim: 'recognition_mail_claim', done: 'recognition_mail_done', words: (m) => composeRecognition(m, { site: SITE }) },
  { name: 'suggestion', claim: 'suggestion_mail_claim', done: 'suggestion_mail_done', words: (m) => composeSuggestion(m, { site: SITE }) },
];

let sent = 0;
let failed = 0;
for (const q of QUEUES) {
  // A batch at a time until the queue is empty: a closing auction can produce
  // a few dozen at once, and a minute is long to wait for the second twenty.
  for (;;) {
    let batch;
    try {
      const got = await rpc(q.claim, { p_limit: 20 });
      batch = Array.isArray(got?.mail) ? got.mail : [];
    } catch (e) {
      // One queue the database does not have yet -- a pull ahead of the
      // schema -- is no reason to leave the others unsent.
      console.error(`::warning::could not read the ${q.name} queue: ${String(e?.message ?? e).slice(0, 300)}`);
      break;
    }
    if (batch.length === 0) break;
    for (const m of batch) {
      try {
        await send(q.words(m));
        await rpc(q.done, { p_id: m.id, p_error: null });
        sent++;
      } catch (e) {
        const why = String(e?.message ?? e).slice(0, 500);
        console.error(`::warning::${q.name} email ${m.id} (${m.kind}) to ${m.to} did not go: ${why}`);
        await rpc(q.done, { p_id: m.id, p_error: why });
        failed++;
      }
    }
    // Everything so far failing is the mail server, not the messages; the
    // rest can wait for the next minute rather than all be tried now. (A
    // failed one is not handed back for ten minutes, so this does not retry.)
    if (failed > 0 && sent === 0) break;
  }
  if (failed > 0 && sent === 0) break;
}

send.close?.();
if (sent || failed) console.log(`emails: ${sent} sent, ${failed} failed`);
// Set rather than exited with: process.exit while the SMTP connection is still
// closing aborts Node on Windows, and is abrupt everywhere else.
process.exitCode = failed > 0 && sent === 0 ? 1 : 0;
