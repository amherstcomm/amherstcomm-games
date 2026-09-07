// This repository is a fork, and a fork's defaults are where the original
// keeps showing through.
//
// Three have been found so far, all with the same shape: an unset value fell
// back to the project this one was forked from, and none of them failed. The
// preview asked *anagrimoire's* database what covered a day in October and was
// told nothing, so it printed "an ordinary day" for a month that was set up.
// The daily feed fell back to upstream's puzzle-data branch, so a database blip
// would have served working puzzles that were somebody else's — unthemed, on
// the one month this deployment is themed, and convincing enough that a smoke
// test passes. The word bands were fetched from upstream's tag, which is not
// where this deployment's words would be.
//
// A wrong answer that looks right is worse than an error, and every one of
// these looked right. So the rule is asserted against the source: nothing that
// runs in the browser or on the publish host names the upstream project.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// What this is about is where data and mail come *from*, not who wrote the
// thing. The licence and the credit link to the upstream repository on
// github.com and must keep doing so -- that is the attribution the licence
// asks for, and deleting it to satisfy a test would be the wrong fix.
const UPSTREAM = /rptetzloff\/anagrimoire|anagrimoire\.com|anagrimoire\.onrender\.com/;
const ATTRIBUTION = /https:\/\/github\.com\/rptetzloff\/anagrimoire/;

/** Every source file under a directory, recursively. */
function filesUnder(dir: string, take: (name: string) => boolean): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...filesUnder(path, take));
    else if (take(entry)) out.push(path);
  }
  return out;
}

describe('the fork does not read the project it came from', () => {
  it('not from the app', () => {
    const naming: string[] = [];
    for (const file of filesUnder(join(process.cwd(), 'src'), (n) => /\.tsx?$/.test(n))) {
      for (const line of readFileSync(file, 'utf8').split('\n')) {
        // Prose may name it — the reversals are written down on purpose, and
        // deleting the history of a wrong default is how it comes back.
        if (/^\s*(\/\/|\*|\/\*)/.test(line)) continue;
        if (ATTRIBUTION.test(line)) continue;
        if (UPSTREAM.test(line)) naming.push(`${file.split(/[\/]/).pop()}: ${line.trim()}`);
      }
    }
    expect(naming).toEqual([]);
  });

  it('nor from the scripts that publish', () => {
    const naming: string[] = [];
    const scripts = join(process.cwd(), 'scripts');
    for (const file of filesUnder(scripts, (n) => n.endsWith('.mjs'))) {
      for (const line of readFileSync(file, 'utf8').split('\n')) {
        if (/^\s*(\/\/|\*|\/\*)/.test(line)) continue;
        if (ATTRIBUTION.test(line)) continue;
        if (UPSTREAM.test(line)) naming.push(`${file.split(/[\/]/).pop()}: ${line.trim()}`);
      }
    }
    expect(naming).toEqual([]);
  });
});
