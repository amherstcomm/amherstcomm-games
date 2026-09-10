// Publish the tournament rounds whose first day falls in a range.
//
// The nightly window does this itself over its fortnight, so this is for by
// hand: a round set up after tonight's run that should be ready before it, or
// checking what a range would publish. The same function, so the two cannot
// publish a round differently.
//
//   node scripts/publish-rounds.mjs --from 2026-10-01 --until 2026-10-14
//
// A round already under way is never regenerated -- its board has been played.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { easternToday, plusDays, publishRounds } from './publishDate.mjs';

const args = {};
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i]?.replace(/^--/, '');
  if (key) args[key] = process.argv[i + 1];
}

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.PUZZLES_SEED_SALT) {
  console.error(
    'Nothing to publish with: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and\n' +
      'PUZZLES_SEED_SALT must all be set.'
  );
  process.exitCode = 1;
} else {
  const from = args.from ?? easternToday();
  const until = args.until ?? plusDays(from, 13);
  const dir = mkdtempSync(join(tmpdir(), 'anagrimoire-rounds-'));
  try {
    const said = await publishRounds(from, until, dir);
    for (const line of said) console.log(line);
    if (said.length === 0) console.log(`No rounds to publish between ${from} and ${until}.`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
