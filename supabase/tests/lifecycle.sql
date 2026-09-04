-- One session, run end to end, from both sides of the room.
--
-- The authoring tests cover building a session; this covers the part that
-- happens in front of people — start, show, answer, lock, reveal — and in
-- particular whether an ordinary signed-in player can actually answer. That was
-- reported as not working, and every function involved reads correctly, which
-- is precisely when the thing has to be run rather than reviewed.
--
-- Roles come from `test.uid` as in authoring.sql; see the note there for why
-- the file runs as the owner.
\set ON_ERROR_STOP on

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'editor@example.com'),
  ('33333333-3333-3333-3333-333333333333', 'player1@example.com'),
  ('44444444-4444-4444-4444-444444444444', 'player2@example.com')
on conflict do nothing;
insert into public.role_grants (user_id, role)
values ('11111111-1111-1111-1111-111111111111', 'games.edit')
on conflict do nothing;

create or replace function pg_temp.check(label text, got boolean) returns void
language plpgsql as $$
begin
  -- `is not true`, not `not got`: a check whose expression comes back NULL
  -- printed FAIL and then carried on, because NOT NULL is NULL and the IF was
  -- never taken. A check that can report a failure without stopping is a check
  -- that can be ignored, which is worse than not having it.
  raise notice '%  %', case when got is true then 'PASS' else 'FAIL' end, label;
  if got is not true then raise exception 'failed: %', label; end if;
end $$;

create temp table t (k text primary key, v jsonb);

-- ---------------------------------------------------------------------------
-- The editor builds it
-- ---------------------------------------------------------------------------
set session "test.uid" = '11111111-1111-1111-1111-111111111111';

insert into t select 'sess', public.create_session('A run of the whole thing');
insert into t select 'q1', public.save_item(
  ((select v->>'id' from t where k='sess'))::uuid, null, 'choice',
  'Which year did we become employee-owned?',
  '{"options":["2019","2021","2023"]}'::jsonb, '{"correct":["2021"]}'::jsonb);

-- ---------------------------------------------------------------------------
-- A player, before it starts
-- ---------------------------------------------------------------------------
set session "test.uid" = '33333333-3333-3333-3333-333333333333';

select pg_temp.check('an ordinary player may play', public.can('games.play'));
select pg_temp.check('before it starts, the room sees not-live',
  (public.current_item(((select v->>'id' from t where k='sess'))::uuid)->>'state') = 'not-live');
select pg_temp.check('and cannot answer into it',
  (public.answer_item(((select v->>'id' from t where k='q1'))::uuid, '"2021"'::jsonb)->>'ok') = 'false');

-- ---------------------------------------------------------------------------
-- The presenter starts and shows
-- ---------------------------------------------------------------------------
set session "test.uid" = '11111111-1111-1111-1111-111111111111';
insert into t select 'start', public.advance_session(((select v->>'id' from t where k='sess'))::uuid, 'start');
select pg_temp.check('start works', (select v->>'ok' from t where k='start') = 'true');

-- Started but nothing shown yet: the room waits.
set session "test.uid" = '33333333-3333-3333-3333-333333333333';
select pg_temp.check('live with nothing shown reads as waiting',
  (public.current_item(((select v->>'id' from t where k='sess'))::uuid)->>'state') = 'waiting');

set session "test.uid" = '11111111-1111-1111-1111-111111111111';
insert into t select 'show', public.advance_session(((select v->>'id' from t where k='sess'))::uuid, 'show');
select pg_temp.check('show works', (select v->>'ok' from t where k='show') = 'true');
select pg_temp.check('show opened the first question',
  (select v->>'item' from t where k='show') = (select v->>'id' from t where k='q1'));

-- ---------------------------------------------------------------------------
-- The room answers. This is the reported failure.
-- ---------------------------------------------------------------------------
set session "test.uid" = '33333333-3333-3333-3333-333333333333';
insert into t select 'see', public.current_item(((select v->>'id' from t where k='sess'))::uuid);
select pg_temp.check('the room can see the open question',
  (select v->>'state' from t where k='see') = 'open');
select pg_temp.check('and it carries the options',
  (select v->'payload'->'options'->>0 from t where k='see') = '2019');
select pg_temp.check('and NOT the answer',
  (select v->'answer' from t where k='see') is null
  or (select v->>'answer' from t where k='see') is null);

insert into t select 'ans1', public.answer_item(
  ((select v->>'id' from t where k='q1'))::uuid, '"2021"'::jsonb);
select pg_temp.check('a player can answer',
  (select v->>'ok' from t where k='ans1') = 'true');
select pg_temp.check('and the answer was stored',
  exists (select 1 from public.responses
          where item_id = ((select v->>'id' from t where k='q1'))::uuid
            and user_id = '33333333-3333-3333-3333-333333333333'));
select pg_temp.check('a reload shows them their own answer',
  (public.current_item(((select v->>'id' from t where k='sess'))::uuid)->>'mine') = '2021');

-- changing your mind before the lock
insert into t select 'ans1b', public.answer_item(
  ((select v->>'id' from t where k='q1'))::uuid, '"2019"'::jsonb);
select pg_temp.check('answering again replaces rather than erroring',
  (select v->>'ok' from t where k='ans1b') = 'true');
select pg_temp.check('and there is still exactly one response from them',
  (select count(*) from public.responses
   where item_id = ((select v->>'id' from t where k='q1'))::uuid
     and user_id = '33333333-3333-3333-3333-333333333333') = 1);

-- a second player
set session "test.uid" = '44444444-4444-4444-4444-444444444444';
select pg_temp.check('a second player can answer too',
  (public.answer_item(((select v->>'id' from t where k='q1'))::uuid, '"2021"'::jsonb)->>'ok') = 'true');

-- and nobody can see the tally while it is still open
select pg_temp.check('the tally is withheld while answers are open',
  (public.item_tally(((select v->>'id' from t where k='q1'))::uuid)->>'ok') = 'false');

-- ---------------------------------------------------------------------------
-- The presenter counts, locks, reveals
-- ---------------------------------------------------------------------------
set session "test.uid" = '11111111-1111-1111-1111-111111111111';
insert into t select 'view', public.presenter_view(((select v->>'id' from t where k='q1'))::uuid);
select pg_temp.check('the presenter sees the count',
  (select (v->>'answered')::int from t where k='view') = 2);
select pg_temp.check('and the answer, so they can run the reveal',
  (select v->'answer'->'correct'->>0 from t where k='view') = '2021');

insert into t select 'lock', public.advance_session(((select v->>'id' from t where k='sess'))::uuid, 'lock');
select pg_temp.check('lock works', (select v->>'ok' from t where k='lock') = 'true');

set session "test.uid" = '33333333-3333-3333-3333-333333333333';
select pg_temp.check('a late answer is refused once locked',
  (public.answer_item(((select v->>'id' from t where k='q1'))::uuid, '"2021"'::jsonb)->>'ok') = 'false');

set session "test.uid" = '11111111-1111-1111-1111-111111111111';
insert into t select 'rev', public.advance_session(((select v->>'id' from t where k='sess'))::uuid, 'reveal');
select pg_temp.check('reveal works', (select v->>'ok' from t where k='rev') = 'true');

set session "test.uid" = '33333333-3333-3333-3333-333333333333';
insert into t select 'seen', public.current_item(((select v->>'id' from t where k='sess'))::uuid);
select pg_temp.check('after the reveal the room is given the answer',
  (select v->'answer'->'correct'->>0 from t where k='seen') = '2021');
insert into t select 'tally', public.item_tally(((select v->>'id' from t where k='q1'))::uuid);
select pg_temp.check('and the tally opens', (select v->>'ok' from t where k='tally') = 'true');
select pg_temp.check('which counts both answers',
  (select (v->>'total')::int from t where k='tally') = 2);

-- ---------------------------------------------------------------------------
-- Nothing left, and closing
-- ---------------------------------------------------------------------------
set session "test.uid" = '11111111-1111-1111-1111-111111111111';
select pg_temp.check('showing past the last question says so',
  (public.advance_session(((select v->>'id' from t where k='sess'))::uuid, 'show')->>'reason')
    = 'nothing left to show');
select pg_temp.check('close works',
  (public.advance_session(((select v->>'id' from t where k='sess'))::uuid, 'close')->>'ok') = 'true');

set session "test.uid" = '33333333-3333-3333-3333-333333333333';
select pg_temp.check('a closed session is not-live again',
  (public.current_item(((select v->>'id' from t where k='sess'))::uuid)->>'state') = 'not-live');

\echo '--- lifecycle checks passed ---'
