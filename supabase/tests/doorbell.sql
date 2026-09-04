-- Whether the room can be sent the doorbell at all.
--
-- These do not test Realtime; they test the thing Realtime needs and that was
-- missing. Realtime applies row-level security to delivery, so a subscriber
-- with no privilege and no policy is sent nothing — and is told nothing, which
-- is why the presenter clicking "show" moved their own screen and no one
-- else's. The presenter's click re-reads; only the room depended on the event.
--
-- Pinned here because it is invisible from every other direction: the
-- publication is right, the subscription succeeds, the client code is right,
-- and the feature is dead.
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
  -- `is not true`, not `not got`: a check whose expression comes back NULL
  -- printed FAIL and then carried on, because NOT NULL is NULL and the IF was
  -- never taken. A check that can report a failure without stopping is a check
  -- that can be ignored, which is worse than not having it.
  raise notice '%  %', case when got is true then 'PASS' else 'FAIL' end, label;
  if got is not true then raise exception 'failed: %', label; end if;
end $$;

-- ---------------------------------------------------------------------------
-- The two halves Realtime needs
-- ---------------------------------------------------------------------------
select pg_temp.check('the room may select a session row at all',
  has_table_privilege('authenticated', 'public.sessions', 'select'));
select pg_temp.check('and a policy says which ones',
  exists (select 1 from pg_policies
          where schemaname = 'public' and tablename = 'sessions' and cmd = 'SELECT'));
select pg_temp.check('sessions is published to realtime',
  exists (select 1 from pg_publication_tables
          where pubname = 'supabase_realtime' and schemaname = 'public'
            and tablename = 'sessions'));

-- The tables that must NOT have gained one along the way. The doorbell needed a
-- readable row; the questions and the answers did not.
select pg_temp.check('items is still unreadable',
  not has_table_privilege('authenticated', 'public.items', 'select'));
select pg_temp.check('item_answers is still unreadable',
  not has_table_privilege('authenticated', 'public.item_answers', 'select'));
select pg_temp.check('responses are still unreadable',
  not has_table_privilege('authenticated', 'public.responses', 'select'));
select pg_temp.check('and neither items nor answers are published',
  not exists (select 1 from pg_publication_tables
              where pubname = 'supabase_realtime' and schemaname = 'public'
                and tablename in ('items', 'item_answers', 'responses')));

-- ---------------------------------------------------------------------------
-- What the policy actually lets through, as the roles see it
-- ---------------------------------------------------------------------------
create temp table t (k text primary key, v jsonb);
-- The scratch table belongs to the connection's own role, and half this file
-- runs as `authenticated`. Without this the harness itself is what denies the
-- query, and the test reports a permissions problem it invented.
grant select on t to authenticated;
set session "test.uid" = '11111111-1111-1111-1111-111111111111';
insert into t select 'sess', public.create_session('Can the room hear this');

-- `set role` matters and is the whole point: row-level security is bypassed for
-- a table's owner and for superusers, so the same query run by the file's own
-- connection sees every row and proves nothing. An earlier leak test in this
-- project reported a problem that was entirely its harness for exactly this
-- reason. `authenticated` is neither owner nor superuser, so the policy
-- applies to it without needing `force row level security`.
set session role authenticated;

set session "test.uid" = '33333333-3333-3333-3333-333333333333';
select pg_temp.check('a draft is not visible to the room',
  not exists (select 1 from public.sessions
              where id = ((select v->>'id' from t where k='sess'))::uuid));

reset role;
set session "test.uid" = '11111111-1111-1111-1111-111111111111';
select public.advance_session(((select v->>'id' from t where k='sess'))::uuid, 'start');

set session role authenticated;
set session "test.uid" = '33333333-3333-3333-3333-333333333333';
select pg_temp.check('a live one is — which is what the doorbell needs',
  exists (select 1 from public.sessions
          where id = ((select v->>'id' from t where k='sess'))::uuid));

reset role;
set session "test.uid" = '11111111-1111-1111-1111-111111111111';
select public.advance_session(((select v->>'id' from t where k='sess'))::uuid, 'close');

set session role authenticated;
set session "test.uid" = '33333333-3333-3333-3333-333333333333';
select pg_temp.check('and so is a closed one, so the room is told it ended',
  exists (select 1 from public.sessions
          where id = ((select v->>'id' from t where k='sess'))::uuid));

set session "test.uid" = '';
select pg_temp.check('a signed-out visitor sees no sessions at all',
  not exists (select 1 from public.sessions));

reset role;

\echo '--- doorbell checks passed ---'
