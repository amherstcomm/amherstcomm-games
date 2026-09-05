-- A word game as a question.
--
-- The thing that makes this different from every other kind is that the server
-- marks. For the rest, the answer sits in item_answers until the reveal and the
-- client never needs it; here the client would need it on every guess in order
-- to colour the tiles, which would put the word on the room's screens at the
-- first keystroke. So most of these are about what the room is and is not told.
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

-- The words table is seeded separately and is empty in this harness, so give it
-- the handful this file needs to judge a guess.
insert into public.words (word, len, sorted, level)
values ('owners', 6, 'enorsw', 10),
       ('crowns', 6, 'cnorsw', 10),
       ('speed', 5, 'deeps', 10),
       ('spend', 5, 'denps', 10)
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
-- Marking, and the doubled-letter rule that is the whole reason it is not
-- three lines
-- ---------------------------------------------------------------------------
select pg_temp.check('the answer itself is all correct',
  public.mark_guess('OWNERS', 'OWNERS')
    = array['correct','correct','correct','correct','correct','correct']);
select pg_temp.check('a letter in the wrong place is present',
  public.mark_guess('OWNERS', 'SWNERO')
    = array['present','correct','correct','correct','correct','present']);
select pg_temp.check('a letter that is not there at all is absent',
  public.mark_guess('OWNERS', 'ZZZZZZ')
    = array['absent','absent','absent','absent','absent','absent']);
select pg_temp.check('a second E cannot claim a letter the first already took',
  -- SPEED against SPEND: S, P and E land in place and so does the closing D;
  -- the guess's fourth letter is a second E, and the answer has no E left to
  -- give it, so it is absent rather than present. Getting that wrong is
  -- invisible until somebody in the room notices the board lied to them.
  public.mark_guess('SPEND', 'SPEED')
    = array['correct','correct','correct','absent','correct']);
select pg_temp.check('a doubled letter in the answer marks both',
  public.mark_guess('SPEED', 'EERIE')
    = array['present','present','absent','absent','absent']);
select pg_temp.check('a guess of the wrong length marks nothing rather than erroring',
  public.mark_guess('OWNERS', 'OWN') is null);

-- ---------------------------------------------------------------------------
-- A round
-- ---------------------------------------------------------------------------
create temp table t (k text primary key, v jsonb);
set session "test.uid" = '11111111-1111-1111-1111-111111111111';
insert into t select 'sess', public.create_session('A word game');
insert into t select 'q', public.save_item(
  ((select v->>'id' from t where k='sess'))::uuid, null, 'game',
  'Six letters. What we all are.',
  '{"slug":"guess","length":6,"tries":6}'::jsonb,
  '{"word":"OWNERS"}'::jsonb);
select pg_temp.check('a game question saves', (select v->>'ok' from t where k='q') = 'true');

select pg_temp.check('the payload the room gets does not contain the word',
  not ((select payload::text from public.items
        where id = ((select v->>'id' from t where k='q'))::uuid) ilike '%owners%'));
select pg_temp.check('and the word is in the table with no grant',
  (select upper(answer ->> 'word') from public.item_answers
   where item_id = ((select v->>'id' from t where k='q'))::uuid) = 'OWNERS');

select public.advance_session(((select v->>'id' from t where k='sess'))::uuid, 'start');

set session "test.uid" = '33333333-3333-3333-3333-333333333333';
select pg_temp.check('nobody can guess before it is shown',
  (public.guess_word(((select v->>'id' from t where k='q'))::uuid, 'CROWNS')->>'ok') = 'false');
select pg_temp.check('and the state is withheld too',
  (public.game_state(((select v->>'id' from t where k='q'))::uuid)->>'ok') = 'false');

set session "test.uid" = '11111111-1111-1111-1111-111111111111';
select public.advance_session(((select v->>'id' from t where k='sess'))::uuid, 'show');

-- Ada plays properly
set session "test.uid" = '33333333-3333-3333-3333-333333333333';
insert into t select 'g1', public.guess_word(((select v->>'id' from t where k='q'))::uuid, 'crowns');
select pg_temp.check('a guess is accepted in any case',
  (select v->>'ok' from t where k='g1') = 'true');
select pg_temp.check('and comes back marked',
  (select v->'marks'->>0 from t where k='g1') = 'absent'
  and (select v->'marks'->>2 from t where k='g1') = 'present');
select pg_temp.check('it does not hand over the word on the way',
  (select v->'word' from t where k='g1') = 'null'::jsonb);
select pg_temp.check('and says how many are left',
  (select (v->>'left')::int from t where k='g1') = 5);

select pg_temp.check('a guess of the wrong length is refused with the length in it',
  (public.guess_word(((select v->>'id' from t where k='q'))::uuid, 'own')->>'reason')
    like '%6 letters%');
select pg_temp.check('and something that is not a word is refused',
  (public.guess_word(((select v->>'id' from t where k='q'))::uuid, 'zzzzzz')->>'reason')
    like '%not a word%');

insert into t select 'g2', public.guess_word(((select v->>'id' from t where k='q'))::uuid, 'OWNERS');
select pg_temp.check('the right word solves it',
  (select v->>'solved' from t where k='g2') = 'true');
select pg_temp.check('and only then is the word handed over',
  (select v->>'word' from t where k='g2') = 'OWNERS');
select pg_temp.check('guessing again after solving is refused',
  (public.guess_word(((select v->>'id' from t where k='q'))::uuid, 'CROWNS')->>'ok') = 'false');

insert into t select 'st', public.game_state(((select v->>'id' from t where k='q'))::uuid);
select pg_temp.check('the board comes back on a reload',
  jsonb_array_length((select v->'guesses' from t where k='st')) = 2);
select pg_temp.check('with the solve remembered',
  (select v->>'solved' from t where k='st') = 'true');

-- Grace runs out
set session "test.uid" = '44444444-4444-4444-4444-444444444444';
select pg_temp.check('somebody who has not solved it is not told the word',
  (public.game_state(((select v->>'id' from t where k='q'))::uuid)->'word') = 'null'::jsonb);
select public.guess_word(((select v->>'id' from t where k='q'))::uuid, 'CROWNS');
select public.guess_word(((select v->>'id' from t where k='q'))::uuid, 'CROWNS');
select public.guess_word(((select v->>'id' from t where k='q'))::uuid, 'CROWNS');
select public.guess_word(((select v->>'id' from t where k='q'))::uuid, 'CROWNS');
select public.guess_word(((select v->>'id' from t where k='q'))::uuid, 'CROWNS');
insert into t select 'g6', public.guess_word(((select v->>'id' from t where k='q'))::uuid, 'CROWNS');
select pg_temp.check('the last guess hands the word over rather than leaving them hanging',
  (select v->>'word' from t where k='g6') = 'OWNERS');
select pg_temp.check('and a seventh is refused',
  (public.guess_word(((select v->>'id' from t where k='q'))::uuid, 'CROWNS')->>'reason')
    like '%No guesses left%');

-- ---------------------------------------------------------------------------
-- Scoring
-- ---------------------------------------------------------------------------
set session "test.uid" = '11111111-1111-1111-1111-111111111111';
select public.advance_session(((select v->>'id' from t where k='sess'))::uuid, 'reveal');

select pg_temp.check('solving it is a whole question',
  (select points from public.item_points(((select v->>'id' from t where k='q'))::uuid)
   where user_id = '33333333-3333-3333-3333-333333333333') = 1);
select pg_temp.check('and not solving it is none of one — four of six letters is not four sixths',
  (select points from public.item_points(((select v->>'id' from t where k='q'))::uuid)
   where user_id = '44444444-4444-4444-4444-444444444444') = 0);
select pg_temp.check('the person who solved it is the first correct',
  (public.item_winner(((select v->>'id' from t where k='q'))::uuid)->>'name') = 'Ada');
select pg_temp.check('and it is on the board',
  (select (e->>'points')::numeric from jsonb_array_elements(
     (public.session_leaderboard(((select v->>'id' from t where k='sess'))::uuid))->'standings') e
   where e->>'name' = 'Ada') = 1);

-- ---------------------------------------------------------------------------
-- A board survives being played
--
-- Reported from a session: the word game "expired after one wrong guess". The
-- clock had nothing to do with it. Every other kind answers once, so open mode
-- read "has a row in responses" as "this one is behind them" — and a word game
-- writes a row per guess, which is how a half-played board survives a reload.
-- So the five-second poll served the next question instead, and the board went
-- away mid-round.
-- ---------------------------------------------------------------------------
set session "test.uid" = '11111111-1111-1111-1111-111111111111';
insert into t select 'open', public.create_session('Played at their own pace', 'strict', 'open', true);
insert into t select 'og', public.save_item(
  ((select v->>'id' from t where k='open'))::uuid, null, 'game', 'Guess the word',
  '{"slug":"guess","tries":6}'::jsonb, '{"word":"OWNERS"}'::jsonb);
insert into t select 'after', public.save_item(
  ((select v->>'id' from t where k='open'))::uuid, null, 'survey', 'And afterwards?',
  '{"options":["yes","no"]}'::jsonb, null);
select public.advance_session(((select v->>'id' from t where k='open'))::uuid, 'start');
insert into public.words (word, len, sorted) values ('planet', 6, 'aelnpt')
on conflict do nothing;

set session "test.uid" = '33333333-3333-3333-3333-333333333333';
select pg_temp.check('the board is what gets served first',
  (public.current_item(((select v->>'id' from t where k='open'))::uuid)->>'prompt')
    = 'Guess the word');
select pg_temp.check('a wrong guess is taken',
  (public.guess_word(((select v->>'id' from t where k='og'))::uuid, 'planet')->>'ok') = 'true');
-- The check that would have caught it.
select pg_temp.check('and the board is still the question in front of them',
  (public.current_item(((select v->>'id' from t where k='open'))::uuid)->>'prompt')
    = 'Guess the word');
select pg_temp.check('and it still counts as the one they are on, not one behind',
  (public.current_item(((select v->>'id' from t where k='open'))::uuid)->>'done')::int = 0);

select public.guess_word(((select v->>'id' from t where k='og'))::uuid, 'owners');
select pg_temp.check('solving it does move them on',
  (public.current_item(((select v->>'id' from t where k='open'))::uuid)->>'prompt')
    = 'And afterwards?');

-- Running out of guesses is the other way a board finishes.
set session "test.uid" = '11111111-1111-1111-1111-111111111111';
insert into t select 'open2', public.create_session('Out of guesses', 'strict', 'open', true);
insert into t select 'og2', public.save_item(
  ((select v->>'id' from t where k='open2'))::uuid, null, 'game', 'Guess again',
  '{"slug":"guess","tries":2}'::jsonb, '{"word":"OWNERS"}'::jsonb);
insert into t select 'after2', public.save_item(
  ((select v->>'id' from t where k='open2'))::uuid, null, 'survey', 'Done?',
  '{"options":["yes"]}'::jsonb, null);
select public.advance_session(((select v->>'id' from t where k='open2'))::uuid, 'start');
set session "test.uid" = '33333333-3333-3333-3333-333333333333';
select public.current_item(((select v->>'id' from t where k='open2'))::uuid);
select public.guess_word(((select v->>'id' from t where k='og2'))::uuid, 'planet');
select pg_temp.check('one of two guesses leaves them on the board',
  (public.current_item(((select v->>'id' from t where k='open2'))::uuid)->>'prompt')
    = 'Guess again');
select public.guess_word(((select v->>'id' from t where k='og2'))::uuid, 'planet');
select pg_temp.check('and running out of them moves them on',
  (public.current_item(((select v->>'id' from t where k='open2'))::uuid)->>'prompt') = 'Done?');

set session "test.uid" = '';
select pg_temp.check('anon may not guess',
  not has_function_privilege('anon', 'public.guess_word(uuid, text)', 'execute'));
select pg_temp.check('nor read the board',
  not has_function_privilege('anon', 'public.game_state(uuid)', 'execute'));

\echo '--- word game checks passed ---'
