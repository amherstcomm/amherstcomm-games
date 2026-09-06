// The workflows that build the puzzles can actually reach the settings.
//
// Written because they could not, and nothing said so. A themed month lives in
// the database, and every lookup the generator makes — word lists, Weave
// themes, cryptogram passages, word rules, pins — needs a URL and a key. The
// nightly step had neither: the key was on the *publish* step below it, and no
// step anywhere named the URL. So every lookup returned "nothing covers this
// day", which reads exactly like a day nobody themed, and a themed October
// would have gone out as thirty-one ordinary days with a green tick on the run.
//
// The admin pages showed 31 of 31 the whole time, because the browser reads the
// database directly with its own credentials. Only the generator was blind.
//
// So the rule is asserted against the file: a step that runs a script needing
// the settings passes both, and no script in this repository defaults to
// another project's database.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const workflows = join(process.cwd(), '.github/workflows');
/** The file with its prose taken out. These headers explain which secrets a
 *  workflow needs, so a comment naming one of them read as a step passing it —
 *  which is how the first version of the check below failed on a file that was
 *  correct. */
const read = (file: string) =>
  readFileSync(join(workflows, file), 'utf8')
    .split('\n')
    .filter((line) => !/^\s*#/.test(line))
    .join('\n');

/** The file as written, for the checks that are about the whole file. */
const readAll = (file: string) => readFileSync(join(workflows, file), 'utf8');

describe('the workflows that build puzzles', () => {
  // The rule this file was first written with was wrong, and the wrongness is
  // worth keeping: it asserted that the GitHub steps pass both database
  // credentials. They cannot. Supabase answers on the internal network here, so
  // a hosted runner has no route to it whatever secrets it holds — which is why
  // ops/publish-puzzles.sh exists and why the themed puzzles come from the VM.
  //
  // What is worth asserting is that the two paths do not quietly disagree: a
  // step that runs the generator either has both credentials or neither, since
  // one without the other reads nothing and says nothing.
  it('never pass one database credential without the other', () => {
    const wrong: string[] = [];
    for (const file of readdirSync(workflows)) {
      const yaml = read(file);
      for (const step of yaml.split(/\n {6}- /)) {
        const url = step.includes('SUPABASE_URL');
        const key = step.includes('SUPABASE_SERVICE_ROLE_KEY');
        if (url !== key) {
          wrong.push(`${file}: a step passes ${url ? 'SUPABASE_URL' : 'the key'} and not the other`);
        }
      }
    }
    expect([...new Set(wrong)]).toEqual([]);
  });

  // The preview is an ops script for the same reason the publish is. A
  // workflow calling it would connect to nothing, or — the way this actually
  // failed — to somebody else's database.
  it('and do not try to preview a month from a hosted runner', () => {
    for (const file of readdirSync(workflows)) {
      expect(readAll(file), `${file} runs the preview`).not.toContain('preview-month.mjs');
    }
  });
});

describe('the scripts that talk to Supabase', () => {
  // This repository is a fork, and three scripts kept the upstream project's
  // URL as their fallback. An unset SUPABASE_URL then sent this deployment's
  // key to somebody else's database, which answered politely that nothing was
  // there — the preview reported "an ordinary day" for a month that was set up.
  it('never default to a database of their own choosing', () => {
    const scripts = join(process.cwd(), 'scripts');
    const guessing: string[] = [];
    for (const file of readdirSync(scripts)) {
      if (!file.endsWith('.mjs')) continue;
      const source = readFileSync(join(scripts, file), 'utf8');
      for (const [, url] of source.matchAll(/SUPABASE_URL\s*\|\|\s*'([^']+)'/g)) {
        guessing.push(`${file} falls back to ${url}`);
      }
    }
    expect(guessing).toEqual([]);
  });
});
