-- An open session: the same questions, nobody at the front.
--
-- The thing worth pinning is that the timing still means something. A live
-- session has one clock — items.opened_at, the moment the room was shown the
-- question — and an open session has no such moment, so each person's clock
-- starts when the question is handed to *them*. Get that wrong and the two
-- modes land on the same scoreboard measuring different things.
\set ON_ERROR_STOP on

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'editor@example.com'),
  ('33333333-3333-3333-3333-333333333333', 'ada@example.com'),
  ('44444444-4444-4444-4444-444444444444', 'grace@example.com')
on conflict do nothing;
insert into public.role_grants (user_id, role)
values ('11111111-1111-1111-1111-111111111111', 'games.edit')
on conflict do nothing;
insert into public.profiles (id, display_name) values
  ('33333333-3333-3333-3333-333333333333', 'Ada'),
  ('44444444-4444-4444-4444-444444444444', 'Grace')
on conflict (id) do update set display_name = excluded.display_name;

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
set session "test.uid" = '11111111-1111-1111-1111-111111111111';

insert into t select 'sess', public.create_session('Play it whenever', 'strict', 'open');
select pg_temp.check('an open session can be made', (select v->>'ok' from t where k='sess') = 'true');
select pg_temp.check('and it says it is open',
  (select mode from public.sessions
   where id = ((select v->>'id' from t where k='sess'))::uuid) = 'open');
-- Made first, then read. create_session is volatile, and calling it inside a
-- WHERE gets it evaluated per row — the same trap that made an earlier test in
-- this project report a problem it had invented.
insert into t select 'plain', public.create_session('Ordinary');
select pg_temp.check('a live one is still the default',
  (select mode from public.sessions
   where id = ((select v->>'id' from t where k='plain'))::uuid) = 'live');

insert into t select 'q1', public.save_item(
  ((select v->>'id' from t where k='sess'))::uuid, null, 'choice', 'One',
  '{"options":["a","b"]}'::jsonb, '{"correct":["a"]}'::jsonb);
insert into t select 'q2', public.save_item(
  ((select v->>'id' from t where k='sess'))::uuid, null, 'choice', 'Two',
  '{"options":["a","b"]}'::jsonb, '{"correct":["b"]}'::jsonb);

-- ---------------------------------------------------------------------------
-- Nothing before it starts
-- ---------------------------------------------------------------------------
set session "test.uid" = '33333333-3333-3333-3333-333333333333';
select pg_temp.check('a draft is not-live for a player',
  (public.current_item(((select v->>'id' from t where k='sess'))::uuid)->>'state') = 'not-live');

set session "test.uid" = '11111111-1111-1111-1111-111111111111';
select public.advance_session(((select v->>'id' from t where k='sess'))::uuid, 'start');
select pg_temp.check('starting an open session opens every question at once',
  (select count(*) from public.items
   where session_id = ((select v->>'id' from t where k='sess'))::uuid
     and state = 'open') = 2);
select pg_temp.check('there is nothing to show, lock or reveal',
  (public.advance_session(((select v->>'id' from t where k='sess'))::uuid, 'show')->>'reason')
    like '%without a presenter%'
  and (public.advance_session(((select v->>'id' from t where k='sess'))::uuid, 'reveal')->>'reason')
    like '%without a presenter%');

-- ---------------------------------------------------------------------------
-- Ada is served one at a time, and her clock is hers
-- ---------------------------------------------------------------------------
set session "test.uid" = '33333333-3333-3333-3333-333333333333';
insert into t select 'a1', public.current_item(((select v->>'id' from t where k='sess'))::uuid);
select pg_temp.check('she is given the first question',
  (select v->>'id' from t where k='a1') = (select v->>'id' from t where k='q1'));
select pg_temp.check('and told where she is in it',
  (select (v->>'position')::int from t where k='a1') = 1
  and (select (v->>'total')::int from t where k='a1') = 2
  and (select (v->>'done')::int from t where k='a1') = 0);
select pg_temp.check('being given it is what started her clock',
  exists (select 1 from public.item_served
          where item_id = ((select v->>'id' from t where k='q1'))::uuid
            and user_id = '33333333-3333-3333-3333-333333333333'));
select pg_temp.check('and asking again does not restart it',
  (select served_at from public.item_served
   where item_id = ((select v->>'id' from t where k='q1'))::uuid
     and user_id = '33333333-3333-3333-3333-333333333333')
  = (select served_at from public.item_served
     where item_id = ((select v->>'id' from t where k='q1'))::uuid
       and user_id = '33333333-3333-3333-3333-333333333333'
       and public.current_item(((select v->>'id' from t where k='sess'))::uuid) is not null));
select pg_temp.check('the answer does not come with the question',
  (select v->'answer' from t where k='a1') = 'null'::jsonb);
select pg_temp.check('and she is not handed the second one yet',
  not exists (select 1 from public.item_served
              where item_id = ((select v->>'id' from t where k='q2'))::uuid
                and user_id = '33333333-3333-3333-3333-333333333333'));
select pg_temp.check('nor can she answer it out of turn',
  (public.answer_item(((select v->>'id' from t where k='q2'))::uuid, '"b"'::jsonb)->>'reason')
    like '%in front of you%');

insert into t select 'ans1', public.answer_item(
  ((select v->>'id' from t where k='q1'))::uuid, '"a"'::jsonb);
select pg_temp.check('answering works', (select v->>'ok' from t where k='ans1') = 'true');
-- Nobody is going to reveal it, so she is told there and then. In a live
-- session she is not: the room is told together.
select pg_temp.check('and she is told the answer, because nobody else will',
  (select v->'answer'->'correct'->>0 from t where k='ans1') = 'a');
select pg_temp.check('answering the same one twice is refused',
  (public.answer_item(((select v->>'id' from t where k='q1'))::uuid, '"b"'::jsonb)->>'reason')
    like '%answered that one%');

insert into t select 'a2', public.current_item(((select v->>'id' from t where k='sess'))::uuid);
select pg_temp.check('she moves on to the second',
  (select v->>'id' from t where k='a2') = (select v->>'id' from t where k='q2')
  and (select (v->>'done')::int from t where k='a2') = 1);

select public.answer_item(((select v->>'id' from t where k='q2'))::uuid, '"b"'::jsonb);
insert into t select 'a3', public.current_item(((select v->>'id' from t where k='sess'))::uuid);
select pg_temp.check('and when there are none left, it says so',
  (select v->>'state' from t where k='a3') = 'done');

-- ---------------------------------------------------------------------------
-- Grace starts later, and is not penalised for it
--
-- The whole point of the mode. In a live session opened_at is the same for
-- everybody; here Grace's first question is handed to her an hour after Ada's,
-- and her elapsed time has to be measured from her own start.
-- ---------------------------------------------------------------------------
update public.item_served set served_at = '2026-10-01 09:00:00+00'
where user_id = '33333333-3333-3333-3333-333333333333';
update public.responses set submitted_at = '2026-10-01 09:00:04+00'
where user_id = '33333333-3333-3333-3333-333333333333';

set session "test.uid" = '44444444-4444-4444-4444-444444444444';
select public.current_item(((select v->>'id' from t where k='sess'))::uuid);
select public.answer_item(((select v->>'id' from t where k='q1'))::uuid, '"a"'::jsonb);
update public.item_served set served_at = '2026-10-01 17:00:00+00'
where user_id = '44444444-4444-4444-4444-444444444444';
update public.responses set submitted_at = '2026-10-01 17:00:02+00'
where user_id = '44444444-4444-4444-4444-444444444444';

select pg_temp.check('each person is timed from their own start, not the room''s',
  (select seconds from public.item_points(((select v->>'id' from t where k='q1'))::uuid)
   where user_id = '33333333-3333-3333-3333-333333333333') = 4
  and (select seconds from public.item_points(((select v->>'id' from t where k='q1'))::uuid)
       where user_id = '44444444-4444-4444-4444-444444444444') = 2);
select pg_temp.check('so playing eight hours later is not eight hours slower',
  (select seconds from public.item_points(((select v->>'id' from t where k='q1'))::uuid)
   where user_id = '44444444-4444-4444-4444-444444444444') < 60);

-- ---------------------------------------------------------------------------
-- It scores without ever being revealed
-- ---------------------------------------------------------------------------
set session "test.uid" = '11111111-1111-1111-1111-111111111111';
insert into t select 'board', public.session_leaderboard(((select v->>'id' from t where k='sess'))::uuid);
select pg_temp.check('an open session scores, though nothing is ever revealed',
  (select (v->>'scored')::int from t where k='board') = 2);
-- Ada leads on points — she answered both, Grace one — and the tiebreak only
-- ever separates people who are level. Grace being quicker on the one she did
-- shows up in her time, not in her place.
select pg_temp.check('Ada leads, having answered both',
  (select v->'standings'->0->>'name' from t where k='board') = 'Ada'
  and (select v->'standings'->0->>'points' from t where k='board') = '2');
select pg_temp.check('Grace is second on one',
  (select v->'standings'->1->>'name' from t where k='board') = 'Grace'
  and (select v->'standings'->1->>'points' from t where k='board') = '1');
select pg_temp.check('and her two seconds are recorded against Ada''s four',
  (select (v->'standings'->1->>'seconds')::numeric from t where k='board') = 2);

set session "test.uid" = '44444444-4444-4444-4444-444444444444';
select pg_temp.check('and a player is told her own score as she goes',
  (public.my_standing(((select v->>'id' from t where k='sess'))::uuid)->>'points')::numeric = 1);

-- ---------------------------------------------------------------------------
-- Closing it stops it
-- ---------------------------------------------------------------------------
set session "test.uid" = '11111111-1111-1111-1111-111111111111';
select public.advance_session(((select v->>'id' from t where k='sess'))::uuid, 'close');
set session "test.uid" = '44444444-4444-4444-4444-444444444444';
select pg_temp.check('a closed open session hands out no more questions',
  (public.current_item(((select v->>'id' from t where k='sess'))::uuid)->>'state') = 'not-live');
select pg_temp.check('and takes no more answers',
  (public.answer_item(((select v->>'id' from t where k='q2'))::uuid, '"b"'::jsonb)->>'ok') = 'false');

-- ---------------------------------------------------------------------------
-- A live session is unchanged by any of this
-- ---------------------------------------------------------------------------
set session "test.uid" = '11111111-1111-1111-1111-111111111111';
insert into t select 'live', public.create_session('In the room');
insert into t select 'lq', public.save_item(
  ((select v->>'id' from t where k='live'))::uuid, null, 'choice', 'One',
  '{"options":["a","b"]}'::jsonb, '{"correct":["a"]}'::jsonb);
select public.advance_session(((select v->>'id' from t where k='live'))::uuid, 'start');
select pg_temp.check('a live session does not open everything on start',
  (select count(*) from public.items
   where session_id = ((select v->>'id' from t where k='live'))::uuid and state = 'open') = 0);
select public.advance_session(((select v->>'id' from t where k='live'))::uuid, 'show');

set session "test.uid" = '33333333-3333-3333-3333-333333333333';
insert into t select 'lans', public.answer_item(
  ((select v->>'id' from t where k='lq'))::uuid, '"a"'::jsonb);
select pg_temp.check('a live answer still works', (select v->>'ok' from t where k='lans') = 'true');
select pg_temp.check('and is NOT told the answer — the room is told together',
  (select v->'answer' from t where k='lans') = 'null'::jsonb);
select pg_temp.check('a live session is not scored before the reveal',
  (public.my_standing(((select v->>'id' from t where k='live'))::uuid)->>'scored')::int = 0);

\echo '--- open session checks passed ---'
