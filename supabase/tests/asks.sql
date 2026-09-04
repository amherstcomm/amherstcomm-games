-- Questions for the host, running alongside everything else.
--
-- Not an item: the `open` kind is a question the presenter asks and the room
-- answers in its turn. This is the other direction and has no turn — anybody
-- asks anything while the session runs, and the host works through them.
--
-- The votes are the part worth pinning. Forty questions in arrival order is a
-- list nobody can act on, so the order is the feature, and an order that is
-- subtly wrong is worse than none: it looks like the room's priority and is
-- not.
\set ON_ERROR_STOP on

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'ray@example.com'),
  ('33333333-3333-3333-3333-333333333333', 'ada@example.com'),
  ('44444444-4444-4444-4444-444444444444', 'grace@example.com'),
  ('55555555-5555-5555-5555-555555555555', 'alan@example.com'),
  ('66666666-6666-6666-6666-666666666666', 'admin@example.com')
on conflict do nothing;
insert into public.role_grants (user_id, role) values
  ('11111111-1111-1111-1111-111111111111', 'games.edit'),
  ('66666666-6666-6666-6666-666666666666', 'games.admin')
on conflict do nothing;
insert into public.profiles (id, display_name) values
  ('33333333-3333-3333-3333-333333333333', 'Ada'),
  ('44444444-4444-4444-4444-444444444444', 'Grace'),
  ('55555555-5555-5555-5555-555555555555', 'Alan')
on conflict (id) do update set display_name = excluded.display_name;

create or replace function pg_temp.check(label text, got boolean) returns void
language plpgsql as $$
begin
  raise notice '%  %', case when got is true then 'PASS' else 'FAIL' end, label;
  if got is not true then raise exception 'failed: %', label; end if;
end $$;

create temp table t (k text primary key, v jsonb);
create or replace function pg_temp.asks(sess uuid) returns jsonb
language sql as $$ select public.session_asks(sess) -> 'asks' $$;

set session "test.uid" = '11111111-1111-1111-1111-111111111111';
insert into t select 'sess', public.create_session('Week one');
select pg_temp.check('a new session has questions on by default',
  (select qa from public.sessions where id = ((select v->>'id' from t where k='sess'))::uuid));
-- Made first, then read: create_session is volatile and calling it inside a
-- WHERE gets it evaluated per row. This project has now walked into that twice.
insert into t select 'quiet', public.create_session('Quiet one', 'strict', 'live', false);
select pg_temp.check('and one can be made with them off',
  not (select qa from public.sessions
       where id = ((select v->>'id' from t where k='quiet'))::uuid));

-- ---------------------------------------------------------------------------
-- Nothing before it starts
-- ---------------------------------------------------------------------------
set session "test.uid" = '33333333-3333-3333-3333-333333333333';
select pg_temp.check('a draft takes no questions',
  (public.ask_question(((select v->>'id' from t where k='sess'))::uuid, 'why?')->>'ok') = 'false');

set session "test.uid" = '11111111-1111-1111-1111-111111111111';
select public.advance_session(((select v->>'id' from t where k='sess'))::uuid, 'start');

-- ---------------------------------------------------------------------------
-- Asking
-- ---------------------------------------------------------------------------
set session "test.uid" = '33333333-3333-3333-3333-333333333333';
select pg_temp.check('a question can be asked while it runs',
  (public.ask_question(((select v->>'id' from t where k='sess'))::uuid,
                       'When is the picnic?')->>'ok') = 'true');
select pg_temp.check('an empty one is refused',
  (public.ask_question(((select v->>'id' from t where k='sess'))::uuid, '   ')->>'reason')
    like '%some words%');

set session "test.uid" = '44444444-4444-4444-4444-444444444444';
select public.ask_question(((select v->>'id' from t where k='sess'))::uuid,
                           'Why is the coffee like that?', true);
set session "test.uid" = '55555555-5555-5555-5555-555555555555';
select public.ask_question(((select v->>'id' from t where k='sess'))::uuid, 'Are we hiring?');

set session "test.uid" = '33333333-3333-3333-3333-333333333333';
select pg_temp.check('all three are on the list',
  jsonb_array_length(pg_temp.asks(((select v->>'id' from t where k='sess'))::uuid)) = 3);
select pg_temp.check('a named question carries the name',
  (select e->>'who' from jsonb_array_elements(
     pg_temp.asks(((select v->>'id' from t where k='sess'))::uuid)) e
   where e->>'body' = 'When is the picnic?') = 'Ada');
select pg_temp.check('and an anonymous one carries none',
  (select e->'who' from jsonb_array_elements(
     pg_temp.asks(((select v->>'id' from t where k='sess'))::uuid)) e
   where e->>'body' = 'Why is the coffee like that?') = 'null'::jsonb);
select pg_temp.check('she can tell which one is hers',
  (select (e->>'mine')::boolean from jsonb_array_elements(
     pg_temp.asks(((select v->>'id' from t where k='sess'))::uuid)) e
   where e->>'body' = 'When is the picnic?'));

-- ---------------------------------------------------------------------------
-- Votes, and the order they impose
-- ---------------------------------------------------------------------------
insert into t select 'coffee', to_jsonb((
  select e->>'id' from jsonb_array_elements(
    pg_temp.asks(((select v->>'id' from t where k='sess'))::uuid)) e
  where e->>'body' = 'Why is the coffee like that?'));

select pg_temp.check('voting works',
  (public.vote_ask((select v #>> '{}' from t where k='coffee')::uuid)->>'voted') = 'true');
select pg_temp.check('and pressing it again takes it back',
  (public.vote_ask((select v #>> '{}' from t where k='coffee')::uuid)->>'voted') = 'false');
select public.vote_ask((select v #>> '{}' from t where k='coffee')::uuid);
set session "test.uid" = '55555555-5555-5555-5555-555555555555';
select public.vote_ask((select v #>> '{}' from t where k='coffee')::uuid);

set session "test.uid" = '33333333-3333-3333-3333-333333333333';
select pg_temp.check('two votes count as two, not as one person pressing twice',
  (select (e->>'votes')::int from jsonb_array_elements(
     pg_temp.asks(((select v->>'id' from t where k='sess'))::uuid)) e
   where e->>'body' = 'Why is the coffee like that?') = 2);
select pg_temp.check('the most-wanted one is first',
  pg_temp.asks(((select v->>'id' from t where k='sess'))::uuid) -> 0 ->> 'body'
    = 'Why is the coffee like that?');
-- A question does not lose its place by being early.
select pg_temp.check('and a tie is settled by who asked first',
  pg_temp.asks(((select v->>'id' from t where k='sess'))::uuid) -> 1 ->> 'body'
    = 'When is the picnic?');
select pg_temp.check('she is told which ones she voted for',
  (select (e->>'voted')::boolean from jsonb_array_elements(
     pg_temp.asks(((select v->>'id' from t where k='sess'))::uuid)) e
   where e->>'body' = 'Why is the coffee like that?'));

-- ---------------------------------------------------------------------------
-- The host's two moves
-- ---------------------------------------------------------------------------
-- Running the session is not the same as being allowed to unmask somebody.
-- The route to a name is users.manage, which is games.admin — the same
-- arrangement the open kind already uses for exactly the same promise.
set session "test.uid" = '11111111-1111-1111-1111-111111111111';
select pg_temp.check('the host, who is an editor, does not see who asked anonymously',
  (select e->'who' from jsonb_array_elements(
     pg_temp.asks(((select v->>'id' from t where k='sess'))::uuid)) e
   where e->>'body' = 'Why is the coffee like that?') = 'null'::jsonb);

set session "test.uid" = '66666666-6666-6666-6666-666666666666';
select pg_temp.check('an admin does',
  (select e->>'who' from jsonb_array_elements(
     pg_temp.asks(((select v->>'id' from t where k='sess'))::uuid)) e
   where e->>'body' = 'Why is the coffee like that?') = 'Grace');
select pg_temp.check('while still being told it was asked anonymously',
  (select (e->>'anonymous')::boolean from jsonb_array_elements(
     pg_temp.asks(((select v->>'id' from t where k='sess'))::uuid)) e
   where e->>'body' = 'Why is the coffee like that?'));

set session "test.uid" = '11111111-1111-1111-1111-111111111111';

select pg_temp.check('the host can mark one answered',
  (public.mark_ask((select v #>> '{}' from t where k='coffee')::uuid, true, null)->>'ok') = 'true');
select pg_temp.check('an answered one sinks below the ones still to come',
  pg_temp.asks(((select v->>'id' from t where k='sess'))::uuid) -> 0 ->> 'body'
    <> 'Why is the coffee like that?');

select pg_temp.check('and can take one off the wall',
  (public.mark_ask((select v #>> '{}' from t where k='coffee')::uuid, null, true)->>'ok') = 'true');
select pg_temp.check('the host still sees it, so it can be put back',
  jsonb_array_length(pg_temp.asks(((select v->>'id' from t where k='sess'))::uuid)) = 3);
-- Nothing on this site erases somebody's words on another person's say-so;
-- hidden is off the wall, not deleted.
select pg_temp.check('and the words are still there',
  exists (select 1 from public.asks
          where id = (select v #>> '{}' from t where k='coffee')::uuid
            and body = 'Why is the coffee like that?'));

set session "test.uid" = '33333333-3333-3333-3333-333333333333';
select pg_temp.check('the room no longer sees it',
  jsonb_array_length(pg_temp.asks(((select v->>'id' from t where k='sess'))::uuid)) = 2);
select pg_temp.check('nor can they vote on it',
  (public.vote_ask((select v #>> '{}' from t where k='coffee')::uuid)->>'ok') = 'false');
select pg_temp.check('and a player cannot mark anything',
  (public.mark_ask((select v #>> '{}' from t where k='coffee')::uuid, true, null)->>'ok') = 'false');

-- ---------------------------------------------------------------------------
-- Turning it off
-- ---------------------------------------------------------------------------
set session "test.uid" = '11111111-1111-1111-1111-111111111111';
select pg_temp.check('the host can turn questions off mid-session',
  (public.set_session_qa(((select v->>'id' from t where k='sess'))::uuid, false)->>'ok') = 'true');
set session "test.uid" = '33333333-3333-3333-3333-333333333333';
select pg_temp.check('after which no more can be asked',
  (public.ask_question(((select v->>'id' from t where k='sess'))::uuid, 'one more?')->>'ok') = 'false');
select pg_temp.check('but what was already asked is still readable',
  jsonb_array_length(pg_temp.asks(((select v->>'id' from t where k='sess'))::uuid)) = 2);
select pg_temp.check('and the list says it is closed',
  (public.session_asks(((select v->>'id' from t where k='sess'))::uuid)->>'open') = 'false');

set session "test.uid" = '';
select pg_temp.check('signed out sees nothing',
  (public.session_asks(((select v->>'id' from t where k='sess'))::uuid)->>'ok') = 'false');
select pg_temp.check('and anon may call none of it',
  (select bool_or(has_function_privilege('anon', oid, 'execute'))
   from pg_proc
   where proname in ('ask_question', 'vote_ask', 'mark_ask', 'session_asks', 'set_session_qa')
     and pronamespace = 'public'::regnamespace) is not true);
select pg_temp.check('and the tables are unreachable directly',
  not has_table_privilege('authenticated', 'public.asks', 'select')
  and not has_table_privilege('authenticated', 'public.ask_votes', 'select'));

\echo '--- q&a checks passed ---'
