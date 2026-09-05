-- Things a deployment changes without rebuilding itself.
--
-- The checks worth arguing with are the two validations, because both of them
-- guard against a value that does not merely look wrong: a zone name the
-- browser cannot resolve throws out of Intl at module load and takes every page
-- down with it. A settings form that accepts one is a settings form that can
-- brick the site from a text box.
\set ON_ERROR_STOP on

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'set-admin@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'set-editor@example.com'),
  ('33333333-3333-3333-3333-333333333333', 'set-player@example.com')
on conflict do nothing;
insert into public.role_grants (user_id, role) values
  ('11111111-1111-1111-1111-111111111111', 'games.admin'),
  ('22222222-2222-2222-2222-222222222222', 'games.edit')
on conflict do nothing;
insert into public.profiles (id, display_name)
values ('11111111-1111-1111-1111-111111111111', 'Ray')
on conflict (id) do update set display_name = excluded.display_name;

create or replace function pg_temp.check(label text, got boolean) returns void
language plpgsql as $$
begin
  raise notice '%  %', case when got is true then 'PASS' else 'FAIL' end, label;
  if got is not true then raise exception 'failed: %', label; end if;
end $$;

-- ---------------------------------------------------------------------------
-- Nothing set is not an error, it is the ordinary state
-- ---------------------------------------------------------------------------
select pg_temp.check('with nothing set, there is nothing to say',
  public.read_site_settings() = '{}'::jsonb);

-- ---------------------------------------------------------------------------
-- Setting one
-- ---------------------------------------------------------------------------
set session "test.uid" = '11111111-1111-1111-1111-111111111111';
select pg_temp.check('an admin can set the subtitle',
  (public.set_site_setting('subtitle', 'Employee Ownership Month')->>'ok') = 'true');
select pg_temp.check('and it comes back',
  public.read_site_settings()->>'subtitle' = 'Employee Ownership Month');

-- Written and read in separate statements throughout, and it has to be that
-- way: read_site_settings() is `stable`, so inside one statement it sees the
-- snapshot as of the statement's start and not a write the same statement just
-- made. Combining them tests nothing and fails confusingly.
select pg_temp.check('setting one with spacing round it is allowed',
  (public.set_site_setting('announcement', '  Round 3 opens Friday  ')->>'ok') = 'true');
select pg_temp.check('and the spacing was typing, not meaning',
  public.read_site_settings()->>'announcement' = 'Round 3 opens Friday');

-- An empty row and an unset row have to mean the same thing, because that is
-- what lets the client fall through to its build value in both cases.
select public.set_site_setting('announcement', '');
select pg_temp.check('clearing one takes it out of the answer entirely',
  not (public.read_site_settings() ? 'announcement'));
select pg_temp.check('though the row stays, carrying who cleared it',
  (select updated_by from public.site_settings where key = 'announcement')
    = '11111111-1111-1111-1111-111111111111');

-- ---------------------------------------------------------------------------
-- The two that can break a page rather than look wrong
-- ---------------------------------------------------------------------------
select pg_temp.check('a real zone is taken',
  (public.set_site_setting('office_zone', 'America/Denver')->>'ok') = 'true');
-- Intl throws a RangeError on an unknown zone, at module load, for everybody.
select pg_temp.check('and one the platform does not know is refused',
  (public.set_site_setting('office_zone', 'Amherst/Office')->>'ok') = 'false');
select pg_temp.check('with the refusal saying what a zone looks like',
  (public.set_site_setting('office_zone', 'Central')->>'reason') like '%America/Chicago%');
select pg_temp.check('the bad one did not land',
  public.read_site_settings()->>'office_zone' = 'America/Denver');
select pg_temp.check('and clearing it is still allowed',
  (public.set_site_setting('office_zone', '')->>'ok') = 'true');
select public.set_site_setting('office_zone', 'America/Chicago');

select pg_temp.check('an address is taken',
  (public.set_site_setting('contact_email', 'games@amherstcomm.net')->>'ok') = 'true');
select pg_temp.check('and something that is not one is not',
  (public.set_site_setting('contact_email', 'games at amherstcomm')->>'ok') = 'false');

-- ---------------------------------------------------------------------------
-- A key that does not exist
--
-- `subtitles` and `subtitle` both look plausible in a database, and only one of
-- them renders — silently.
-- ---------------------------------------------------------------------------
select pg_temp.check('an invented key is refused rather than stored',
  (public.set_site_setting('subtitles', 'oops')->>'reason') = 'no such setting');
select pg_temp.check('and nothing was written',
  not exists (select 1 from public.site_settings where key = 'subtitles'));

select pg_temp.check('a value longer than the space it goes in is refused',
  (public.set_site_setting('subtitle', repeat('x', 201))->>'ok') = 'false');
select pg_temp.check('and the old value survives it',
  public.read_site_settings()->>'subtitle' = 'Employee Ownership Month');

-- ---------------------------------------------------------------------------
-- Who may
-- ---------------------------------------------------------------------------
set session "test.uid" = '22222222-2222-2222-2222-222222222222';
select pg_temp.check('an editor may not change the site',
  (public.set_site_setting('subtitle', 'Editor was here')->>'ok') = 'false');
select pg_temp.check('nor see the list of what there is to change',
  (public.site_settings_sheet()->>'ok') = 'false');

set session "test.uid" = '33333333-3333-3333-3333-333333333333';
select pg_temp.check('a player certainly may not',
  (public.set_site_setting('subtitle', 'Player was here')->>'ok') = 'false');

-- But everybody reads them, including before signing in: the masthead and the
-- privacy page render for somebody who has not.
set session "test.uid" = '';
select pg_temp.check('while anyone at all may read them',
  public.read_site_settings()->>'subtitle' = 'Employee Ownership Month');
select pg_temp.check('and anon is granted exactly that and nothing else',
  has_function_privilege('anon', 'public.read_site_settings()', 'execute')
  and not has_function_privilege('anon', 'public.set_site_setting(text, text)', 'execute')
  and not has_function_privilege('anon', 'public.site_settings_sheet()', 'execute'));
-- Reversal, and the reason it matters more than the wording suggests. This
-- used to assert that the table was *granted* to nobody, which passed on a bare
-- Postgres and proved nothing: a Supabase database grants anon and authenticated
-- default privileges on every new table in `public`, so the grant is there and
-- protection comes from RLS instead. The old assertion could not fail on the
-- machine it ran on, and would have gone on passing for a table that was wide
-- open in production — which is exactly what nearly shipped here.
select pg_temp.check('the settings tables are protected by RLS, not by hope',
  (select bool_and(c.relrowsecurity) from pg_class c
   join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname in ('site_settings', 'site_setting_keys')));
select pg_temp.check('and carry no policy, so nothing is readable directly',
  not exists (select 1 from pg_policies
              where schemaname = 'public'
                and tablename in ('site_settings', 'site_setting_keys')));

-- ---------------------------------------------------------------------------
-- The page that draws the form
-- ---------------------------------------------------------------------------
set session "test.uid" = '11111111-1111-1111-1111-111111111111';
select pg_temp.check('the sheet lists every key, set or not',
  jsonb_array_length(public.site_settings_sheet()->'settings') =
  (select count(*) from public.site_setting_keys));
select pg_temp.check('each with what it is for',
  (select bool_and((e->>'description') is not null and (e->>'description') <> '')
   from jsonb_array_elements(public.site_settings_sheet()->'settings') e));
select pg_temp.check('and a set one says who set it',
  (select e->>'updated_by' from jsonb_array_elements(
     public.site_settings_sheet()->'settings') e where e->>'key' = 'subtitle') = 'Ray');

\echo '--- settings checks passed ---'
