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
const read = (file: string) => readFileSync(join(workflows, file), 'utf8');

/** The scripts that ask the database what a day is themed with. */
const NEEDS_SETTINGS = ['fetch-puzzles.mjs', 'preview-month.mjs', 'publish-window.mjs'];

describe('the workflows that build puzzles', () => {
  it('hand both credentials to every step that reads the settings', () => {
    const missing: string[] = [];
    for (const file of readdirSync(workflows)) {
      const yaml = read(file);
      // Steps are separated by `- run:` / `- name:` at the same indent; near
      // enough to split on, and the failure it could miss is a step that names
      // a script and passes nothing, which is the case that matters.
      for (const step of yaml.split(/\n {6}- /)) {
        if (!NEEDS_SETTINGS.some((script) => step.includes(script))) continue;
        for (const key of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']) {
          if (!step.includes(key)) missing.push(`${file}: a step running a settings-reading script has no ${key}`);
        }
      }
    }
    expect([...new Set(missing)]).toEqual([]);
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
