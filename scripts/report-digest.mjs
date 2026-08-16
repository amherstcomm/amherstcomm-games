// The daily report round: nag about what's open, tell reporters what happened.
//
// A scheduled digest rather than an admin UI, because the useful thing about a
// report is knowing it happened — and an inbox is a queue somebody already
// reads every day. When the volume outgrows that, the roadmap's admin portal
// is the answer; a bigger email is not.
//
// Nothing here marks a report handled. That was the first design and it was
// wrong: it made the email a notification, so a report skimmed and forgotten
// was closed anyway. Reports close when somebody clicks one of the links and
// says what they did, and until then they come back every morning with the day
// they were filed and how long they have been sitting — a report nobody has
// touched in a week should read louder than one filed this morning, and the
// only way to say so is to keep saying it.
//
// Auth is the service-role key, held only as a CI secret: open_reports is
// revoked from every web role, because it is the one path that hands back a
// player's name alongside free text somebody wrote about them.

import { FEED_NAME, MODES, NAME_FULL } from './games.mjs';

// keyed by feed name, which is what a puzzle report stores
const GAME_NAME = Object.fromEntries(
  MODES.map((m) => [FEED_NAME[m], NAME_FULL[m]])
);

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://kopsojnfqlzgyisexmrd.supabase.co';
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RESEND_KEY = process.env.RESEND_API_KEY;
const TO = process.env.REPORT_DIGEST_TO;
const FROM = process.env.REPORT_DIGEST_FROM || 'reports@anagrimoire.com';
const SITE = process.env.REPORT_SITE || 'https://anagrimoire.com';

if (!KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');

const headers = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  'Content-Type': 'application/json',
};

const rpc = async (fn, body = {}) => {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${fn} failed: ${res.status} ${await res.text()}`);
  return res.json();
};

const send = async (to, subject, text) => {
  if (!RESEND_KEY) return false;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    // Plain text, and never HTML. The reason field is the one thing here a
    // stranger wrote, and a client that renders it is a client that can be
    // given markup to render.
    body: JSON.stringify({ from: FROM, to, subject, text }),
  });
  if (!res.ok) throw new Error(`Resend failed: ${res.status} ${await res.text()}`);
  return true;
};

// The answers in a published board are base64'd JSON — that is the feed's own
// obfuscation, so a curious player can't read tomorrow out of the file. It is
// not obfuscation from *us*, and a digest that mailed the owner
// "WyJ0aW1lIiwiZHJlYW0i..." would be a digest that hid the one thing it exists
// to show: the word somebody objected to.
//
// Decoded by shape rather than by field name, because each generator names its
// own: bridge has `answers`, others have `words` or `solution`. Anything that
// isn't base64'd JSON is left exactly as it was.
const readable = (value) => {
  if (Array.isArray(value)) return value.map(readable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, readable(v)]));
  }
  if (typeof value !== 'string' || value.length < 8 || !/^[A-Za-z0-9+/=]+$/.test(value)) {
    return value;
  }
  try {
    const decoded = Buffer.from(value, 'base64').toString('utf8');
    const parsed = JSON.parse(decoded);
    // only worth swapping in if it decoded to something structured; a bare
    // number that happens to survive the round trip is not a hidden answer
    return typeof parsed === 'object' && parsed !== null ? parsed : value;
  } catch {
    return value;
  }
};

const patch = async (id, fields, what) => {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/reports?id=eq.${id}`, {
    method: 'PATCH',
    headers: { ...headers, Prefer: 'return=minimal' },
    body: JSON.stringify(fields),
  });
  if (!res.ok) throw new Error(`${what} failed: ${res.status} ${await res.text()}`);
};

const stamp = (id, column) => patch(id, { [column]: new Date().toISOString() }, `stamping ${column}`);

/** The last thing done with an address is to stop holding it.
 *
 *  The dialog says "used only to send you the outcome, and deleted with the
 *  report", the About page says the same, and the outcome email itself says
 *  the address goes with it. None of that was true until this: the column was
 *  simply left populated for ever. A promise about data has to be kept by the
 *  code that holds it, not by the sentence next to the field. */
const forgetAddress = (id) =>
  patch(
    id,
    { outcome_sent_at: new Date().toISOString(), reporter_email: null },
    'closing out the address'
  );

// ---- 1. the owner's digest -------------------------------------------------

const open = await rpc('open_reports');

if (open.length) {
  const rule = '─'.repeat(64);
  const KIND = {
    puzzle: 'PUZZLE',
    player: 'PLAYER',
    site: 'SITE',
    privacy: 'PRIVACY',
    security: 'SECURITY',
    other: 'OTHER',
  };

  // Wrapped at 72 so the reason reads as prose in a mail client that will not
  // reflow plain text. Long unbroken strings — a URL somebody pasted — are
  // left alone rather than cut, since a broken URL is worse than a wide line.
  const wrap = (text, indent = '  ') =>
    String(text)
      .split('\n')
      .flatMap((para) => {
        const out = [];
        let line = '';
        for (const word of para.split(/\s+/)) {
          if (line && line.length + word.length + 1 > 72) {
            out.push(indent + line);
            line = word;
          } else {
            line = line ? `${line} ${word}` : word;
          }
        }
        out.push(indent + line);
        return out;
      })
      .join('\n');

  const lines = [];
  for (const r of open) {
    const e = r.evidence ?? {};
    // The age leads the header line, because that is the part anybody skimming
    // actually reads, and a report nobody has touched in a week should look
    // different from one filed this morning.
    const age =
      r.days_open === 0 ? 'today' : `${r.days_open} day${r.days_open === 1 ? '' : 's'} open`;
    lines.push(rule);
    lines.push(`${KIND[r.kind] ?? r.kind.toUpperCase()}   ${r.ticket}   ${age}`);
    lines.push(rule);

    // Four kinds became six, and this had two branches once — which is how a
    // site report came to print "name: undefined".
    if (r.kind === 'puzzle') {
      // The feed name, made readable. A report about Guess arrived saying
      // "words", which is what daily_puzzles calls it and not what anyone else
      // does — the reader of this email is a person deciding whether a board is
      // offensive, not someone who knows the feed's naming.
      lines.push(`  Board    ${GAME_NAME[e.game] ?? e.game} · ${e.difficulty} · ${e.date} (${e.env})`);
      lines.push('');
      // As the server held it, which is the point of the whole design: not
      // what the reporter claimed, what was actually served.
      lines.push(wrap(JSON.stringify(readable(e.board)), '  '));
    } else if (r.kind === 'player') {
      lines.push(`  Name     ${e.name}`);
      // 'no' is the interesting answer — the preventive filter looked at this
      // name and let it through, so there is a gap to close.
      lines.push(`  Filter   ${e.blocked_by_filter ? 'would have caught it' : 'let it through'}`);
    } else {
      lines.push(`  Page     ${e.reported_from || '(not said)'}`);
      lines.push('  Nothing to look up — the words below are the whole report.');
    }

    lines.push('');
    lines.push('  What they said:');
    lines.push(wrap(r.reason || '(nothing given)', '    '));
    lines.push('');
    if (r.reporter_email) lines.push('  They asked to be told the outcome.');

    const base = `${SITE}/report/act/${r.id}/${r.action_token}`;
    lines.push('  Handle it:');
    lines.push(`    dismiss      ${base}/dismiss`);
    // Only where there is a word to block. A site report has no board and no
    // name, so offering to blocklist something off it is offering a wrong door.
    if (r.kind === 'puzzle') lines.push(`    block a word ${base}/blocklist`);
    if (r.kind === 'player') lines.push(`    remove name  ${base}/ban`);
    lines.push('');
  }

  const stale = open.filter((r) => r.days_open >= 1).length;
  const subject =
    stale > 0
      ? `Anagrimoire: ${open.length} open, ${stale} still waiting`
      : `Anagrimoire: ${open.length} new report${open.length === 1 ? '' : 's'}`;

  const body = [
    `${open.length} open report${open.length === 1 ? '' : 's'}` +
      (stale ? `, ${stale} carried over from a previous day.` : '.'),
    '',
    'Nothing closes on its own. Each one stays in this list until somebody',
    'follows one of its links and says what they did — so anything below that',
    'is more than a day old has been skipped at least once.',
    '',
    `All of them: ${SITE}/reports`,
    '',
    ...lines,
    rule,
  ].join('\n');

  console.log(body);

  if (RESEND_KEY && TO) {
    await send(TO, subject, body);
    console.log(`Emailed the digest: ${open.length} open, ${stale} carried over.`);
  } else {
    console.log('::warning::RESEND_API_KEY or REPORT_DIGEST_TO not set; digest printed, not emailed');
  }
} else {
  console.log('No open reports.');
}

// ---- 2. receipts, for reporters who left an address ------------------------
// Sent from here rather than at report time because there is no server to send
// from at report time — the site is a static bundle and Supabase. A ticket is
// handed over on screen immediately, so this is a second copy for the inbox
// rather than the only record.

for (const r of open.filter((x) => x.reporter_email && !x.receipt_sent_at)) {
  // Written to be read by somebody with no account and no context beyond
  // having clicked a link on a word-game site — so it names the site, says
  // what happens next, and puts the one thing worth keeping on its own line.
  const text = [
    'Thanks for reporting that.',
    '',
    'Your reference is:',
    '',
    `  ${r.ticket}`,
    `  ${SITE}/report/${r.ticket}`,
    '',
    "That link says whether it's still open and, once it's been looked at,",
    "what was decided. Nothing else is needed from you — we'll write again",
    "when it's dealt with.",
    '',
    '—',
    `Anagrimoire · ${SITE}`,
    'You are getting this because you left an address when you filed a',
    'report. It is used for this and nothing else, and it is deleted with',
    'the report.',
    '',
  ].join('\n');
  if (await send(r.reporter_email, `Anagrimoire report ${r.ticket}`, text)) {
    await stamp(r.id, 'receipt_sent_at');
    console.log(`Receipt sent for ${r.ticket}.`);
  }
}

// ---- 3. outcomes, for reports that have been dealt with --------------------

const OUTCOME = {
  dismissed: 'We looked and decided nothing needed changing.',
  blocked: "The word has been blocked — it won't be published again.",
  banned: 'The name has been removed and blocked.',
};

const closed = await rpc('unsent_outcomes');
for (const r of closed) {
  const text = [
    `Your report ${r.ticket} has been dealt with.`,
    '',
    `  ${OUTCOME[r.resolution] ?? 'It has been dealt with.'}`,
    // The note goes under the standard sentence rather than replacing it: one
    // answers "what happened to my report", the other says why, and a reader
    // wants the first even when the second is missing.
    ...(r.resolution_note ? ['', `  ${r.resolution_note}`] : []),
    '',
    `  ${SITE}/report/${r.ticket}`,
    '',
    'Thank you for taking the time — a report is the only way some of this',
    'gets found at all.',
    '',
    '—',
    `Anagrimoire · ${SITE}`,
    'This is the last email about this report. Your address goes with it.',
    '',
  ].join('\n');
  if (await send(r.reporter_email, `Anagrimoire report ${r.ticket} — closed`, text)) {
    await forgetAddress(r.id);
    console.log(`Outcome sent for ${r.ticket}, and the address dropped.`);
  }
}

if (!RESEND_KEY && (open.some((r) => r.reporter_email) || closed.length)) {
  console.log('::warning::reporters are waiting on mail that cannot be sent without RESEND_API_KEY');
}
