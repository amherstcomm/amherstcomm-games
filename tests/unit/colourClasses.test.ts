// Every colour class a component uses is one this project defines.
//
// Written because ten files did not. `text-slate-100` is not in the slate scale
// tailwind.config.js declares — it stops at 200 — so Tailwind fell through to
// its own default, a near-white that no palette here can move. On the dark
// themes that looked like every other pale text. On Amherst's light theme it
// was #f1f5f9 on a white field: 1.05:1, an invisible input.
//
// Nothing else could catch it. The palette tests measure the colours this file
// declares against each other, and a class that never reaches those variables
// is not one of them; axe measures what is rendered, and the admin pages behind
// a capability gate are not in that sweep. So the artifact is read instead: the
// classes in the source, against the scales in the config.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** The tiers the project actually defines, read out of the Tailwind config
 *  rather than copied — a copied list is a list to be wrong. */
function scales(): Record<string, number[]> {
  const config = readFileSync(join(process.cwd(), 'tailwind.config.js'), 'utf8');
  const out: Record<string, number[]> = {};
  for (const [, name, tiers] of config.matchAll(/(\w+): scale\('\w+', \[([\d, ]+)\]\)/g)) {
    out[name] = tiers.split(',').map((n) => Number(n.trim()));
  }
  return out;
}

function sources(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) sources(path, found);
    else if (/\.tsx?$/.test(entry.name)) found.push(path);
  }
  return found;
}

const USES =
  /\b(?:text|bg|border|ring|fill|stroke|from|to|via|decoration|outline|shadow|accent|caret|divide|placeholder)-(slate|amber|emerald|rose|sky|violet)-(\d+)\b/g;

describe('the colour classes components use', () => {
  it('are all tiers this project defines', () => {
    const declared = scales();
    expect(Object.keys(declared).length).toBeGreaterThan(0);

    const strays: string[] = [];
    for (const file of sources(join(process.cwd(), 'src'))) {
      const source = readFileSync(file, 'utf8');
      for (const [, hue, tier] of source.matchAll(USES)) {
        if (!declared[hue]?.includes(Number(tier))) {
          strays.push(`${file.split(/[\\/]/).pop()}: ${hue}-${tier}`);
        }
      }
    }
    expect(
      [...new Set(strays)],
      'these fall through to Tailwind’s own palette, which no theme here can move'
    ).toEqual([]);
  });
});
