// A shell script that ships without its executable bit.
//
// Written because ops/preview-month.sh did. It is documented as
// `ops/preview-month.sh --from …`, sits beside publish-puzzle.sh which has the
// bit, and was committed 100644 — so the one person who runs it got
// "permission denied" for a script that was otherwise finished. Nothing here
// notices: it typechecks, it lints, the suite is green, and the file reads
// correctly in the diff. The mode is only visible in `git ls-files -s`.
//
// So the rule is asserted against the index rather than against the working
// tree: Windows checkouts do not carry the bit on disk at all, and what ships
// is what git recorded.
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

/** Every tracked shell script, as `<mode> <sha> <stage>\t<path>`. */
const tracked = () =>
  execFileSync('git', ['ls-files', '-s', '*.sh'], { encoding: 'utf8' })
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [meta, path] = line.split('\t');
      return { mode: meta.split(' ')[0], path };
    });

describe('the scripts somebody runs', () => {
  it('are committed executable', () => {
    const scripts = tracked();
    // A guard on the guard: a glob that matches nothing would pass silently.
    expect(scripts.length).toBeGreaterThan(0);
    expect(scripts.filter((s) => s.mode !== '100755').map((s) => s.path)).toEqual([]);
  });
});
