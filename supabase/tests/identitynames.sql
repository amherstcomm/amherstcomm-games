-- Display names from the identity provider.
--
-- Everybody signs in through the company's provider, and a null name keeps you
-- off every board -- so an employee who never opened the account menu played a
-- whole tournament and never appeared in it. Accounts are named on arrival now.
-- What has to hold: the name comes from the provider when it sent one and from
-- the email when it did not, it is cleaned to the rules the boards hold names
-- to, two people cannot end up with one name, and nobody can set, change or
-- clear their own -- not through the function, and not through the table.
\set ON_ERROR_STOP on

create or replace function pg_temp.check(label text, got boolean) returns void
language plpgsql as $$
begin
  raise notice '%  %', case when got is true then 'PASS' else 'FAIL' end, label;
  if got is not true then raise exception 'failed: %', label; end if;
end $$;

create or replace function pg_temp.name_of(u uuid) returns text
language sql as $$ select display_name from public.profiles where id = u $$;

-- ---------------------------------------------------------------------------
-- Where the name comes from
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  ('a1000000-0000-0000-0000-000000000001', 'jdoe@amherstcomm.net',
   '{"full_name": "Jane Doe"}');
select pg_temp.check('a full name from the provider becomes the display name',
  pg_temp.name_of('a1000000-0000-0000-0000-000000000001') = 'Jane Doe');

insert into auth.users (id, email, raw_user_meta_data) values
  ('a1000000-0000-0000-0000-000000000002', 'bsmith@amherstcomm.net',
   '{"given_name": "Bob", "family_name": "Smith"}');
select pg_temp.check('given and family names are put together',
  pg_temp.name_of('a1000000-0000-0000-0000-000000000002') = 'Bob Smith');

insert into auth.users (id, email, raw_user_meta_data) values
  ('a1000000-0000-0000-0000-000000000003', 'carol.jones@amherstcomm.net', null);
select pg_temp.check('with nothing from the provider, the email stands in',
  pg_temp.name_of('a1000000-0000-0000-0000-000000000003') = 'Carol Jones');

-- ---------------------------------------------------------------------------
-- Cleaned to the rules a chosen name follows
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  ('a1000000-0000-0000-0000-000000000004', 'jose@amherstcomm.net',
   '{"full_name": "José O''Brien"}');
select pg_temp.check('accents are folded and apostrophes dropped',
  pg_temp.name_of('a1000000-0000-0000-0000-000000000004') = 'Jose OBrien');

insert into auth.users (id, email, raw_user_meta_data) values
  ('a1000000-0000-0000-0000-000000000005', 'long@amherstcomm.net',
   '{"full_name": "Christopher Montgomery-Smithsonian"}');
select pg_temp.check('a name too long for the boards becomes first name and last initial',
  pg_temp.name_of('a1000000-0000-0000-0000-000000000005') = 'Christopher M');

-- ---------------------------------------------------------------------------
-- Nobody shares a name
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  ('a1000000-0000-0000-0000-000000000006', 'jdoe2@amherstcomm.net',
   '{"full_name": "Jane Doe"}');
select pg_temp.check('a second Jane Doe is numbered rather than refused',
  pg_temp.name_of('a1000000-0000-0000-0000-000000000006') = 'Jane Doe 2');

insert into public.blocked_names (pattern, match) values ('badword', 'exact')
on conflict (pattern) do nothing;
insert into auth.users (id, email, raw_user_meta_data) values
  ('a1000000-0000-0000-0000-000000000007', 'dana.lee@amherstcomm.net',
   '{"full_name": "Bad Word"}');
select pg_temp.check('a blocked name falls through to the email',
  pg_temp.name_of('a1000000-0000-0000-0000-000000000007') = 'Dana Lee');

-- ---------------------------------------------------------------------------
-- The provider's name, always
-- ---------------------------------------------------------------------------
update auth.users set raw_user_meta_data = '{"full_name": "Jane Doe-Ray"}'
 where id = 'a1000000-0000-0000-0000-000000000001';
select pg_temp.check('a name changed at the provider changes here at the next sign-in',
  pg_temp.name_of('a1000000-0000-0000-0000-000000000001') = 'Jane Doe-Ray');

set session "test.uid" = 'a1000000-0000-0000-0000-000000000002';
select pg_temp.check('a player cannot choose their own name',
  public.set_display_name('Bobby') = 'from sign-in'
  and pg_temp.name_of('a1000000-0000-0000-0000-000000000002') = 'Bob Smith');
select pg_temp.check('nor clear it to leave the boards',
  public.set_display_name('') = 'from sign-in'
  and pg_temp.name_of('a1000000-0000-0000-0000-000000000002') = 'Bob Smith');

-- The back door: the update policy that lets a browser save its settings used
-- to let it write its own display_name too, straight through the API.
set role authenticated;
do $$
begin
  update public.profiles set display_name = 'Sneaky'
   where id = 'a1000000-0000-0000-0000-000000000002';
  raise exception 'wrote it';
exception
  when insufficient_privilege then null;
end $$;
reset role;
select pg_temp.check('nor write it straight to the table',
  pg_temp.name_of('a1000000-0000-0000-0000-000000000002') = 'Bob Smith');

set role authenticated;
update public.profiles set settings = '{"theme": "dark"}'
 where id = 'a1000000-0000-0000-0000-000000000002';
reset role;
select pg_temp.check('while the settings a browser saves still save',
  (select settings->>'theme' from public.profiles
   where id = 'a1000000-0000-0000-0000-000000000002') = 'dark');

-- A name somebody chose before this existed gives way to the provider's when
-- the schema is applied.
insert into auth.users (id, email) values ('a1000000-0000-0000-0000-000000000008', 'old.timer@amherstcomm.net');
update public.profiles set display_name = 'Whatever I Liked'
 where id = 'a1000000-0000-0000-0000-000000000008';
select public.apply_identity_name(u.id) from auth.users u;
select pg_temp.check('a name chosen before this existed is replaced by the provider''s',
  pg_temp.name_of('a1000000-0000-0000-0000-000000000008') = 'Old Timer');

-- ---------------------------------------------------------------------------
-- Who may
-- ---------------------------------------------------------------------------
select pg_temp.check('no browser may name an account',
  not has_function_privilege('authenticated', 'public.apply_identity_name(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.apply_identity_name(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.identity_name_for(uuid)', 'execute')
  and not has_column_privilege('authenticated', 'public.profiles', 'display_name', 'update')
  and not has_column_privilege('authenticated', 'public.profiles', 'display_name', 'insert'));

\echo '--- identity name checks passed ---'
