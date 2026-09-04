-- The clock.
--
-- The point of these is that the window is enforced in the database. A timer
-- that only stops the button being drawn is one a second tab ignores, and the
-- tiebreak is speed — so what matters is not that the countdown renders, it is
-- that a late answer is refused whatever the client believes.
\set ON_ERROR_STOP on

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'editor@example.com'),
  ('33333333-3333-3333-3333-333333333333', 'player1@example.com')
on conflict do nothing;
insert into public.role_grants (user_id, role)
values ('11111111-1111-1111-1111-111111111111', 'games.edit')
on conflict do nothing;

create or replace function pg_temp.check(label text, got boolean) returns void
language plpgsql as $$
begin
  raise notice '%  %', case when got then 'PASS' else 'FAIL' end, label;
  if not got then raise exception 'failed: %', label; end if;
end $$;

create temp table t (k text primary key, v jsonb);

-- ---------------------------------------------------------------------------
-- item_seconds is total, because answer_item calls it on every answer
-- ---------------------------------------------------------------------------
select pg_temp.check('a plain number is a window',
  public.item_seconds('{"seconds": 30}'::jsonb) = 30);
select pg_temp.check('a number as a string works too',
  public.item_seconds('{"seconds": "30"}'::jsonb) = 30);
select pg_temp.check('no seconds means no clock',
  public.item_seconds('{"options":["a"]}'::jsonb) is null);
select pg_temp.check('nonsense is no clock rather than an error',
  public.item_seconds('{"seconds": "soon"}'::jsonb) is null);
select pg_temp.check('and so is a negative or absurd one',
  public.item_seconds('{"seconds": 0}'::jsonb) is null
  and public.item_seconds('{"seconds": 99999}'::jsonb) is null);
select pg_temp.check('null payload is no clock',
  public.item_seconds('{}'::jsonb) is null);

-- ---------------------------------------------------------------------------
-- A question with a window
-- ---------------------------------------------------------------------------
set session "test.uid" = '11111111-1111-1111-1111-111111111111';
insert into t select 'sess', public.create_session('Against the clock');
insert into t select 'q1', public.save_item(
  ((select v->>'id' from t where k='sess'))::uuid, null, 'choice',
  'Quick — which year?',
  '{"options":["2019","2021"],"seconds":30}'::jsonb, '{"correct":["2021"]}'::jsonb);
insert into t select 'q2', public.save_item(
  ((select v->>'id' from t where k='sess'))::uuid, null, 'choice',
  'No rush on this one',
  '{"options":["2019","2021"]}'::jsonb, '{"correct":["2021"]}'::jsonb);

select public.advance_session(((select v->>'id' from t where k='sess'))::uuid, 'start');
select public.advance_session(((select v->>'id' from t where k='sess'))::uuid, 'show');

set session "test.uid" = '33333333-3333-3333-3333-333333333333';
insert into t select 'see', public.current_item(((select v->>'id' from t where k='sess'))::uuid);
select pg_temp.check('the room is told how long it has',
  (select (v->>'seconds')::int from t where k='see') = 30);
select pg_temp.check('and when the server thinks it is now',
  (select (v->>'now')::timestamptz from t where k='see') is not null);
select pg_temp.check('and when the question opened, so the two can be subtracted',
  (select (v->>'opened_at')::timestamptz from t where k='see') is not null);

select pg_temp.check('inside the window an answer counts',
  (public.answer_item(((select v->>'id' from t where k='q1'))::uuid, '"2021"'::jsonb)->>'ok') = 'true');

-- Move the clock rather than waiting thirty seconds: opened_at is the only
-- thing the check reads, so backdating it is the same situation.
update public.items set opened_at = now() - interval '31 seconds'
where id = ((select v->>'id' from t where k='q1'))::uuid;

select pg_temp.check('past the window it is refused',
  (public.answer_item(((select v->>'id' from t where k='q1'))::uuid, '"2019"'::jsonb)->>'ok') = 'false');
select pg_temp.check('and says why, so the interface can too',
  (public.answer_item(((select v->>'id' from t where k='q1'))::uuid, '"2019"'::jsonb)->>'reason')
    like '%time is up%');
select pg_temp.check('a late answer does not overwrite the one that landed in time',
  (select value from public.responses
   where item_id = ((select v->>'id' from t where k='q1'))::uuid
     and user_id = '33333333-3333-3333-3333-333333333333') = '"2021"'::jsonb);
select pg_temp.check('the item is still open — the clock refuses, it does not lock',
  (select state from public.items where id = ((select v->>'id' from t where k='q1'))::uuid) = 'open');

-- ---------------------------------------------------------------------------
-- A question without one is not on a clock
-- ---------------------------------------------------------------------------
set session "test.uid" = '11111111-1111-1111-1111-111111111111';
select public.advance_session(((select v->>'id' from t where k='sess'))::uuid, 'show');
update public.items set opened_at = now() - interval '2 hours'
where id = ((select v->>'id' from t where k='q2'))::uuid;

set session "test.uid" = '33333333-3333-3333-3333-333333333333';
select pg_temp.check('no clock means no deadline, however long it has been open',
  (public.answer_item(((select v->>'id' from t where k='q2'))::uuid, '"2021"'::jsonb)->>'ok') = 'true');
select pg_temp.check('and the room is told there is no clock',
  (public.current_item(((select v->>'id' from t where k='sess'))::uuid)->>'seconds') is null);

-- ---------------------------------------------------------------------------
-- What the presenter needs to know what to press
-- ---------------------------------------------------------------------------
set session "test.uid" = '11111111-1111-1111-1111-111111111111';
insert into t select 'door', public.session_door(((select v->>'id' from t where k='sess'))::uuid);
select pg_temp.check('the door counts the questions',
  (select (v->>'total')::int from t where k='door') = 2);
select pg_temp.check('and how many are still to come',
  (select (v->>'pending')::int from t where k='door') = 0);
select pg_temp.check('and which one is up',
  (select (v->>'position')::int from t where k='door') = 2);
select pg_temp.check('and what state it is in',
  (select v->>'item_state' from t where k='door') = 'open');

set session "test.uid" = '33333333-3333-3333-3333-333333333333';
select pg_temp.check('a player gets nothing from the door',
  (public.session_door(((select v->>'id' from t where k='sess'))::uuid)->>'ok') = 'false');

\echo '--- timing checks passed ---'
