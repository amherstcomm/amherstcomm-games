-- Whoever is running a session is not playing in it.
--
-- They wrote the answers, or they have the presenter's screen open with the
-- correct one on it so they can run the reveal. A score earned from that seat
-- means nothing, and a prize decided by it is worse than meaningless.
--
-- The rule is about the session's own host rather than about anybody who could
-- host it: hosts_session() is true for everyone holding games.setup, and using
-- that here would mean no editor could ever play any session — which on a site
-- with one admin means that admin never plays.
\set ON_ERROR_STOP on

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'ray@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'otheredit@example.com'),
  ('33333333-3333-3333-3333-333333333333', 'ada@example.com')
on conflict do nothing;
insert into public.role_grants (user_id, role) values
  ('11111111-1111-1111-1111-111111111111', 'games.edit'),
  ('22222222-2222-2222-2222-222222222222', 'games.edit')
on conflict do nothing;

create or replace function pg_temp.check(label text, got boolean) returns void
language plpgsql as $$
begin
  raise notice '%  %', case when got is true then 'PASS' else 'FAIL' end, label;
  if got is not true then raise exception 'failed: %', label; end if;
end $$;

create temp table t (k text primary key, v jsonb);

-- ---------------------------------------------------------------------------
-- A live session
-- ---------------------------------------------------------------------------
set session "test.uid" = '11111111-1111-1111-1111-111111111111';
insert into t select 'sess', public.create_session('Week one');
insert into t select 'q1', public.save_item(
  ((select v->>'id' from t where k='sess'))::uuid, null, 'choice', 'One',
  '{"options":["a","b"]}'::jsonb, '{"correct":["a"]}'::jsonb);
select public.advance_session(((select v->>'id' from t where k='sess'))::uuid, 'start');
select public.advance_session(((select v->>'id' from t where k='sess'))::uuid, 'show');

-- The presenter's screen is pointed at a room, so it still gets the question.
insert into t select 'sees', public.current_item(((select v->>'id' from t where k='sess'))::uuid);
select pg_temp.check('the host still sees the question — the screen is for the room',
  (select v->>'id' from t where k='sees') = (select v->>'id' from t where k='q1'));
select pg_temp.check('and its options, because that is what goes on the projector',
  (select v->'payload'->'options'->>0 from t where k='sees') = 'a');
-- The question travels with the answer to "is this yours", so the screen stops
-- guessing it from the address. It guessed wrong for exactly one person: the
-- host arriving at the ordinary player address, who got a working question and
-- was refused on sending it.
select pg_temp.check('and it says the session is theirs',
  (select v->>'yours' from t where k='sees') = 'true');

insert into t select 'try', public.answer_item(
  ((select v->>'id' from t where k='q1'))::uuid, '"a"'::jsonb);
select pg_temp.check('but cannot answer it', (select v->>'ok' from t where k='try') = 'false');
select pg_temp.check('and is told why, rather than being ignored',
  (select v->>'reason' from t where k='try') = 'you are running this one');
select pg_temp.check('and nothing was written',
  not exists (select 1 from public.responses
              where item_id = ((select v->>'id' from t where k='q1'))::uuid
                and user_id = '11111111-1111-1111-1111-111111111111'));

-- Another editor is not running this one, so they may play it.
set session "test.uid" = '22222222-2222-2222-2222-222222222222';
select pg_temp.check('an editor who is not running it may play',
  (public.answer_item(((select v->>'id' from t where k='q1'))::uuid, '"a"'::jsonb)->>'ok') = 'true');

set session "test.uid" = '33333333-3333-3333-3333-333333333333';
select pg_temp.check('and so may anybody else',
  (public.answer_item(((select v->>'id' from t where k='q1'))::uuid, '"a"'::jsonb)->>'ok') = 'true');
select pg_temp.check('and they are told it is not theirs, so the screen stays usable',
  (public.current_item(((select v->>'id' from t where k='sess'))::uuid)->>'yours') = 'false');

-- The reveal still reaches the host, because they are the one running it.
set session "test.uid" = '11111111-1111-1111-1111-111111111111';
select public.advance_session(((select v->>'id' from t where k='sess'))::uuid, 'reveal');
select pg_temp.check('after the reveal the host is given the answer, like the room',
  (public.current_item(((select v->>'id' from t where k='sess'))::uuid)
     -> 'answer' -> 'correct' ->> 0) = 'a');
select pg_temp.check('and is not on the board',
  not exists (
    select 1 from jsonb_array_elements(
      public.session_leaderboard(((select v->>'id' from t where k='sess'))::uuid)->'standings') e
    where e->>'name' = 'Someone' and (e->>'points')::numeric > 1));
select pg_temp.check('the two who played are',
  jsonb_array_length(
    public.session_leaderboard(((select v->>'id' from t where k='sess'))::uuid)->'standings') = 2);

-- ---------------------------------------------------------------------------
-- An open session: nothing is even served to them
-- ---------------------------------------------------------------------------
insert into t select 'open', public.create_session('Whenever', 'strict', 'open');
insert into t select 'oq', public.save_item(
  ((select v->>'id' from t where k='open'))::uuid, null, 'choice', 'One',
  '{"options":["a","b"]}'::jsonb, '{"correct":["a"]}'::jsonb);
select public.advance_session(((select v->>'id' from t where k='open'))::uuid, 'start');

insert into t select 'ohost', public.current_item(((select v->>'id' from t where k='open'))::uuid);
select pg_temp.check('the host of an open session is given no question at all',
  (select v->>'state' from t where k='ohost') = 'not-live');
select pg_temp.check('and is told why, rather than being left to read it as "not started"',
  (select v->>'yours' from t where k='ohost') = 'true');
-- The reason this matters more here than on a live session: asking is what
-- starts a clock, so a host who was served would have one running for a
-- question they can never answer.
select pg_temp.check('so no clock was started for them',
  not exists (select 1 from public.item_served
              where item_id = ((select v->>'id' from t where k='oq'))::uuid
                and user_id = '11111111-1111-1111-1111-111111111111'));
select pg_temp.check('and they cannot answer it either',
  (public.answer_item(((select v->>'id' from t where k='oq'))::uuid, '"a"'::jsonb)->>'reason')
    = 'you are running this one');

set session "test.uid" = '33333333-3333-3333-3333-333333333333';
select pg_temp.check('while a player is served it as before',
  (public.current_item(((select v->>'id' from t where k='open'))::uuid)->>'id')
    = (select v->>'id' from t where k='oq'));

-- ---------------------------------------------------------------------------
-- A word game is no different: they set the word
-- ---------------------------------------------------------------------------
set session "test.uid" = '11111111-1111-1111-1111-111111111111';
insert into t select 'wsess', public.create_session('A word');
insert into t select 'wq', public.save_item(
  ((select v->>'id' from t where k='wsess'))::uuid, null, 'game', 'Six letters',
  '{"slug":"guess","length":6,"tries":6}'::jsonb, '{"word":"OWNERS"}'::jsonb);
select public.advance_session(((select v->>'id' from t where k='wsess'))::uuid, 'start');
select public.advance_session(((select v->>'id' from t where k='wsess'))::uuid, 'show');
select pg_temp.check('the host cannot guess at a word they chose',
  (public.guess_word(((select v->>'id' from t where k='wq'))::uuid, 'OWNERS')->>'reason')
    = 'you are running this one');

\echo '--- host-is-not-a-player checks passed ---'
