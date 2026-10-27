-- One contest entry, several people.
--
-- What has to hold: a player can put teammates on their entry, anybody on it
-- may change it and none of them may vote for it, the name on it is all of
-- them, one entry each unless the contest says otherwise -- for a team as for
-- one person -- an invited teammate's place becomes theirs when they sign in,
-- and a placing pays a tournament split evenly between the people on it.
\set ON_ERROR_STOP on

insert into auth.users (id, email) values
  ('4c000000-0000-0000-0000-000000000001', 'team.organiser@example.com'),
  ('4c000000-0000-0000-0000-000000000002', 'ann.team@example.com'),
  ('4c000000-0000-0000-0000-000000000003', 'ben.team@example.com'),
  ('4c000000-0000-0000-0000-000000000004', 'cy.solo@example.com'),
  ('4c000000-0000-0000-0000-000000000005', 'dee.voter@example.com')
on conflict do nothing;
insert into public.role_grants (user_id, role)
values ('4c000000-0000-0000-0000-000000000001', 'games.edit')
on conflict do nothing;

create or replace function pg_temp.check(label text, got boolean) returns void
language plpgsql as $$
begin
  raise notice '%  %', case when got is true then 'PASS' else 'FAIL' end, label;
  if got is not true then raise exception 'failed: %', label; end if;
end $$;

create or replace function pg_temp.d(n int) returns date
language sql as $$ select public.puzzle_day() + n $$;

create or replace function pg_temp.u(n int) returns uuid
language sql as $$ select ('4c000000-0000-0000-0000-00000000000' || n)::uuid $$;

set session "test.uid" = '4c000000-0000-0000-0000-000000000001';
create temp table tc as
  select (public.save_contest(null, 'Team carving', null, pg_temp.d(-1), pg_temp.d(2),
                              pg_temp.d(3), pg_temp.d(6))->>'id')::uuid id;

-- ---------------------------------------------------------------------------
-- A player and a teammate
-- ---------------------------------------------------------------------------
set session "test.uid" = '4c000000-0000-0000-0000-000000000002';
create temp table te as
  select public.save_contest_entry((select id from tc), null, 'Twin gourds', null, null, null, null, null,
           jsonb_build_array(jsonb_build_object('user', pg_temp.u(3)),
                             jsonb_build_object('email', 'Eve.New@example.com', 'name', 'Eve New'))) j;
create temp table te_id as select (j->>'id')::uuid id from te;
select pg_temp.check('a player enters with a teammate and somebody not signed in yet',
  (select j->>'ok' from te) = 'true'
  and (select count(*) from public.contest_entry_partners where entry_id = (select id from te_id)) = 2);
select pg_temp.check('and the entry is named for all of them',
  (select x->>'entrant' from jsonb_array_elements(public.contest_view((select id from tc))->'entries') x
   where x->>'title' = 'Twin gourds') = 'Ann Team & Ben Team & Eve New');

set session "test.uid" = '4c000000-0000-0000-0000-000000000003';
select pg_temp.check('the teammate sees it as theirs, with who else is on it',
  (select (x->>'mine')::boolean and jsonb_array_length(x->'partners') = 2
   from jsonb_array_elements(public.contest_view((select id from tc))->'entries') x
   where x->>'title' = 'Twin gourds'));
create temp table renamed as
  select public.save_contest_entry((select id from tc), (select id from te_id), 'Twin pumpkins', null) j;
select pg_temp.check('and may change it, without it becoming filed under them',
  (select j->>'ok' from renamed) = 'true'
  and (select entrant = pg_temp.u(2) and title = 'Twin pumpkins'
       from public.contest_entries where id = (select id from te_id))
  and (select count(*) from public.contest_entry_partners where entry_id = (select id from te_id)) = 2);
select pg_temp.check('but cannot start an entry of their own: one each',
  (public.save_contest_entry((select id from tc), null, 'Solo', null)->>'reason')
    = 'you already have an entry in this one');

set session "test.uid" = '4c000000-0000-0000-0000-000000000004';
select pg_temp.check('nor be put on somebody else''s',
  (public.save_contest_entry((select id from tc), null, 'Cy''s', null, null, null, null, null,
     jsonb_build_array(jsonb_build_object('user', pg_temp.u(3))))->>'reason')
    = 'Ben Team is already on another entry in this one');
select pg_temp.check('nor an invited teammate twice',
  (public.save_contest_entry((select id from tc), null, 'Cy''s', null, null, null, null, null,
     jsonb_build_array(jsonb_build_object('email', 'eve.new@example.com')))->>'reason')
    = 'Eve New is already on another entry in this one');
create temp table cy as
  select (public.save_contest_entry((select id from tc), null, 'Lantern', null)->>'id')::uuid id;

-- With the setting on, a person may be on more than one.
set session "test.uid" = '4c000000-0000-0000-0000-000000000001';
select public.save_contest((select id from tc), 'Team carving', null, pg_temp.d(-1), pg_temp.d(2),
                           pg_temp.d(3), pg_temp.d(6), 'players', true, false, 3, null, null, null, true);
set session "test.uid" = '4c000000-0000-0000-0000-000000000004';
create temp table cy2 as
  select public.save_contest_entry((select id from tc), null, 'Another', null, null, null, null, null,
           jsonb_build_array(jsonb_build_object('user', pg_temp.u(3)))) j;
select pg_temp.check('a contest that allows it lets a person be on more than one entry',
  (select j->>'ok' from cy2) = 'true');
delete from public.contest_entries where id = (select (j->>'id')::uuid from cy2);

-- ---------------------------------------------------------------------------
-- Signing in, voting, paying
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values (pg_temp.u(6), 'eve.new@example.com');
select pg_temp.check('the invited teammate''s place is theirs once they sign in',
  (select count(*) from public.contest_entry_partners
   where entry_id = (select id from te_id) and user_id = pg_temp.u(6) and invited_email is null) = 1);

-- Into voting.
set session "test.uid" = '4c000000-0000-0000-0000-000000000001';
select public.save_contest((select id from tc), 'Team carving', null, pg_temp.d(-5), pg_temp.d(-2),
                           pg_temp.d(-1), pg_temp.d(2), 'players', true, false, 3, null, null, null, false);

set session "test.uid" = '4c000000-0000-0000-0000-000000000003';
select pg_temp.check('nobody on an entry may vote for it',
  (public.cast_contest_votes((select id from tc), array[(select id from te_id)])->>'reason')
    = 'you cannot vote for your own');

set session "test.uid" = '4c000000-0000-0000-0000-000000000005';
select public.cast_contest_votes((select id from tc), array[(select id from te_id), (select id from cy)]);

-- Close it, put it in a tournament round, and see what it pays.
set session "test.uid" = '4c000000-0000-0000-0000-000000000001';
select public.save_contest((select id from tc), 'Team carving', null, pg_temp.d(-6), pg_temp.d(-3),
                           pg_temp.d(-2), pg_temp.d(-1), 'players', true, false, 3, null, null, null, false);
create temp table tt as
  select (public.save_tournament(null, 'Team Cup', 'hard', pg_temp.d(-20), pg_temp.d(-1))->>'id')::uuid id;
select public.save_round(null, (select id from tt), pg_temp.d(-18), pg_temp.d(-16),
                         '{}'::text[], '[]'::jsonb, null, '{}'::jsonb,
                         jsonb_build_array(jsonb_build_object('id', (select id from tc), 'weight', 1)));
create temp table ts as select public.tournament_standings((select id from tt)) j;
select pg_temp.check('first place pays ten, split three ways between the team',
  (select round((x->>'points')::numeric, 2) from ts, jsonb_array_elements(j->'table') x
   where x->>'name' = 'Ann Team') = 3.33
  and (select count(*) from ts, jsonb_array_elements(j->'table') x
       where x->>'name' in ('Ann Team', 'Ben Team')) = 2);
select pg_temp.check('while a person alone in second keeps all nine',
  (select (x->>'points')::numeric from ts, jsonb_array_elements(j->'table') x
   where x->>'name' = 'Cy Solo') = 9);

-- Leave nothing behind.
delete from public.tournaments where id = (select id from tt);
delete from public.contests where id = (select id from tc);
delete from auth.users where id::text like '4c000000-%';

\echo '--- contest team checks passed ---'
