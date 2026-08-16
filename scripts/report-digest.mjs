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

const stamp = async (id, column) => {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/reports?id=eq.${id}`, {
    method: 'PATCH',
    headers: { ...headers, Prefer: 'return=minimal' },
    body: JSON.stringify({ [column]: new Date().toISOString() }),
  });
  if (!res.ok) throw new Error(`stamping ${column} failed: ${res.status} ${await res.text()}`);
};

// ---- 1. the owner's digest -------------------------------------------------

const open = await rpc('open_reports');

if (open.length) {
  const lines = [];
  for (const r of open) {
    const e = r.evidence ?? {};
    // The nag. A report on its first morning says nothing extra; one that has
    // been sitting says so in the first three characters of its line, because
    // that is the part anybody skimming actually reads.
    const age =
      r.days_open === 0
        ? ''
        : `[open ${r.days_open} day${r.days_open === 1 ? '' : 's'}] `;
    lines.push(`${age}${r.kind} · ticket ${r.ticket} · filed ${r.created_at.slice(0, 10)}`);
    // Four kinds, and this had two branches — so a site report printed
    // "name: undefined" under a heading about the name filter. An if/else over
    // an open set is the same mistake as an array where a Record belongs.
    if (r.kind === 'puzzle') {
      lines.push(`  ${e.game} · ${e.difficulty} · ${e.date} (${e.env})`);
      // The board as the server held it, which is the whole point of the
      // design: not what the reporter claimed, what was served.
      lines.push(`  board: ${JSON.stringify(readable(e.board)).slice(0, 1500)}`);
    } else if (r.kind === 'player') {
      lines.push(`  name: ${e.name}`);
      // 'false' is the interesting case — the preventive filter looked at this
      // name and let it through, so there is a gap to close.
      lines.push(`  caught by the name filter: ${e.blocked_by_filter}`);
    } else {
      // Nothing to look up, which is why the words below are the report.
      lines.push(`  reported from: ${e.reported_from || '(not said)'} — as the browser said, unverified`);
    }
    lines.push(`  reason: ${r.reason ? r.reason : '(none given)'}`);
    if (r.reporter_email) lines.push(`  reporter asked to be told the outcome`);
    // One link per action. All three land on the same page, which shows the
    // report before it offers to act on it — and refuses either way unless an
    // owner account is signed in on the browser that opened it.
    const base = `${SITE}/report/act/${r.id}/${r.action_token}`;
    lines.push(`  dismiss:    ${base}/dismiss`);
    // Only where there is a word to block. A site report has no board and no
    // name, so offering to blocklist something off it is offering a wrong door.
    if (r.kind === 'puzzle') lines.push(`  block word: ${base}/blocklist`);
    if (r.kind === 'player') lines.push(`  remove name: ${base}/ban`);
    lines.push('');
  }

  const stale = open.filter((r) => r.days_open >= 1).length;
  const subject =
    stale > 0
      ? `Anagrimoire: ${open.length} open, ${stale} still waiting`
      : `Anagrimoire: ${open.length} new report${open.length === 1 ? '' : 's'}`;

  const body =
    `${open.length} open report${open.length === 1 ? '' : 's'}` +
    (stale ? `, ${stale} of them carried over from a previous day.` : '.') +
    '\n\nNothing closes on its own — each stays here until somebody follows one\n' +
    'of its links and says what they did.\n\n' +
    lines.join('\n');

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
  const text =
    `Thanks for the report.\n\n` +
    `Your reference is ${r.ticket}.\n` +
    `${SITE}/report/${r.ticket}\n\n` +
    `Nothing else is needed from you. We'll email again when it's been dealt with.\n`;
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
  const text =
    `Your report ${r.ticket} has been dealt with.\n\n` +
    `${OUTCOME[r.resolution] ?? 'It has been dealt with.'}\n` +
    (r.resolution_note ? `\n${r.resolution_note}\n` : '') +
    `\n${SITE}/report/${r.ticket}\n\nThank you for taking the time.\n`;
  if (await send(r.reporter_email, `Anagrimoire report ${r.ticket} — closed`, text)) {
    await stamp(r.id, 'outcome_sent_at');
    console.log(`Outcome sent for ${r.ticket}.`);
  }
}

if (!RESEND_KEY && (open.some((r) => r.reporter_email) || closed.length)) {
  console.log('::warning::reporters are waiting on mail that cannot be sent without RESEND_API_KEY');
}
