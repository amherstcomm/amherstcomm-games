-- The bits of Supabase that schema.sql assumes exist. Enough to run the SQL,
-- not a simulation of GoTrue.
create extension if not exists pgcrypto;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;
grant usage on schema public to anon, authenticated, service_role;

-- What a real Supabase hands out, and the reason to model it here.
--
-- A hosted Supabase sets default privileges so that every new table in `public`
-- is granted to anon and authenticated the moment it is created. Protection
-- therefore comes from RLS, not from having granted nothing — and a throwaway
-- Postgres without this line disagrees, silently and in the safe direction.
--
-- Which made a whole class of assertion vacuous: `not has_table_privilege(
-- 'anon', ...)` passed here for a reason that does not hold there, so it would
-- have gone on passing for a table that was wide open in production. It took
-- Supabase Studio warning about an unprotected table to notice, on a table
-- whose test said it was fine.
alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;

create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text
);
-- Whoever the current GUC says. The real one reads the JWT; this reads a
-- setting, so a test can be somebody.
create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('test.uid', true), '')::uuid
$$;
create or replace function auth.jwt() returns jsonb
language sql stable as $$ select '{}'::jsonb $$;
grant usage on schema auth to anon, authenticated, service_role;
