// What this deployment says about itself.
//
// The rule under test is the three-source order — row, then what this browser
// saw last time, then the build value — and the thing most worth pinning is
// that an *empty* row and *no* row mean the same thing. They have to: that is
// what lets a cleared setting fall back to the build value instead of
// rendering a blank masthead, and it is enforced in two places (the server
// leaves empty rows out, this leaves empty strings out) which is exactly the
// arrangement that drifts.
import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SETTING_KEYS, __setSettingsForTest, setting } from '@/settings';
import { SITE_SUBTITLE_FALLBACK } from '@/brand';
import { OFFICE_ZONE_FALLBACK } from '@/schedule';

beforeEach(() => __setSettingsForTest({}));

describe('the keys', () => {
  // A key this file invents is a form field that saves nothing; a key only the
  // server knows is one nothing displays. Neither fails anywhere else.
  it('are the ones the schema declares, and no others', () => {
    const schema = readFileSync(join(process.cwd(), 'supabase/schema.sql'), 'utf8');
    const block = schema.slice(
      schema.indexOf('insert into public.site_setting_keys'),
      schema.indexOf('on conflict (key) do update')
    );
    const declared = [...block.matchAll(/\('([a-z_]+)',/g)].map((m) => m[1]);
    expect(declared.sort()).toEqual([...SETTING_KEYS].sort());
  });
});

describe('falling back', () => {
  it('uses the build value when there is no row', () => {
    expect(setting('subtitle')).toBe(SITE_SUBTITLE_FALLBACK);
    expect(setting('office_zone')).toBe(OFFICE_ZONE_FALLBACK);
  });

  it('and the row when there is one', () => {
    __setSettingsForTest({ subtitle: 'Employee Ownership Month' });
    expect(setting('subtitle')).toBe('Employee Ownership Month');
  });

  // The whole reason empties are dropped rather than stored as "".
  it('treats an empty row as no row at all', () => {
    __setSettingsForTest({ subtitle: '' });
    expect(setting('subtitle')).toBe(SITE_SUBTITLE_FALLBACK);
  });

  it('and whitespace as empty, because it was typed rather than meant', () => {
    __setSettingsForTest({ subtitle: '   ' });
    expect(setting('subtitle')).toBe(SITE_SUBTITLE_FALLBACK);
  });

  it('trims what it keeps', () => {
    __setSettingsForTest({ announcement: '  Round 3 opens Friday  ' });
    expect(setting('announcement')).toBe('Round 3 opens Friday');
  });

  // The announcement is the one whose absence is the ordinary state, so its
  // fallback is emptiness rather than a build value.
  it('has nothing to announce by default', () => {
    expect(setting('announcement')).toBe('');
  });
});

describe('what it will not take', () => {
  it('ignores a key it does not know', () => {
    __setSettingsForTest({ subtitles: 'oops' } as never);
    expect(setting('subtitle')).toBe(SITE_SUBTITLE_FALLBACK);
  });

  it('and a value that is not a string', () => {
    // `value` arrives as JSON from the server; the type does not rule this out
    __setSettingsForTest({ subtitle: 42 } as never);
    expect(setting('subtitle')).toBe(SITE_SUBTITLE_FALLBACK);
  });
});
