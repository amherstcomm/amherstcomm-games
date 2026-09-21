-- Voting on a contest, and what it pays a tournament round.
--
-- What has to hold is the part a page cannot hold for itself: a ballot is
-- ranked and scored from the ordering rather than from stored numbers, you
-- cannot vote for your own or for the same entry twice, the running total is
-- not readable while voting is open, a secret ballot stays secret, an entry
-- belonging to somebody sitting out is not ranked at all, and a contest pays a
-- round exactly the way a trivia session does -- but only once it is decided.
\set ON_ERROR_STOP on

insert into auth.users (id, email) values
  ('b1111111-1111-1111-1111-111111111111', 'vote.organiser@example.com'),
  ('b2222222-2222-2222-2222-222222222222', 'vera.voter@example.com'),
  ('b3333333-3333-3333-3333-333333333333', 'carl.carver@example.com'),
  ('b4444444-4444-4444-4444-444444444444', 'dina.doubter@example.com')
on conflict do nothing;
insert into public.role_grants (user_id, role)
values ('b1111111-1111-1111-1111-111111111111', 'games.edit')
on conflict do nothing;

create or replace function pg_temp.check(label text, got boolean) returns void
language plpgsql as $$
begin
  raise notice '%  %', case when got is true then 'PASS' else 'FAIL' end, label;
  if got is not true then raise exception 'failed: %', label; end if;
end $$;

create or replace function pg_temp.d(n int) returns date
language sql as $$ select public.puzzle_day() + n $$;

-- Where an entry came, by title, out of the organiser's view of the results.
create or replace function pg_temp.placed(c uuid, ttl text) returns int
language sql as $$
  select (x->>'place')::int
  from jsonb_array_elements(public.contest_results(c)->'table') x
  where x->>'title' = ttl
$$;

create or replace function pg_temp.scored(c uuid, ttl text) returns numeric
language sql as $$
  select (x->>'points')::numeric
  from jsonb_array_elements(public.contest_results(c)->'table') x
  where x->>'title' = ttl
$$;

set session "test.uid" = 'b1111111-1111-1111-1111-111111111111';

-- A contest whose entries closed yesterday and whose voting is on today.
create temp table vc as
  select (public.save_contest(null, 'Carving', null, pg_temp.d(-5), pg_temp.d(-1),
                              pg_temp.d(0), pg_temp.d(3), 'admins', true, false, 3,
                              'A day off')->>'id')::uuid id;
select pg_temp.check('the contest is in its voting window',
  (select public.contest_phase(c) from public.contests c where c.id = (select id from vc)) = 'voting');

-- Three entries, put in by the organiser after the window because the window
-- is shut -- which contests.sql already proves an organiser may do.
create temp table ve as select
  (public.save_contest_entry((select id from vc), null, 'Alpha', null, null,
                             'b2222222-2222-2222-2222-222222222222')->>'id')::uuid a;
alter table ve add column b uuid;
alter table ve add column c uuid;
update ve set b = (public.save_contest_entry((select id from vc), null, 'Beta', null, null,
                                             'b3333333-3333-3333-3333-333333333333')->>'id')::uuid;
update ve set c = (public.save_contest_entry((select id from vc), null, 'Gamma', null, null,
                                             'b4444444-4444-4444-4444-444444444444')->>'id')::uuid;
select pg_temp.check('three entries are in',
  (select count(*) from public.contest_entries where contest_id = (select id from vc)) = 3);

-- ---------------------------------------------------------------------------
-- Casting a ballot
-- ---------------------------------------------------------------------------
set session "test.uid" = 'b2222222-2222-2222-2222-222222222222';
select pg_temp.check('you cannot vote for your own',
  (public.cast_contest_votes((select id from vc),
     array[(select a from ve), (select b from ve)])->>'reason') = 'you cannot vote for your own');
select pg_temp.check('nor rank the same entry twice',
  (public.cast_contest_votes((select id from vc),
     array[(select b from ve), (select b from ve)])->>'reason')
    = 'the same entry cannot be two of your picks');
select pg_temp.check('nor cast more picks than the contest ranks',
  (public.cast_contest_votes((select id from vc),
     array[(select a from ve), (select b from ve), (select c from ve),
           (select b from ve)])->>'reason') = 'this one ranks 3, and that is 4');

create temp table cast1 as
  select public.cast_contest_votes((select id from vc),
           array[(select b from ve), (select c from ve)]) j;
select pg_temp.check('a ballot of two, on a contest that ranks three, is fine',
  (select j->>'ok' from cast1) = 'true' and (select j->>'counted' from cast1) = '2');
select pg_temp.check('and it is stored as an ordering, not as points',
  (select place from public.contest_votes
   where contest_id = (select id from vc) and voter = 'b2222222-2222-2222-2222-222222222222'
     and entry_id = (select b from ve)) = 1);
select pg_temp.check('the voter can read their own ballot back, best first',
  public.my_contest_votes((select id from vc))
    = jsonb_build_array((select b from ve), (select c from ve)));

-- Changing your mind replaces the ballot rather than adding to it.
select public.cast_contest_votes((select id from vc),
  array[(select c from ve), (select b from ve)]);
select pg_temp.check('voting again replaces the ballot',
  (select count(*) from public.contest_votes
   where contest_id = (select id from vc) and voter = 'b2222222-2222-2222-2222-222222222222') = 2
  and (select place from public.contest_votes
       where contest_id = (select id from vc)
         and voter = 'b2222222-2222-2222-2222-222222222222'
         and entry_id = (select c from ve)) = 1);

-- Two more voters, so the tally has something to rank. Each owns one of the
-- three, so none of them may head their ballot with it: Dina owns Gamma and
-- ranks the other two.
--
-- Asserted rather than fired and forgotten. A ballot refused here would be
-- silently missing from every number below, which is exactly how the first
-- draft of this file came to expect a total nobody had voted for.
set session "test.uid" = 'b3333333-3333-3333-3333-333333333333';
select pg_temp.check('Carl votes',
  (public.cast_contest_votes((select id from vc),
     array[(select c from ve), (select a from ve)])->>'ok') = 'true');
set session "test.uid" = 'b4444444-4444-4444-4444-444444444444';
select pg_temp.check('Dina votes',
  (public.cast_contest_votes((select id from vc),
     array[(select b from ve), (select a from ve)])->>'ok') = 'true');

-- ---------------------------------------------------------------------------
-- Nothing is readable while voting is open
-- ---------------------------------------------------------------------------
select pg_temp.check('a player cannot read the running total',
  (public.contest_results((select id from vc))->>'reason') = 'the results are in when voting closes');
select pg_temp.check('and the contest view carries no vote counts at all',
  not (public.contest_view((select id from vc))::text like '%points%'));

set session "test.uid" = 'b1111111-1111-1111-1111-111111111111';
select pg_temp.check('an organiser may look early, and is told it is not final',
  (public.contest_results((select id from vc))->>'ok') = 'true'
  and (public.contest_results((select id from vc))->>'final') = 'false');

-- Vera ranked Gamma then Beta, Carl ranked Gamma then Alpha, and Dina -- who
-- owns Gamma and may not vote for it -- ranked Beta then Alpha. At 3/2/1 that
-- is Gamma 6 from two firsts, Beta 5 from a first and a second, Alpha 4 from
-- two seconds.
select pg_temp.check('points come from the ordering: 3, 2 and 1',
  pg_temp.scored((select id from vc), 'Gamma') = 6
  and pg_temp.scored((select id from vc), 'Beta') = 5
  and pg_temp.scored((select id from vc), 'Alpha') = 4);
select pg_temp.check('and the places follow the points',
  pg_temp.placed((select id from vc), 'Gamma') = 1
  and pg_temp.placed((select id from vc), 'Beta') = 2
  and pg_temp.placed((select id from vc), 'Alpha') = 3);
select pg_temp.check('the count of voters is what it says',
  (public.contest_results((select id from vc))->>'voters')::int = 3);

-- A secret ballot says nothing about who voted for what, even once it is over.
select pg_temp.check('a secret ballot carries no ballots',
  (public.contest_results((select id from vc))->'ballots') = 'null'::jsonb);

-- ---------------------------------------------------------------------------
-- Sitting out
-- ---------------------------------------------------------------------------
-- Carl's Beta leaves the ranking entirely: sitting out means sitting out, and
-- an entry that cannot win should not hold a place above one that can. His
-- vote still counts -- voting is not competing.
set session "test.uid" = 'b3333333-3333-3333-3333-333333333333';
select public.set_competing(false);
set session "test.uid" = 'b1111111-1111-1111-1111-111111111111';
select pg_temp.check('an entry by somebody sitting out is not ranked',
  pg_temp.placed((select id from vc), 'Beta') is null);
select pg_temp.check('and the entry below it moves up',
  pg_temp.placed((select id from vc), 'Alpha') = 2);
select pg_temp.check('while their vote still counts',
  pg_temp.scored((select id from vc), 'Gamma') = 6
  and (public.contest_results((select id from vc))->>'voters')::int = 3);
set session "test.uid" = 'b3333333-3333-3333-3333-333333333333';
select public.set_competing(true);

-- ---------------------------------------------------------------------------
-- An empty ballot takes yours back
-- ---------------------------------------------------------------------------
set session "test.uid" = 'b4444444-4444-4444-4444-444444444444';
create temp table withdrew as
  select public.cast_contest_votes((select id from vc), '{}'::uuid[]) j;
select pg_temp.check('an empty ballot withdraws it',
  (select j->>'ok' from withdrew) = 'true'
  and (select count(*) from public.contest_votes
       where contest_id = (select id from vc)
         and voter = 'b4444444-4444-4444-4444-444444444444') = 0);
-- Put it back, so the numbers below are the ones above.
select pg_temp.check('and it goes back',
  (public.cast_contest_votes((select id from vc),
     array[(select b from ve), (select a from ve)])->>'ok') = 'true');

-- ---------------------------------------------------------------------------
-- What it pays a round
-- ---------------------------------------------------------------------------
set session "test.uid" = 'b1111111-1111-1111-1111-111111111111';
select pg_temp.check('a contest pays nothing while its voting is open',
  (select count(*) from public.contest_ranking((select id from vc))) = 0);

create temp table vt as
  select (public.save_tournament(null, 'Contest Cup', 'hard', pg_temp.d(-20), pg_temp.d(-6))
          ->>'id')::uuid id;
create temp table vr as
  select (public.save_round(null, (select id from vt), pg_temp.d(-18), pg_temp.d(-16),
                            '{}'::text[], '[]'::jsonb, null, '{}'::jsonb,
                            jsonb_build_array(jsonb_build_object(
                              'id', (select id from vc), 'weight', 2)))->>'id')::uuid id;
select pg_temp.check('a round of nothing but a contest is allowed',
  (select id from vr) is not null
  and (select count(*) from public.tournament_round_contests
       where round_id = (select id from vr)) = 1);
select pg_temp.check('and the admin sheet says so, with what it is worth',
  (select (r->'contests'->0->>'weight')
   from jsonb_array_elements(public.tournaments_sheet()->'tournaments') x,
        jsonb_array_elements(x->'rounds') r
   where (r->>'id')::uuid = (select id from vr)) = '2');

-- A second round cannot take the same contest: one pumpkin, one round.
select pg_temp.check('a contest cannot count in two rounds',
  (public.save_round(null, (select id from vt), pg_temp.d(-14), pg_temp.d(-12),
                     '{}'::text[], '[]'::jsonb, null, '{}'::jsonb,
                     jsonb_build_array(jsonb_build_object('id', (select id from vc))))->>'reason')
    = 'the contest "Carving" already counts in another round');
select pg_temp.check('and a weight past the cap is refused',
  (public.save_round(null, (select id from vt), pg_temp.d(-14), pg_temp.d(-12),
                     '{}'::text[], '[]'::jsonb, null, '{}'::jsonb,
                     jsonb_build_array(jsonb_build_object('id', (select id from vc), 'weight', 50)))
   ->>'reason') = 'a weight has to be more than zero and at most ten');
select pg_temp.check('and a contest this site does not have',
  (public.save_round(null, (select id from vt), pg_temp.d(-14), pg_temp.d(-12),
                     '{}'::text[], '[]'::jsonb, null, '{}'::jsonb,
                     jsonb_build_array(jsonb_build_object(
                       'id', '00000000-0000-0000-0000-0000000000ff')))->>'reason')
    = 'that is not a contest this site has');

-- The standings are silent about it until the voting closes.
select pg_temp.check('the tournament shows no points from an undecided contest',
  (select count(*) from jsonb_array_elements(
     public.tournament_standings((select id from vt))->'table')) = 0);

-- Close the voting and it pays: ten down to one for the placing, times two.
select public.save_contest((select id from vc), 'Carving', null,
                           pg_temp.d(-5), pg_temp.d(-1), pg_temp.d(-1), pg_temp.d(-1),
                           'admins', true, false, 3, 'A day off');
select pg_temp.check('once voting closes the contest is decided',
  (select public.contest_phase(c) from public.contests c where c.id = (select id from vc)) = 'over');

create temp table vstand as select public.tournament_standings((select id from vt)) j;
select pg_temp.check('and it pays the placing times what the round said it was worth',
  (select (x->>'points')::numeric from vstand, jsonb_array_elements(j->'table') x
   where x->>'name' = 'Dina Doubter') = 20
  and (select (x->>'points')::numeric from vstand, jsonb_array_elements(j->'table') x
   where x->>'name' = 'Carl Carver') = 18
  and (select (x->>'points')::numeric from vstand, jsonb_array_elements(j->'table') x
   where x->>'name' = 'Vera Voter') = 16);
select pg_temp.check('and the winner is credited with the win',
  (select (x->>'wins')::int from vstand, jsonb_array_elements(j->'table') x
   where x->>'name' = 'Dina Doubter') = 1);

-- Now that it is over, everybody may read the result.
set session "test.uid" = 'b2222222-2222-2222-2222-222222222222';
select pg_temp.check('a player may read the result once it is over',
  (public.contest_results((select id from vc))->>'ok') = 'true'
  and (public.contest_results((select id from vc))->>'final') = 'true');
select pg_temp.check('and voting is refused after the window',
  (public.cast_contest_votes((select id from vc),
     array[(select c from ve)])->>'reason') = 'voting has closed for this one');

-- ---------------------------------------------------------------------------
-- An open ballot
-- ---------------------------------------------------------------------------
set session "test.uid" = 'b1111111-1111-1111-1111-111111111111';
select public.save_contest((select id from vc), 'Carving', null,
                           pg_temp.d(-5), pg_temp.d(-1), pg_temp.d(-1), pg_temp.d(-1),
                           'admins', true, true, 3, 'A day off');
select pg_temp.check('an open ballot says who voted for what',
  jsonb_array_length(public.contest_results((select id from vc))->'ballots') = 3
  and (public.contest_results((select id from vc))::text like '%Vera Voter%'));

-- Leave nothing behind: these dates overlap what other files set up.
delete from public.tournaments where id = (select id from vt);
delete from public.contests where id = (select id from vc);

\echo '--- contest voting checks passed ---'
