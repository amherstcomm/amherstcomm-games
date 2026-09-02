// Two rules, and the second is the one that would otherwise be found in
// production.
//
// The ladder: holding a privilege implies every privilege below it, and an
// unrecognised requirement is satisfied by nobody. That second half is not
// defensive tidiness. The naive implementation compares the highest held rank
// against the required rank, and an unknown name ranks 0 — so every grant
// out-ranks it and `atLeast(held, 'gaems.admin')` returns true for everyone. A
// typo in a gate would open the surface it was written to close, in the
// direction nobody tests.
//
// The agreement: the three role names live in the CHECK constraint on
// public.role_grants and in src/roles.ts, and nothing but this makes them
// match. When they drift, the interface offers a role the database rejects,
// and the failure surfaces as an insert error nobody connects to a rename.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CAPABILITIES, ROLES, allows, atLeast, rank } from '@/roles';

const schema = readFileSync(join(process.cwd(), 'supabase/schema.sql'), 'utf8');

describe('the ladder', () => {
  it('ranks the roles in the order they are declared', () => {
    expect(ROLES).toEqual(['games.view', 'games.edit', 'games.admin']);
    expect(rank('games.view')).toBe(1);
    expect(rank('games.edit')).toBe(2);
    expect(rank('games.admin')).toBe(3);
  });

  it('lets a privilege imply everything below it', () => {
    expect(atLeast(['games.admin'], 'games.edit')).toBe(true);
    expect(atLeast(['games.admin'], 'games.view')).toBe(true);
    expect(atLeast(['games.edit'], 'games.view')).toBe(true);
  });

  it('does not let one imply anything above it', () => {
    expect(atLeast(['games.view'], 'games.edit')).toBe(false);
    expect(atLeast(['games.edit'], 'games.admin')).toBe(false);
  });

  it('satisfies nothing when nothing is held', () => {
    expect(atLeast([], 'games.view')).toBe(false);
  });

  it('gives an unrecognised requirement to nobody, admin included', () => {
    // The case that fails open if rank is compared without the guard.
    expect(atLeast(['games.admin'], 'gaems.admin')).toBe(false);
    expect(atLeast(['games.admin'], '')).toBe(false);
    expect(atLeast(['games.admin'], 'games.superadmin')).toBe(false);
    expect(rank('nonsense')).toBe(0);
  });

  it('ignores an unrecognised grant rather than ranking it', () => {
    expect(atLeast(['nonsense'], 'games.view')).toBe(false);
  });
});

describe('the schema agrees', () => {
  it('constrains role_grants to exactly these names', () => {
    const check = schema.match(/role text not null check \(role in \(([^)]*)\)\)/);
    expect(check).not.toBeNull();
    const inSchema = [...check![1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
    expect(inSchema).toEqual([...ROLES]);
  });

  it('ranks them the same way in SQL as in TypeScript', () => {
    const fn = schema.slice(schema.indexOf('function public.role_rank'));
    for (const role of ROLES) {
      const m = fn.match(new RegExp(`when '${role.replace('.', '\\.')}' then (\\d+)`));
      expect(m, `role_rank has no branch for ${role}`).not.toBeNull();
      expect(Number(m![1])).toBe(rank(role));
    }
  });

  it('guards has_role against an unrecognised argument', () => {
    // The SQL half of the fail-open case above. Without this predicate the
    // function answers true for every caller when handed a typo.
    const fn = schema.slice(
      schema.indexOf('function public.has_role'),
      schema.indexOf('function public.my_roles')
    );
    expect(fn).toContain('public.role_rank(p_role) > 0');
  });

  it('keeps is_owner reachable by games.admin', () => {
    const fn = schema.slice(schema.indexOf('function public.is_owner'));
    expect(fn).toContain("public.has_role('games.admin')");
  });
});

describe('capabilities', () => {
  /** The seed block, which is the declaration of what capabilities exist. */
  const seed = schema.slice(
    schema.indexOf('insert into public.capabilities'),
    schema.indexOf('on conflict (capability) do nothing')
  );
  const seeded = [...seed.matchAll(/\('([a-z.]+)',\s*'(games\.[a-z]+)'/g)].map((m) => ({
    capability: m[1],
    minRole: m[2],
  }));

  it('seeds exactly the capabilities the app names', () => {
    expect(seeded.map((s) => s.capability)).toEqual([...CAPABILITIES]);
  });

  it('gives every capability a role that exists on the ladder', () => {
    for (const { capability, minRole } of seeded) {
      expect(rank(minRole), `${capability} maps to an unknown role`).toBeGreaterThan(0);
    }
  });

  it('will not let permissions.manage be seeded below admin', () => {
    const row = seeded.find((s) => s.capability === 'permissions.manage');
    expect(row?.minRole).toBe('games.admin');
  });

  it('guards permissions.manage in the database, not just in the seed', () => {
    // A seed value is a starting point; the trigger is what stops the one row
    // that decides who may edit the rows from being handed to everybody.
    const fn = schema.slice(schema.indexOf('function public.capabilities_guard'));
    expect(fn).toContain("new.capability = 'permissions.manage'");
    expect(fn).toContain('public.role_rank(new.min_role) < 3');
    expect(schema).toContain('create trigger capabilities_guard');
  });

  it('fails closed on a capability with no row', () => {
    // coalesce(..., false) is the whole property: absent must mean no. The
    // tempting alternative — "nothing forbids it, so allow" — turns every
    // unseeded capability into an open door.
    const fn = schema.slice(
      schema.indexOf('function public.can('),
      schema.indexOf('function public.my_capabilities')
    );
    // The shape, not just the words: a coalesce whose fallback is literally
    // false. `toContain('false')` would pass on a function that never had one.
    expect(fn).toMatch(/coalesce\([\s\S]*?,\s*false\s*\)/);
    expect(fn).not.toMatch(/coalesce\([\s\S]*?,\s*true\s*\)/);
  });

  it('refuses to invent a capability that no gate reads', () => {
    const fn = schema.slice(schema.indexOf('function public.set_capability'));
    expect(fn).toContain('no such capability');
    expect(fn).toContain("public.can('permissions.manage')");
  });
});

describe('the client-side capability set', () => {
  it('treats absent as no', () => {
    expect(allows([], 'reports.act')).toBe(false);
    expect(allows(['games.play'], 'reports.act')).toBe(false);
    expect(allows(['reports.act'], 'reports.act')).toBe(true);
  });
});
