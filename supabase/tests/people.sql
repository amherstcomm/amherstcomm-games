-- Handing somebody a privilege.
--
-- The check worth the most here is the lockout guard, because getting it wrong
-- is not recoverable from inside the application: role_grants is reachable only
-- through set_person_role, that needs users.manage, and users.manage needs an
-- administrator. A deployment with no administrator cannot appoint one, and the
-- way back is SQL by hand — the exact thing this page exists to stop being
-- necessary.
\set ON_ERROR_STOP on

insert into auth.users (id, email) values
  ('a1111111-1111-1111-1111-111111111111', 'ray@amherstcomm.net'),
  ('a2222222-2222-2222-2222-222222222222', 'second-admin@amherstcomm.net'),
  ('b1111111-1111-1111-1111-111111111111', 'editor@amherstcomm.net'),
  ('c1111111-1111-1111-1111-111111111111', 'dave.jones@amherstcomm.net'),
  ('c2222222-2222-2222-2222-222222222222', 'dave.smith@amherstcomm.net')
on conflict do nothing;
insert into public.role_grants (user_id, role) values
  ('a1111111-1111-1111-1111-111111111111', 'games.admin'),
  ('b1111111-1111-1111-1111-111111111111', 'games.edit')
on conflict do nothing;
insert into public.profiles (id, display_name) values
  ('a1111111-1111-1111-1111-111111111111', 'Ray the first admin'),
  ('c1111111-1111-1111-1111-111111111111', 'Dave Jones of Accounts')
on conflict (id) do update set display_name = excluded.display_name;

create or replace function pg_temp.check(label text, got boolean) returns void
language plpgsql as $$
begin
  raise notice '%  %', case when got is true then 'PASS' else 'FAIL' end, label;
  if got is not true then raise exception 'failed: %', label; end if;
end $$;

/** What somebody holds now, or 'games.view' for a person with no row —
 *  which is the ordinary state and not an absence of one. */
create or replace function pg_temp.role_of(p uuid) returns text
language sql as $$
  select coalesce((select g.role from public.role_grants g where g.user_id = p
                   order by public.role_rank(g.role) desc limit 1), 'games.view')
$$;

set session "test.uid" = 'a1111111-1111-1111-1111-111111111111';

-- ---------------------------------------------------------------------------
-- Who holds what
-- ---------------------------------------------------------------------------
select pg_temp.check('an admin can see who holds something',
  (public.people_with_roles()->>'ok') = 'true');
-- Every test file here shares one database, so a total is a claim about the
-- other files rather than about this one. What matters is that the list is the
-- people holding a row, not the people who exist.
select pg_temp.check('and it is the people with a row, not everybody at all',
  (select count(*) from jsonb_array_elements(public.people_with_roles()->'people'))
    = (select count(*) from public.role_grants)
  and (select count(*) from public.role_grants) < (select count(*) from auth.users));
select pg_temp.check('including the administrator this file set up',
  exists (select 1 from jsonb_array_elements(public.people_with_roles()->'people') e
          where e->>'user' = 'a1111111-1111-1111-1111-111111111111'
            and e->>'role' = 'games.admin'));
select pg_temp.check('and the editor',
  exists (select 1 from jsonb_array_elements(public.people_with_roles()->'people') e
          where e->>'user' = 'b1111111-1111-1111-1111-111111111111'
            and e->>'role' = 'games.edit'));
-- A room contains two people called Dave.
select pg_temp.check('with the address, which is what tells two Daves apart',
  (select bool_and((e->>'email') is not null)
   from jsonb_array_elements(public.people_with_roles()->'people') e));
select pg_temp.check('the strongest first',
  public.people_with_roles()->'people'->0->>'role' = 'games.admin');
-- The page needs to know which row is the person reading it, because the
-- refusal it will get for demoting themselves is worth saying up front.
select pg_temp.check('and it says which one is you',
  (select bool_or((e->>'self')::boolean)
   from jsonb_array_elements(public.people_with_roles()->'people') e
   where e->>'user' = 'a1111111-1111-1111-1111-111111111111'));

-- ---------------------------------------------------------------------------
-- Finding somebody who holds nothing yet
-- ---------------------------------------------------------------------------
select pg_temp.check('somebody can be found by address',
  jsonb_array_length(public.find_people('dave.')->'people') = 2);
select pg_temp.check('or by the name the site knows them as',
  (public.find_people('Dave Jones of Accounts')->'people'->0->>'email') = 'dave.jones@amherstcomm.net');
select pg_temp.check('and what they already hold travels with them',
  (public.find_people('editor@')->'people'->0->>'role') = 'games.edit');
select pg_temp.check('somebody with nothing has nothing, rather than being missing',
  (public.find_people('dave.jones')->'people'->0) ? 'user'
  and (public.find_people('dave.jones')->'people'->0->'role') = 'null'::jsonb);
-- A directory that lists itself on two characters is a directory being read,
-- not searched.
select pg_temp.check('one letter finds nobody',
  jsonb_array_length(public.find_people('d')->'people') = 0);
select pg_temp.check('and nothing finds nobody',
  jsonb_array_length(public.find_people('')->'people') = 0);

-- ---------------------------------------------------------------------------
-- Granting, and taking away
-- ---------------------------------------------------------------------------
select pg_temp.check('an ordinary person can be made an editor',
  (public.set_person_role('c1111111-1111-1111-1111-111111111111', 'games.edit')->>'ok') = 'true');
select pg_temp.check('and now holds it',
  pg_temp.role_of('c1111111-1111-1111-1111-111111111111') = 'games.edit');

-- Nobody needs two rows: a row out-ranks everything below it, so setting a
-- level replaces rather than adds.
select pg_temp.check('promoting replaces rather than accumulating',
  (public.set_person_role('c1111111-1111-1111-1111-111111111111', 'games.admin')->>'ok') = 'true');
select pg_temp.check('leaving exactly one row',
  (select count(*) from public.role_grants
   where user_id = 'c1111111-1111-1111-1111-111111111111') = 1);

-- games.view is the floor and never a row — being signed in is the proof.
-- Two statements, not one. A read in the same statement as the write sees the
-- snapshot from the statement's start and not the delete that just happened —
-- the same trap settings.sql carries a note about.
select pg_temp.check('taking it away is allowed',
  (public.set_person_role('c1111111-1111-1111-1111-111111111111', 'games.view')->>'ok') = 'true');
select pg_temp.check('and leaves no row at all',
  not exists (select 1 from public.role_grants
              where user_id = 'c1111111-1111-1111-1111-111111111111'));
select pg_temp.check('and that reads as an ordinary player, not as a missing person',
  pg_temp.role_of('c1111111-1111-1111-1111-111111111111') = 'games.view');

select pg_temp.check('a privilege that does not exist is refused',
  (public.set_person_role('c1111111-1111-1111-1111-111111111111', 'games.god')->>'reason')
    = 'no such privilege');
select pg_temp.check('and so is a person who does not exist',
  (public.set_person_role('dddddddd-dddd-dddd-dddd-dddddddddddd', 'games.edit')->>'reason')
    = 'no such person');

-- ---------------------------------------------------------------------------
-- The lockout guard
--
-- Not recoverable from inside the application, so it is refused here.
--
-- "The last administrator" is a fact about the whole database, and every test
-- file here shares one — asks.sql appoints an administrator of its own and runs
-- first, which made this pass for the wrong reason and then fail for the right
-- one. So the scenario is built rather than assumed: everybody else's admin row
-- goes, leaving exactly the one this is about. Files that run later insert
-- their own grants at the top, which is why taking these is safe.
-- ---------------------------------------------------------------------------
delete from public.role_grants
where role = 'games.admin' and user_id <> 'a1111111-1111-1111-1111-111111111111';
select pg_temp.check('there is exactly one administrator to test with',
  (select count(*) from public.role_grants where role = 'games.admin') = 1);
select pg_temp.check('the last administrator cannot be demoted',
  (public.set_person_role('a1111111-1111-1111-1111-111111111111', 'games.edit')->>'reason')
    like 'that is the last administrator%');
select pg_temp.check('not even by themselves',
  (public.set_person_role('a1111111-1111-1111-1111-111111111111', 'games.view')->>'ok') = 'false');
select pg_temp.check('and they still hold it',
  pg_temp.role_of('a1111111-1111-1111-1111-111111111111') = 'games.admin');

select public.set_person_role('a2222222-2222-2222-2222-222222222222', 'games.admin');
select pg_temp.check('with a second one appointed, the first may step down',
  (public.set_person_role('a1111111-1111-1111-1111-111111111111', 'games.edit')->>'ok') = 'true');
select pg_temp.check('and the site still has an administrator',
  exists (select 1 from public.role_grants
          where role = 'games.admin'
            and user_id = 'a2222222-2222-2222-2222-222222222222'));

-- ---------------------------------------------------------------------------
-- Nobody hands out more than they hold
--
-- An editor who could grant games.admin would be an administrator with extra
-- steps, which makes the ladder decorative.
-- ---------------------------------------------------------------------------
set session "test.uid" = 'b1111111-1111-1111-1111-111111111111';
select pg_temp.check('an editor cannot grant anything at all',
  (public.set_person_role('c2222222-2222-2222-2222-222222222222', 'games.edit')->>'reason')
    = 'not allowed');
select pg_temp.check('nor list who holds what',
  (public.people_with_roles()->>'ok') = 'false');
select pg_temp.check('nor search the directory',
  (public.find_people('dave')->>'ok') = 'false');

set session "test.uid" = 'a1111111-1111-1111-1111-111111111111';
-- Ray is an editor now, by his own hand, two checks ago.
select pg_temp.check('a demoted administrator loses the power immediately',
  (public.people_with_roles()->>'ok') = 'false');

set session "test.uid" = 'a2222222-2222-2222-2222-222222222222';
select pg_temp.check('and the one who holds it now has it',
  (public.people_with_roles()->>'ok') = 'true');

set session "test.uid" = '';
select pg_temp.check('signed out is nobody',
  (public.people_with_roles()->>'ok') = 'false');
select pg_temp.check('and anon may call none of it',
  not has_function_privilege('anon', 'public.people_with_roles()', 'execute')
  and not has_function_privilege('anon', 'public.find_people(text)', 'execute')
  and not has_function_privilege('anon', 'public.set_person_role(uuid, text)', 'execute'));

\echo '--- people checks passed ---'
