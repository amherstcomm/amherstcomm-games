// What a run of days would actually publish, before it publishes it.
//
// The gap this fills: a themed month is set up in the admin pages, and until
// this existed the only way to see whether the settings reached the puzzles was
// to wait for the run — which writes a fortnight ahead, so "did October work"
// was a question with a two-week answer.
//
// So it reads the *database*: the same five questions the nightly run asks —
// which lists cover the day, which Weave themes, which cryptogram passages,
// what each game accepts, and what somebody pinned — and prints what came back
// before printing the boards built from it. The point is not the boards. The
// point is the line above them saying "read from the database: October (38
// words)", which is the settings being used, not a theme somebody typed on the
// command line.
//
//   npm run preview-month -- --from 2026-10-01 --until 2026-10-07
//
// It needs SUPABASE_SERVICE_ROLE_KEY, because what covers a day is the day's
// answer key and nothing else may read it. Without one it refuses rather than
// quietly showing ordinary days, which reads as "the theme did not work".
//
// `--theme october.json` reads a list from a file instead — for trying a list
// *before* it is written into the admin pages. It proves nothing about what is
// in the settings, and says so.
//
// Nothing is published. Each day is generated into a throwaway directory and
// deleted, so this is safe against the live database in the middle of the
// afternoon.
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import {
  passagesFor,
  pinsFor,
  policyFor,
  themeFor,
  weaveThemesFor,
} from './themedDaily.mjs';

const run = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .join(' ')
    .split('--')
    .filter(Boolean)
    .map((pair) => {
      const [key, ...rest] = pair.trim().split(/\s+/);
      return [key, rest.join(' ') || 'true'];
    })
);

const from = args.from;
if (!from || !/^\d{4}-\d{2}-\d{2}$/.test(from)) {
  console.error('need --from YYYY-MM-DD (and --until, or --days N)');
  process.exit(1);
}
const days = args.until
  ? Math.round((Date.parse(args.until) - Date.parse(from)) / 86_400_000) + 1
  : Number(args.days ?? 7);
if (!Number.isFinite(days) || days < 1 || days > 62) {
  console.error('a preview is between one and sixty-two days');
  process.exit(1);
}

// Resolved against wherever the command was typed rather than against the
// repository, which is what a path on a command line means. An absolute one
// then works, which it did not: joining it to the root produced a path with two
// drive letters in it, and the test that runs this tool is what found that.
const themeFile = args.theme ? resolve(process.cwd(), args.theme) : null;
const theme = themeFile ? await readFile(themeFile, 'utf8') : null;

// The same default the other scripts carry, so the service key is the only
// thing anybody has to have.
const env = {
  ...process.env,
  SUPABASE_URL: process.env.SUPABASE_URL || 'https://kopsojnfqlzgyisexmrd.supabase.co',
};
const live = !theme && Boolean(env.SUPABASE_SERVICE_ROLE_KEY);

if (!theme && !live) {
  console.error(
    'Nothing to read. Set SUPABASE_SERVICE_ROLE_KEY to preview what the admin\n' +
      'pages have set up, or pass --theme <file> to try a list that is not saved\n' +
      'yet. Previewing ordinary days would look like a theme that did not work.'
  );
  process.exit(1);
}

console.log(
  `Previewing ${days} day${days === 1 ? '' : 's'} from ${from}, reading ` +
    (live ? `the database at ${env.SUPABASE_URL}` : `the list in ${args.theme} (not the settings)`) +
    '.\n'
);

const at = (i) => new Date(Date.parse(`${from}T12:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10);
const decode = (b64) => Buffer.from(b64, 'base64').toString();
const read = async (dir, file) => JSON.parse(await readFile(join(dir, file), 'utf8'));

/** The generator prints a line per themed thing it did. Kept, because "the pin
 *  could not be used" and "themed-only would leave nothing playable" are the
 *  two answers somebody previewing a month most needs. */
const NOTES = /^(Theming|Themed boxes|Hive|Scramble|Box|Ladder|Guess|Cryptogram|Words for|\d+ (themed|custom|pinned))/;

for (let i = 0; i < days; i++) {
  const date = at(i);
  const dir = await mkdtemp(join(tmpdir(), 'anagrimoire-preview-'));
  try {
    const { stdout } = await run('node', ['scripts/fetch-puzzles.mjs'], {
      cwd: root,
      env: {
        ...env,
        SKIP_SOLVER_DATA: '1',
        PUZZLES_DATE: date,
        PUZZLES_DATA_DIR: dir,
        ...env,
        ...(theme ? { PUZZLES_THEME: theme } : {}),
      },
      maxBuffer: 20 * 1024 * 1024,
    });

    const words = await read(dir, 'daily-words.json');
    const guess = words.byDifficulty.easy.words;
    const lengths = Object.keys(guess).map(Number).sort((a, b) => a - b);
    const scramble = await read(dir, 'daily-scramble.json');
    const hive = await read(dir, 'daily-hive.json');
    const box = await read(dir, 'daily-box.json');
    const ladder = await read(dir, 'daily-ladder.json');
    const weave = await read(dir, 'daily-weave.json');
    const cryptogram = await read(dir, 'daily-cryptogram.json');

    const themed = words.themed ? ' · themed' : '';
    const accept = words.accept ? ` · accepts ${words.accept}` : '';
    console.log(`${date}${themed}${accept}`);

    // What the settings said about this day, asked the way the generator asks
    // it. This is the half that matters: the boards below are only interesting
    // because this line says where they came from.
    if (live) {
      const [list, weaveThemes, passages, policy, pins] = await Promise.all([
        themeFor(date, env),
        weaveThemesFor(date, env),
        passagesFor(date, env),
        policyFor(date, env),
        pinsFor(date, env),
      ]);
      const said = [
        list ? `word list ${JSON.stringify(list.name)} (${list.words.length} words)` : null,
        weaveThemes.length ? `${weaveThemes.length} Weave theme${weaveThemes.length === 1 ? '' : 's'}` : null,
        passages.length ? `${passages.length} cryptogram passage${passages.length === 1 ? '' : 's'}` : null,
        Object.keys(policy).length
          ? `rules ${Object.entries(policy).map(([g, p]) => `${g}=${p}`).join(', ')}`
          : null,
        Object.keys(pins).length ? `pinned ${Object.keys(pins).join(', ')}` : null,
      ].filter(Boolean);
      console.log(
        `  settings   ${said.length ? said.join(' · ') : 'nothing covers this day — it is an ordinary one'}`
      );
    }
    console.log(
      `  guess      ${lengths.length === 1
        ? `${decode(guess[lengths[0]])} (the day's only board)`
        : `${lengths.length} boards, ${lengths[0]}–${lengths.at(-1)} letters` +
          `  e.g. ${lengths.map((n) => decode(guess[n])).slice(0, 4).join(', ')}…`}`
    );
    console.log(`  scramble   ${scramble.byDifficulty.easy.letters.join('')}`);
    const bee = hive.byDifficulty.easy;
    console.log(`  hive       ${bee.center}/${bee.outers.join('')} (${bee.words} words)`);
    const boxed = box.byDifficulty.easy;
    console.log(`  boxed      ${boxed.sides.join('/')} — solvable in ${boxed.par}`);
    const rungs = ladder.byDifficulty.easy;
    console.log(`  ladder     ${rungs.from} → ${rungs.to} in ${rungs.par}`);
    console.log(`  weave      ${weave.byDifficulty.easy.clue}`);
    const cipher = cryptogram.byDifficulty.easy;
    const plain = JSON.parse(decode(cipher.answer));
    console.log(`  cryptogram ${plain.text.slice(0, 56)}${plain.text.length > 56 ? '…' : ''}`);

    // What the generator said about the theme, in its own words: a pin it could
    // not use, a themed-only board with nothing on it, a hive that fell back.
    // The run generates two variants of the whole feed and says everything
    // twice, with different draws. The preview is of the first — the one this
    // deployment publishes — so the log is cut where the second begins.
    // Deduplicating instead would interleave two days' worth of answers.
    const lines = stdout.split('\n').map((line) => line.trim());
    const second = lines.findIndex((line) => line.includes('dev-daily'));
    const notes = (second > 0 ? lines.slice(0, second) : lines).filter(
      (line) => NOTES.test(line) && !line.startsWith('Wrote')
    );
    for (const note of notes) console.log(`             ${note}`);
    console.log('');
  } catch (e) {
    console.log(`${date}  could not be generated: ${String(e.message).split('\n')[0]}\n`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
