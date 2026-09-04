-- Deleting a session for good.
--
-- This overturns an earlier rule in this project. delete_session refused
-- anything that had run, on the grounds that it is a record of what the room
-- said — a fine argument for not doing it by accident and a bad one for not
-- being able to, and old sessions pile up. What is left of the old rule is the
-- confirmation, and these are mostly about the difference between the two.
\set ON_ERROR_STOP on

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'editor@example.com'),
  ('33333333-3333-3333-3333-333333333333', 'ada@example.com')
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
set session "test.uid" = '11111111-1111-1111-1111-111111111111';

-- ---------------------------------------------------------------------------
-- A draft still goes on the first ask
-- ---------------------------------------------------------------------------
insert into t select 'draft', public.create_session('Never ran');
select pg_temp.check('a draft deletes without being asked twice',
  (public.delete_session(((select v->>'id' from t where k='draft'))::uuid)->>'ok') = 'true');
select pg_temp.check('and is gone',
  not exists (select 1 from public.sessions
              where id = ((select v->>'id' from t where k='draft'))::uuid));

-- ---------------------------------------------------------------------------
-- One that ran, with answers in it
-- ---------------------------------------------------------------------------
insert into t select 'sess', public.create_session('October, week one');
insert into t select 'q1', public.save_item(
  ((select v->>'id' from t where k='sess'))::uuid, null, 'choice', 'One',
  '{"options":["a","b"]}'::jsonb, '{"correct":["a"]}'::jsonb);
insert into t select 'q2', public.save_item(
  ((select v->>'id' from t where k='sess'))::uuid, null, 'choice', 'Two',
  '{"options":["a","b"]}'::jsonb, '{"correct":["b"]}'::jsonb);
select public.advance_session(((select v->>'id' from t where k='sess'))::uuid, 'start');
select public.advance_session(((select v->>'id' from t where k='sess'))::uuid, 'show');
insert into public.responses (item_id, user_id, value) values
  (((select v->>'id' from t where k='q1'))::uuid, '33333333-3333-3333-3333-333333333333', '"a"');

insert into t select 'no', public.delete_session(((select v->>'id' from t where k='sess'))::uuid);
select pg_temp.check('it does not go on the first ask',
  (select v->>'ok' from t where k='no') = 'false');
select pg_temp.check('the refusal is a request to confirm rather than a refusal',
  (select v->>'reason' from t where k='no') = 'confirm');
select pg_temp.check('and it counts what would be lost, so the question can be asked in numbers',
  (select (v->>'items')::int from t where k='no') = 2
  and (select (v->>'answers')::int from t where k='no') = 1
  and (select (v->>'people')::int from t where k='no') = 1);
select pg_temp.check('nothing has been deleted yet',
  exists (select 1 from public.sessions
          where id = ((select v->>'id' from t where k='sess'))::uuid));

insert into t select 'yes', public.delete_session(
  ((select v->>'id' from t where k='sess'))::uuid, true);
select pg_temp.check('confirmed, it goes', (select v->>'ok' from t where k='yes') = 'true');
select pg_temp.check('the session is gone',
  not exists (select 1 from public.sessions
              where id = ((select v->>'id' from t where k='sess'))::uuid));
select pg_temp.check('its questions went with it',
  not exists (select 1 from public.items
              where id = ((select v->>'id' from t where k='q1'))::uuid));
-- The point rather than a side effect: a half-deleted session leaves answers to
-- questions that no longer exist, on a scoreboard that can no longer explain
-- them.
select pg_temp.check('and so did the answers people gave',
  not exists (select 1 from public.responses
              where item_id = ((select v->>'id' from t where k='q1'))::uuid));
select pg_temp.check('and the answer sheet',
  not exists (select 1 from public.item_answers
              where item_id = ((select v->>'id' from t where k='q1'))::uuid));

-- ---------------------------------------------------------------------------
-- Who may
-- ---------------------------------------------------------------------------
set session "test.uid" = '33333333-3333-3333-3333-333333333333';
insert into t select 'theirs', public.create_session('Not yours');
select pg_temp.check('a player cannot even make one',
  (select v->>'ok' from t where k='theirs') = 'false');

set session "test.uid" = '11111111-1111-1111-1111-111111111111';
insert into t select 'mine', public.create_session('Mine');
set session "test.uid" = '33333333-3333-3333-3333-333333333333';
select pg_temp.check('nor delete one, confirmation or not',
  (public.delete_session(((select v->>'id' from t where k='mine'))::uuid, true)->>'ok') = 'false');
select pg_temp.check('and it is still there afterwards',
  exists (select 1 from public.sessions
          where id = ((select v->>'id' from t where k='mine'))::uuid));

select pg_temp.check('the old one-argument form is gone, so nothing can call round the confirmation',
  not exists (
    select 1 from pg_proc
    where proname = 'delete_session' and pronamespace = 'public'::regnamespace
      and pg_get_function_identity_arguments(oid) = 'uuid'));
select pg_temp.check('anon may not delete anything',
  not has_function_privilege('anon', 'public.delete_session(uuid, boolean)', 'execute'));

\echo '--- deletion checks passed ---'
