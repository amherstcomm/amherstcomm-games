-- Matching, guessing and ranking.
--
-- Two of them mark like the multiple-answer question — a fraction for the part
-- you got — and one does not mark at all in the ordinary sense: "closest wins"
-- is a comparison between the room's answers, so it cannot be decided by
-- looking at any single one. These cover both, and the awkward middle where a
-- question was answered in a shape nobody expected.
\set ON_ERROR_STOP on

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'editor@example.com'),
  ('33333333-3333-3333-3333-333333333333', 'ada@example.com'),
  ('44444444-4444-4444-4444-444444444444', 'grace@example.com'),
  ('55555555-5555-5555-5555-555555555555', 'alan@example.com')
on conflict do nothing;
insert into public.role_grants (user_id, role)
values ('11111111-1111-1111-1111-111111111111', 'games.edit')
on conflict do nothing;
insert into public.profiles (id, display_name) values
  ('33333333-3333-3333-3333-333333333333', 'Ada'),
  ('44444444-4444-4444-4444-444444444444', 'Grace'),
  ('55555555-5555-5555-5555-555555555555', 'Alan')
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

-- ---------------------------------------------------------------------------
-- Reading a number out of whatever arrived
-- ---------------------------------------------------------------------------
select pg_temp.check('a JSON number is a number',
  public.as_number('41.5'::jsonb) = 41.5);
select pg_temp.check('so is one that arrived as a string',
  public.as_number('"41.5"'::jsonb) = 41.5);
select pg_temp.check('and a negative one',
  public.as_number('-3'::jsonb) = -3);
select pg_temp.check('words are not a number, and do not raise',
  public.as_number('"about forty"'::jsonb) is null);
select pg_temp.check('nor is nothing at all',
  public.as_number(null) is null and public.as_number('null'::jsonb) is null);

-- ---------------------------------------------------------------------------
-- Matching: pairs right over pairs there were
-- ---------------------------------------------------------------------------
select pg_temp.check('every pair right is the whole question',
  public.match_score('{"pairs":{"Ada":"Analyst","Grace":"Teacher"}}'::jsonb,
                     '{"Ada":"Analyst","Grace":"Teacher"}'::jsonb) = 1);
select pg_temp.check('one of two is half',
  public.match_score('{"pairs":{"Ada":"Analyst","Grace":"Teacher"}}'::jsonb,
                     '{"Ada":"Analyst","Grace":"Analyst"}'::jsonb) = 0.5);
select pg_temp.check('a pair left blank simply is not right',
  public.match_score('{"pairs":{"Ada":"Analyst","Grace":"Teacher"}}'::jsonb,
                     '{"Ada":"Analyst"}'::jsonb) = 0.5);
select pg_temp.check('answering something that was not asked cannot add to it',
  public.match_score('{"pairs":{"Ada":"Analyst"}}'::jsonb,
                     '{"Ada":"Analyst","Nobody":"Anything"}'::jsonb) = 1);
select pg_temp.check('nothing right is nothing',
  public.match_score('{"pairs":{"Ada":"Analyst","Grace":"Teacher"}}'::jsonb,
                     '{"Ada":"Teacher","Grace":"Analyst"}'::jsonb) = 0);
select pg_temp.check('a malformed answer or response scores nothing rather than erroring',
  public.match_score('{"pairs":[]}'::jsonb, '{"a":"b"}'::jsonb) = 0
  and public.match_score('{"pairs":{"a":"b"}}'::jsonb, '"nonsense"'::jsonb) = 0
  and public.match_score('{"pairs":{}}'::jsonb, '{}'::jsonb) = 0
  and public.match_score(null, '{"a":"b"}'::jsonb) = 0);

-- ---------------------------------------------------------------------------
-- Ranking: positions right over positions there were
-- ---------------------------------------------------------------------------
select pg_temp.check('the right order is the whole question',
  public.rank_score('{"order":["a","b","c"]}'::jsonb, '["a","b","c"]'::jsonb) = 1);
select pg_temp.check('one in the right place out of three is a third',
  round(public.rank_score('{"order":["a","b","c"]}'::jsonb, '["a","c","b"]'::jsonb), 2) = 0.33);
select pg_temp.check('the reverse of a three-item order still has its middle',
  round(public.rank_score('{"order":["a","b","c"]}'::jsonb, '["c","b","a"]'::jsonb), 2) = 0.33);
select pg_temp.check('and the reverse of a two-item one has nothing',
  public.rank_score('{"order":["a","b"]}'::jsonb, '["b","a"]'::jsonb) = 0);
select pg_temp.check('a short answer scores the places it did fill',
  round(public.rank_score('{"order":["a","b","c"]}'::jsonb, '["a"]'::jsonb), 2) = 0.33);
select pg_temp.check('a malformed one scores nothing rather than erroring',
  public.rank_score('{"order":"abc"}'::jsonb, '["a"]'::jsonb) = 0
  and public.rank_score('{"order":["a"]}'::jsonb, '"a"'::jsonb) = 0
  and public.rank_score('{"order":[]}'::jsonb, '[]'::jsonb) = 0);

-- ---------------------------------------------------------------------------
-- A round with one of each
-- ---------------------------------------------------------------------------
create temp table t (k text primary key, v jsonb);
set session "test.uid" = '11111111-1111-1111-1111-111111111111';
insert into t select 'sess', public.create_session('One of each');

insert into t select 'qm', public.save_item(
  ((select v->>'id' from t where k='sess'))::uuid, null, 'match',
  'Match the person to their first job',
  '{"left":["Ada","Grace"],"right":["Analyst","Teacher"]}'::jsonb,
  '{"pairs":{"Ada":"Analyst","Grace":"Teacher"}}'::jsonb);
insert into t select 'qn', public.save_item(
  ((select v->>'id' from t where k='sess'))::uuid, null, 'number',
  'What was the share price at close?',
  '{"unit":"dollars"}'::jsonb, '{"value":41.5}'::jsonb);
insert into t select 'qr', public.save_item(
  ((select v->>'id' from t where k='sess'))::uuid, null, 'rank',
  'Put these in order of founding',
  '{"options":["a","b","c"]}'::jsonb, '{"order":["a","b","c"]}'::jsonb);

select pg_temp.check('all three kinds save',
  (select v->>'ok' from t where k='qm') = 'true'
  and (select v->>'ok' from t where k='qn') = 'true'
  and (select v->>'ok' from t where k='qr') = 'true');
select pg_temp.check('and their answers are stored where the room cannot reach them',
  (select count(*) from public.item_answers where item_id in (
     ((select v->>'id' from t where k='qm'))::uuid,
     ((select v->>'id' from t where k='qn'))::uuid,
     ((select v->>'id' from t where k='qr'))::uuid)) = 3);

-- ---------------------------------------------------------------------------
-- The answer must not be in the question
--
-- current_item() sends the payload to the room. For a ranking question the
-- payload is the list to be ordered, and the author types it in the correct
-- order because that is how the answer gets written — so stored as typed, the
-- correct order is on everybody's screen and the question is "press send".
-- ---------------------------------------------------------------------------
select pg_temp.check('a ranking question is not stored in its answer order',
  (select payload -> 'options' from public.items
   where id = ((select v->>'id' from t where k='qr'))::uuid)
    <> '["a","b","c"]'::jsonb);
select pg_temp.check('but it is still the same options',
  (select jsonb_array_length(payload -> 'options') from public.items
   where id = ((select v->>'id' from t where k='qr'))::uuid) = 3
  and (select payload -> 'options' @> '["a","b","c"]'::jsonb from public.items
       where id = ((select v->>'id' from t where k='qr'))::uuid));
select pg_temp.check('the left-hand column of a match is left alone — it is the question',
  (select payload -> 'left' from public.items
   where id = ((select v->>'id' from t where k='qm'))::uuid) = '["Ada","Grace"]'::jsonb);
select pg_temp.check('and the right-hand one still holds every option',
  (select payload -> 'right' @> '["Analyst","Teacher"]'::jsonb from public.items
   where id = ((select v->>'id' from t where k='qm'))::uuid));

-- shuffled() itself, including the case that made it necessary
select pg_temp.check('a two-item list never comes back in the order it must not be in',
  (select bool_and(public.shuffled('["a","b"]'::jsonb, '["a","b"]'::jsonb)
                     <> '["a","b"]'::jsonb)
   from generate_series(1, 40)));
select pg_temp.check('a list of one is left alone rather than fussed over',
  public.shuffled('["a"]'::jsonb) = '["a"]'::jsonb);
select pg_temp.check('and something that is not a list is returned untouched',
  public.shuffled('"a"'::jsonb) = '"a"'::jsonb);
select pg_temp.check('a shuffle keeps every item exactly once',
  (select bool_and(
     (select count(*) from jsonb_array_elements_text(public.shuffled('["a","b","c","d"]'::jsonb))) = 4
     and public.shuffled('["a","b","c","d"]'::jsonb) @> '["a","b","c","d"]'::jsonb)
   from generate_series(1, 20)));

select public.advance_session(((select v->>'id' from t where k='sess'))::uuid, 'start');

-- Matching: Ada both, Grace one, Alan none.
select public.advance_session(((select v->>'id' from t where k='sess'))::uuid, 'show',
  ((select v->>'id' from t where k='qm'))::uuid);
update public.items set opened_at = '2026-10-01 12:00:00+00'
where id = ((select v->>'id' from t where k='qm'))::uuid;
insert into public.responses (item_id, user_id, value, submitted_at) values
  (((select v->>'id' from t where k='qm'))::uuid, '33333333-3333-3333-3333-333333333333', '{"Ada":"Analyst","Grace":"Teacher"}', '2026-10-01 12:00:05+00'),
  (((select v->>'id' from t where k='qm'))::uuid, '44444444-4444-4444-4444-444444444444', '{"Ada":"Analyst","Grace":"Analyst"}', '2026-10-01 12:00:03+00'),
  (((select v->>'id' from t where k='qm'))::uuid, '55555555-5555-5555-5555-555555555555', '{"Ada":"Teacher","Grace":"Analyst"}', '2026-10-01 12:00:01+00');
select public.advance_session(((select v->>'id' from t where k='sess'))::uuid, 'reveal',
  ((select v->>'id' from t where k='qm'))::uuid);

select pg_temp.check('matching pays the pairs you got',
  (select points from public.item_points(((select v->>'id' from t where k='qm'))::uuid)
   where user_id = '44444444-4444-4444-4444-444444444444') = 0.5);
select pg_temp.check('and the person who got it all is the first correct',
  (public.item_winner(((select v->>'id' from t where k='qm'))::uuid)->>'name') = 'Ada');

-- Guessing: actual 41.5. Grace closest at 41, Ada 45, Alan words.
select public.advance_session(((select v->>'id' from t where k='sess'))::uuid, 'show',
  ((select v->>'id' from t where k='qn'))::uuid);
update public.items set opened_at = '2026-10-01 12:01:00+00'
where id = ((select v->>'id' from t where k='qn'))::uuid;
insert into public.responses (item_id, user_id, value, submitted_at) values
  (((select v->>'id' from t where k='qn'))::uuid, '33333333-3333-3333-3333-333333333333', '45', '2026-10-01 12:01:02+00'),
  (((select v->>'id' from t where k='qn'))::uuid, '44444444-4444-4444-4444-444444444444', '41', '2026-10-01 12:01:08+00'),
  (((select v->>'id' from t where k='qn'))::uuid, '55555555-5555-5555-5555-555555555555', '"lots"', '2026-10-01 12:01:01+00');
select public.advance_session(((select v->>'id' from t where k='sess'))::uuid, 'reveal',
  ((select v->>'id' from t where k='qn'))::uuid);

select pg_temp.check('the closest guess takes the question',
  (select points from public.item_points(((select v->>'id' from t where k='qn'))::uuid)
   where user_id = '44444444-4444-4444-4444-444444444444') = 1);
select pg_temp.check('and a nearby one takes nothing — closest wins, not close',
  (select points from public.item_points(((select v->>'id' from t where k='qn'))::uuid)
   where user_id = '33333333-3333-3333-3333-333333333333') = 0);
select pg_temp.check('an answer that is not a number cannot be the closest',
  (select points from public.item_points(((select v->>'id' from t where k='qn'))::uuid)
   where user_id = '55555555-5555-5555-5555-555555555555') = 0);
select pg_temp.check('the closest guess is the first correct, even though she was slowest',
  (public.item_winner(((select v->>'id' from t where k='qn'))::uuid)->>'name') = 'Grace');

set session "test.uid" = '11111111-1111-1111-1111-111111111111';
insert into t select 'sum', public.number_summary(((select v->>'id' from t where k='qn'))::uuid);
select pg_temp.check('the presenter gets the shape of the guesses, not fifty bars',
  (select (v->>'guesses')::int from t where k='sum') = 2
  and (select (v->>'lowest')::numeric from t where k='sum') = 41
  and (select (v->>'highest')::numeric from t where k='sum') = 45
  and (select (v->>'average')::numeric from t where k='sum') = 43);
select pg_temp.check('and the actual value, now it is revealed',
  (select (v->>'answer')::numeric from t where k='sum') = 41.5);

-- Ranking: Ada exact, Grace one place right, Alan reversed.
select public.advance_session(((select v->>'id' from t where k='sess'))::uuid, 'show',
  ((select v->>'id' from t where k='qr'))::uuid);
update public.items set opened_at = '2026-10-01 12:02:00+00'
where id = ((select v->>'id' from t where k='qr'))::uuid;
insert into public.responses (item_id, user_id, value, submitted_at) values
  (((select v->>'id' from t where k='qr'))::uuid, '33333333-3333-3333-3333-333333333333', '["a","b","c"]', '2026-10-01 12:02:04+00'),
  (((select v->>'id' from t where k='qr'))::uuid, '44444444-4444-4444-4444-444444444444', '["a","c","b"]', '2026-10-01 12:02:02+00'),
  (((select v->>'id' from t where k='qr'))::uuid, '55555555-5555-5555-5555-555555555555', '["c","b","a"]', '2026-10-01 12:02:03+00');
select public.advance_session(((select v->>'id' from t where k='sess'))::uuid, 'reveal',
  ((select v->>'id' from t where k='qr'))::uuid);

select pg_temp.check('the right order is a whole question',
  (select points from public.item_points(((select v->>'id' from t where k='qr'))::uuid)
   where user_id = '33333333-3333-3333-3333-333333333333') = 1);
select pg_temp.check('and a third of it is a third',
  round((select points from public.item_points(((select v->>'id' from t where k='qr'))::uuid)
         where user_id = '44444444-4444-4444-4444-444444444444'), 2) = 0.33);

-- ---------------------------------------------------------------------------
-- The board, over all three
-- ---------------------------------------------------------------------------
insert into t select 'board', public.session_leaderboard(((select v->>'id' from t where k='sess'))::uuid);
select pg_temp.check('three questions counted',
  (select (v->>'scored')::int from t where k='board') = 3);
select pg_temp.check('Ada leads on two — the match and the order, but not the guess',
  (select (e->>'points')::numeric from jsonb_array_elements(
     (select v->'standings' from t where k='board')) e where e->>'name' = 'Ada') = 2);
select pg_temp.check('and a whole two reads as 2, not 2.00',
  (select e->>'points' from jsonb_array_elements(
     (select v->'standings' from t where k='board')) e where e->>'name' = 'Ada') = '2');
select pg_temp.check('Grace has half the pairs, the closest guess, and a third of the order',
  (select (e->>'points')::numeric from jsonb_array_elements(
     (select v->'standings' from t where k='board')) e where e->>'name' = 'Grace') = 1.83);
-- Alan reversed the order, which in a list of three still leaves the middle
-- one where it belongs — asserted directly a few checks above, and worth
-- seeing again on the board, because "I got nothing right" and "I got a third"
-- are different conversations.
select pg_temp.check('Alan keeps a third for the middle of a reversed order',
  (select (e->>'points')::numeric from jsonb_array_elements(
     (select v->'standings' from t where k='board')) e where e->>'name' = 'Alan') = 0.33);
select pg_temp.check('and is last regardless',
  (select (e->>'place')::int from jsonb_array_elements(
     (select v->'standings' from t where k='board')) e where e->>'name' = 'Alan') = 3);
select pg_temp.check('and the tiebreak time only counts questions worth something',
  (select (e->>'seconds')::numeric from jsonb_array_elements(
     (select v->'standings' from t where k='board')) e where e->>'name' = 'Ada') = 9);

set session "test.uid" = '44444444-4444-4444-4444-444444444444';
select pg_temp.check('and a player is told her own fraction of it',
  (public.my_standing(((select v->>'id' from t where k='sess'))::uuid)->>'points')::numeric = 1.83);
select pg_temp.check('a player cannot read the guess summary',
  (public.number_summary(((select v->>'id' from t where k='qn'))::uuid)->>'ok') = 'false');
select pg_temp.check('nor call item_points at all',
  not has_function_privilege('authenticated', 'public.item_points(uuid)', 'execute'));

\echo '--- kinds checks passed ---'
