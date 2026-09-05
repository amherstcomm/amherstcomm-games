-- Every table in `public` has row level security enabled.
--
-- A rule, asserted against the artifact, because the alternative is remembering
-- it once per table forever. It shipped wrong the first time it was tested:
-- site_setting_keys was created without RLS, the suite was green, and the thing
-- that noticed was Supabase Studio refusing to run the file.
--
-- The reason the suite was green is worth keeping. A bare Postgres grants
-- nothing on a new table, so "anon cannot select from it" is true there whether
-- or not RLS is on. A Supabase grants anon and authenticated default privileges
-- on everything created in `public`, so RLS is the only thing standing between
-- a new table and the anon key. bootstrap.sql now models that; this file is the
-- rule that models it being remembered.
--
-- RLS with no policy is the ordinary state here, not an oversight: almost every
-- table in this schema is written through security-definer functions and read
-- through them too, so "enabled, no policy" means "reachable only the intended
-- way". A policy is the exception and is written where one is wanted.
\set ON_ERROR_STOP on

create or replace function pg_temp.check(label text, got boolean) returns void
language plpgsql as $$
begin
  raise notice '%  %', case when got is true then 'PASS' else 'FAIL' end, label;
  if got is not true then raise exception 'failed: %', label; end if;
end $$;

do $$
declare
  bare text;
begin
  select string_agg(c.relname, ', ' order by c.relname) into bare
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;

  if bare is not null then
    raise notice 'FAIL  every table in public has row level security enabled';
    raise exception 'these tables have no RLS, and a Supabase grants anon access to them: %', bare;
  end if;
  raise notice 'PASS  every table in public has row level security enabled';
end $$;

-- And the harness is honest about the grants, because the check above only
-- means something on a database shaped like the real one.
select pg_temp.check('the test database grants new tables the way Supabase does',
  has_table_privilege('anon', 'public.site_settings', 'select'));

\echo '--- rls checks passed ---'
