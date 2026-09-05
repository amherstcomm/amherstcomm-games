// The name is read in two places at two different times: src/brand.ts in the
// browser, and vite.config.ts while it stamps index.html. Nothing connects
// them, so a deployment that sets neither would get its tab title from one
// default and its masthead from the other — and the failure is a site calling
// itself two different things on the same page, which reads as a bug in the
// site rather than in a config file.
//
// The subtitle has no such pair: it renders only in the app. What is worth
// pinning there is that empty means *absent* — a subtitle defaulting to
// something cheerful would leave last year's campaign on the page after
// someone blanked the value and believed they had turned it off.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SITE_NAME_FALLBACK } from '@/brand';

const viteConfig = readFileSync(join(process.cwd(), 'vite.config.ts'), 'utf8');
const indexHtml = readFileSync(join(process.cwd(), 'index.html'), 'utf8');

async function loadWith(env: Record<string, string>) {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  return import('@/brand');
}

beforeEach(() => {
  vi.unstubAllEnvs();
});

describe('the name', () => {
  it('falls back to the same string vite.config.ts stamps', () => {
    const m = viteConfig.match(/process\.env\.VITE_SITE_NAME \|\| '([^']+)'/);
    expect(m, 'vite.config.ts no longer defaults VITE_SITE_NAME').not.toBeNull();
    expect(m![1]).toBe(SITE_NAME_FALLBACK);
  });

  it('uses the configured name when there is one', async () => {
    const { SITE_NAME } = await loadWith({ VITE_SITE_NAME: 'Amherst Games' });
    expect(SITE_NAME).toBe('Amherst Games');
  });

  it('falls back rather than rendering an empty masthead', async () => {
    for (const value of ['', '   ']) {
      const { SITE_NAME } = await loadWith({ VITE_SITE_NAME: value });
      expect(SITE_NAME).toBe(SITE_NAME_FALLBACK);
    }
  });

  it('is stamped into the tab title and the preview tags rather than hardcoded', () => {
    expect(indexHtml).toContain('<title>%SITE_NAME%</title>');
    expect(indexHtml).toContain('property="og:site_name" content="%SITE_NAME%"');
    // the old name must not survive anywhere a person or a scraper reads
    expect(indexHtml).not.toMatch(/<title>[^<]*Anagrimoire/);
  });
});

// The build value is the *fallback* now: a site_settings row overrides it, and
// components read useSetting('subtitle'). What is asserted here is the floor —
// what paints before the database answers, and what applies if it never does.
// tests/unit/settings.test.ts owns the layering on top.
describe('the subtitle fallback', () => {
  it('is empty unless set, so no campaign outlives its month', async () => {
    for (const value of ['', '   ']) {
      const { SITE_SUBTITLE_FALLBACK } = await loadWith({ VITE_SITE_SUBTITLE: value });
      expect(SITE_SUBTITLE_FALLBACK).toBe('');
    }
  });

  it('carries the event when there is one', async () => {
    const { SITE_SUBTITLE_FALLBACK } = await loadWith({
      VITE_SITE_SUBTITLE: 'Employee Ownership Month',
    });
    expect(SITE_SUBTITLE_FALLBACK).toBe('Employee Ownership Month');
  });
});
