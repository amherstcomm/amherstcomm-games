-- Getting into the room.
--
-- The gap this closes was not a broken function — lifecycle.sql shows the whole
-- run working, answering included. It was that a participant had no way to
-- arrive: the only links to /live/<id> were on the authoring screen. These
-- cover the two doors, and in particular that neither one opens onto a draft.
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

set session "test.uid" = '11111111-1111-1111-1111-111111111111';
insert into t select 'sess', public.create_session('Joining, from both doors');
insert into t select 'code', to_jsonb((
  select code from public.sessions where id = ((select v->>'id' from t where k='sess'))::uuid));

select pg_temp.check('a new session gets a code',
  (select v #>> '{}' from t where k='code') ~ '^[A-HJ-NP-Z2-9]{4}$');
select pg_temp.check('the code has no 0, O, 1, I or L in it',
  (select v #>> '{}' from t where k='code') !~ '[01OIL]');
select pg_temp.check('my_sessions carries the code',
  (select e->>'code' from jsonb_array_elements(public.my_sessions()) e
   where e->>'id' = (select v->>'id' from t where k='sess'))
    = (select v #>> '{}' from t where k='code'));

-- ---------------------------------------------------------------------------
-- A draft is not a thing to join
-- ---------------------------------------------------------------------------
set session "test.uid" = '33333333-3333-3333-3333-333333333333';
select pg_temp.check('a draft is not listed as live', public.live_sessions() = '[]'::jsonb);
select pg_temp.check('and its code does not resolve',
  (public.session_by_code((select v #>> '{}' from t where k='code'))->>'ok') = 'false');

-- ---------------------------------------------------------------------------
-- Once it is running, both doors open
-- ---------------------------------------------------------------------------
set session "test.uid" = '11111111-1111-1111-1111-111111111111';
select public.advance_session(((select v->>'id' from t where k='sess'))::uuid, 'start');

set session "test.uid" = '33333333-3333-3333-3333-333333333333';
select pg_temp.check('a live session is listed',
  (select count(*) from jsonb_array_elements(public.live_sessions()) e
   where e->>'id' = (select v->>'id' from t where k='sess')) = 1);
select pg_temp.check('the list carries the title, so it is pickable',
  (select e->>'title' from jsonb_array_elements(public.live_sessions()) e
   where e->>'id' = (select v->>'id' from t where k='sess')) = 'Joining, from both doors');
select pg_temp.check('the list carries no questions — it is the door, not the room',
  not (select bool_or(e ? 'items' or e ? 'current_item')
       from jsonb_array_elements(public.live_sessions()) e));

select pg_temp.check('the code resolves to the session',
  (public.session_by_code((select v #>> '{}' from t where k='code'))->>'id')
    = (select v->>'id' from t where k='sess'));
select pg_temp.check('lower case works, because nobody types a slide exactly',
  (public.session_by_code(lower((select v #>> '{}' from t where k='code')))->>'id')
    = (select v->>'id' from t where k='sess'));
select pg_temp.check('so do spaces and dashes',
  (public.session_by_code(' ' || (select v #>> '{}' from t where k='code') || ' -')->>'id')
    = (select v->>'id' from t where k='sess'));
select pg_temp.check('a code nobody has says so plainly',
  (public.session_by_code('ZZZZ')->>'reason') like '%no session%');
select pg_temp.check('and empty is not a wildcard',
  (public.session_by_code('')->>'ok') = 'false');

-- ---------------------------------------------------------------------------
-- Closing shuts both doors and releases the code
-- ---------------------------------------------------------------------------
set session "test.uid" = '11111111-1111-1111-1111-111111111111';
select public.advance_session(((select v->>'id' from t where k='sess'))::uuid, 'close');

set session "test.uid" = '33333333-3333-3333-3333-333333333333';
select pg_temp.check('a closed session leaves the list', public.live_sessions() = '[]'::jsonb);
select pg_temp.check('and its code stops resolving',
  (public.session_by_code((select v #>> '{}' from t where k='code'))->>'ok') = 'false');

set session "test.uid" = '11111111-1111-1111-1111-111111111111';
-- The point of the partial index: a closed session must not hold its code
-- hostage, or a month of weekly trivia burns through four-character codes.
insert into t select 'next', public.create_session('Reusing the code');
update public.sessions set code = (select v #>> '{}' from t where k='code')
where id = ((select v->>'id' from t where k='next'))::uuid;
select pg_temp.check('a closed session releases its code for reuse',
  (select count(*) from public.sessions
   where code = (select v #>> '{}' from t where k='code')) = 2);
select pg_temp.check('and the code now resolves to the running one',
  (public.session_by_code((select v #>> '{}' from t where k='code'))->>'id') is null);
select public.advance_session(((select v->>'id' from t where k='next'))::uuid, 'start');
select pg_temp.check('once started, that is where the code goes',
  (public.session_by_code((select v #>> '{}' from t where k='code'))->>'id')
    = (select v->>'id' from t where k='next'));
-- and two live sessions cannot share one
select pg_temp.check('two joinable sessions cannot share a code',
  not exists (
    select 1 from public.sessions a join public.sessions b
      on a.code = b.code and a.id <> b.id
    where a.state <> 'closed' and b.state <> 'closed'));

-- ---------------------------------------------------------------------------
-- Signed out is nothing at all
-- ---------------------------------------------------------------------------
set session "test.uid" = '';
select pg_temp.check('a signed-out visitor sees no live sessions',
  public.live_sessions() = '[]'::jsonb);
select pg_temp.check('a signed-out visitor cannot resolve a code',
  (public.session_by_code('ABCD')->>'ok') = 'false');
select pg_temp.check('anon may call neither door',
  (select bool_or(has_function_privilege('anon', oid, 'execute'))
   from pg_proc
   where proname in ('live_sessions', 'session_by_code', 'new_session_code')
     and pronamespace = 'public'::regnamespace) is not true);
select pg_temp.check('and authenticated may not mint a code by hand',
  not has_function_privilege('authenticated', 'public.new_session_code()', 'execute'));

\echo '--- joining checks passed ---'
