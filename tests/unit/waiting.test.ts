// The spinner that stops claiming to be loading.
//
// Written after a proxy in front of Supabase started dropping connections and
// the admin portal read as "half of it loaded": every panel spins on a null
// row set, and a request that never comes back leaves the spinner up for ever.
// A failure that is indistinguishable from a slow load costs the time it takes
// to rule out the deploy, which is where the morning went.
//
// This is the unit half -- the number, and where it is used. Whether the
// message actually appears is a browser question, and e2e/admin-wait.spec.ts
// answers it by holding a request open.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { WAIT_MS } from '@/Waiting';

const read = (f: string) => readFileSync(join(process.cwd(), f), 'utf8');

describe('how long a panel waits', () => {
  // Long enough that a heavy query is not called broken -- coverage reads a
  // month -- and short enough that somebody is still looking at the screen.
  it('is a wait somebody will sit through', () => {
    expect(WAIT_MS).toBeGreaterThanOrEqual(5_000);
    expect(WAIT_MS).toBeLessThanOrEqual(20_000);
  });
});

describe('every panel that waits says so', () => {
  // The rule, asserted against the files: a bare <Loader2> in the position
  // where rows are still null is the thing this replaced, and the next panel
  // written by copying an existing one would bring it back.
  it('and none of them spins on a null row set any more', () => {
    const spinning: string[] = [];
    for (const file of readdirSync(join(process.cwd(), 'src'))) {
      if (!/^(Admin\w+|ReportQueueView)\.tsx$/.test(file)) continue;
      const source = read(join('src', file));
      // The two shapes every one of these used: an early return, and an inline
      // guard beside the list.
      if (/if \([^)]*(=== null|!\w+)\) return <Loader2/.test(source)) spinning.push(file);
      if (/\{[^}]*=== null && <Loader2/.test(source)) spinning.push(file);
    }
    expect(spinning).toEqual([]);
  });

  it('and each one names what it could not load', () => {
    const nameless: string[] = [];
    for (const file of readdirSync(join(process.cwd(), 'src'))) {
      if (!/^(Admin\w+|ReportQueueView)\.tsx$/.test(file)) continue;
      const source = read(join('src', file));
      if (!source.includes('<Waiting')) continue;
      // "Could not load the word lists" reads as an answer; "Could not load"
      // reads as a shrug.
      for (const [, attrs] of source.matchAll(/<Waiting([^/]*)\/>/g)) {
        if (!/what="[^"]+"/.test(attrs)) nameless.push(file);
      }
    }
    expect(nameless).toEqual([]);
  });
});
