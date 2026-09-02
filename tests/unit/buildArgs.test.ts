// Three files have to agree about the VITE_ variables, and nothing enforced it.
//
// This shipped: VITE_SSO_SAML_DOMAIN and VITE_SSO_LABEL were documented in
// .env.example, read by src/sso.ts, and declared in neither the Dockerfile nor
// compose.yaml. A correct .env therefore produced a build that ignored it —
// and silently, because a missing VITE_ value is not an error at any layer.
// Vite compiles `undefined` in, sso.ts reads that as "no SSO configured", and
// the modal renders the GitHub, Google and magic-link surfaces exactly as it
// would with no configuration at all. Nothing logs, nothing fails, and the
// deployment looks like a Zitadel problem.
//
// So the rule is asserted against the artifacts rather than remembered: every
// VITE_ variable named in .env.example is declared ARG in the Dockerfile and
// passed as a build arg by compose.yaml.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// process.cwd(), not import.meta.url — the unit project runs in happy-dom,
// where import.meta.url is not a file: URL and fileURLToPath throws.
const read = (f: string) => readFileSync(join(process.cwd(), f), 'utf8');

/** Names on the left of an assignment, so prose mentioning a variable in a
 *  comment doesn't count as declaring one. */
function declaredInEnvExample(): string[] {
  return [...read('.env.example').matchAll(/^(VITE_[A-Z0-9_]+)=/gm)].map((m) => m[1]);
}

function argsInDockerfile(): string[] {
  return [...read('Dockerfile').matchAll(/^ARG\s+(VITE_[A-Z0-9_]+)/gm)].map((m) => m[1]);
}

function buildArgsInCompose(): string[] {
  return [...read('compose.yaml').matchAll(/^\s+(VITE_[A-Z0-9_]+):\s*\$\{/gm)].map((m) => m[1]);
}

describe('every VITE_ variable reaches the build', () => {
  const documented = declaredInEnvExample();

  it('finds the variables at all — a regex that matched nothing would pass everything', () => {
    expect(documented.length).toBeGreaterThan(4);
    expect(documented).toContain('VITE_SUPABASE_URL');
    expect(argsInDockerfile().length).toBeGreaterThan(4);
    expect(buildArgsInCompose().length).toBeGreaterThan(4);
  });

  it.each(documented)('%s is declared ARG in the Dockerfile', (name) => {
    expect(argsInDockerfile()).toContain(name);
  });

  it.each(documented)('%s is passed as a build arg by compose.yaml', (name) => {
    expect(buildArgsInCompose()).toContain(name);
  });

  it('declares nothing the Dockerfile does not document', () => {
    // The other direction: an ARG with no entry in .env.example is a value
    // nobody deploying this knows they can set.
    for (const name of argsInDockerfile()) expect(documented).toContain(name);
  });

  it('keeps the sign-in routing wired, which is the case that shipped broken', () => {
    for (const name of [
      'VITE_SSO_PROVIDER',
      'VITE_SSO_SAML_DOMAIN',
      'VITE_SSO_SAML_PROVIDER_ID',
      'VITE_SSO_LABEL',
    ]) {
      expect(documented).toContain(name);
      expect(argsInDockerfile()).toContain(name);
      expect(buildArgsInCompose()).toContain(name);
    }
  });
});
