// Publish the days somebody asked for from the admin portal.
//
// Run by ops/drain-publish-requests.sh, which the minute timer starts. Claims
// the oldest waiting request, publishes that day through the same routine the
// nightly window and ops/publish-day.sh use, reads it back, and writes the
// answer where the page will see it. A handful per run, so one busy minute
// cannot turn into an hour-long run that holds the next minute's look back.
//
// Nothing waiting is the ordinary case and costs one RPC.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkPublished, easternToday, publishDate } from './publishDate.mjs';

const SUPABASE_URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

/** How many requests one run will take. A publish is a generator run --
 *  seconds to a minute -- so five is a run that still finishes before anybody
 *  wonders, and whatever is left is the next minute's. */
const PER_RUN = 5;

const rpc = async (fn, body = {}) => {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${fn}: ${res.status} ${await res.text()}`);
  // A function returning void answers with no body at all.
  const text = await res.text();
  return text ? JSON.parse(text) : null;
};

if (!SUPABASE_URL || !KEY || !process.env.PUZZLES_SEED_SALT) {
  // The salt as well: a day published without it is a different day published
  // over the real one, and the page would call it done.
  console.error(
    'Nothing to publish with: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and\n' +
      'PUZZLES_SEED_SALT must all be set. Run this through ops/drain-publish-requests.sh.'
  );
  process.exitCode = 1;
} else {
  for (let taken = 0; taken < PER_RUN; taken += 1) {
    const job = await rpc('claim_publish_request');
    if (!job) break;
    const { id, on_date: date, force } = job;

    let ok = false;
    let note;
    // Checked again here, not only when it was filed: a request for tomorrow
    // made at 11:59 p.m. is a request for today by the time a minute has
    // passed, and the rule is about the board being live, not about when
    // somebody pressed the button.
    if (date <= easternToday() && !force) {
      note = 'the day started before it could be published, so it was left as it was';
    } else {
      const dir = mkdtempSync(join(tmpdir(), 'anagrimoire-request-'));
      try {
        for (const line of publishDate(date, dir)) console.log(line);
        const check = await checkPublished(date, process.env);
        ok = check.ok;
        note = check.message;
      } catch (error) {
        // The first line of whatever the generator said, which is the part a
        // person can act on; the whole trace is in the journal.
        note = `the generator failed: ${String(error?.message ?? error).split('\n')[0].slice(0, 300)}`;
        console.error(error);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    }

    await rpc('finish_publish_request', { p_id: id, p_ok: ok, p_note: note });
    console.log(`${date}: ${ok ? '' : 'FAILED — '}${note}`);
  }
}
