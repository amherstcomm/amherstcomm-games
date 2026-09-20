-- Hints a round's board issues.
--
-- Weave's board breaks a tie on the fewest hints, so the count has to be one
-- the person it scores cannot edit. On a round board the server gives the
-- hint and counts it, and the board reads its own count -- not the number the
-- browser wrote into its result, which is the thing being defended against.
--
-- What is NOT claimed here: that a hint was earned. The bank of banked words
-- is checked in the page against a dictionary the server does not hold. The
-- claim is only that a hint taken cannot be denied.
\set ON_ERROR_STOP on

create or replace function pg_temp.check(label text, got boolean) returns void
language plpgsql as $$
begin
  raise notice '%  %', case when got is true then 'PASS' else 'FAIL' end, label;
  if got is not true then raise exception 'failed: %', label; end if;
end $$;

create or replace function pg_temp.d(n int) returns date
language sql as $$ select public.puzzle_day() + n $$;

insert into auth.users (id, email) values
  ('f9000000-0000-0000-0000-000000000001', 'hint.editor@amherstcomm.net'),
  ('f9000000-0000-0000-0000-000000000002', 'hattie.hinter@amherstcomm.net'),
  ('f9000000-0000-0000-0000-000000000003', 'harold.honest@amherstcomm.net')
on conflict do nothing;
insert into public.role_grants (user_id, role)
values ('f9000000-0000-0000-0000-000000000001', 'games.edit')
on conflict do nothing;

-- A tournament whose round is on today, playing weave.
set session "test.uid" = 'f9000000-0000-0000-0000-000000000001';
create temp table ht as
  select (public.save_tournament(null, 'Hint Cup', 'hard', pg_temp.d(-1), pg_temp.d(8))->>'id')::uuid id;
select public.save_round(null, (select id from ht), pg_temp.d(-1), pg_temp.d(5), array['weave']);
create temp table hr as
  select id, starts_on from public.tournament_rounds where tournament_id = (select id from ht);

-- Its board, published the way the nightly window publishes one: the answers
-- ride along base64'd under the difficulty being played.
insert into public.daily_puzzles (puzzle_date, env, game, payload)
select (select starts_on from hr), 'round', 'weave',
  jsonb_build_object(
    'date', (select starts_on from hr),
    'byDifficulty', jsonb_build_object('hard', jsonb_build_object(
      'clue', 'Ownership',
      'cols', 6,
      'board', jsonb_build_array('abcdef'),
      'answers', encode(convert_to(jsonb_build_object(
        'spangram', jsonb_build_object('w', 'OWNERSHIP', 'path', '[]'::jsonb),
        'words', jsonb_build_array(
          jsonb_build_object('w', 'SHARE', 'path', '[]'::jsonb),
          jsonb_build_object('w', 'STAKE', 'path', '[]'::jsonb))
      )::text, 'UTF8'), 'base64'))))
on conflict (puzzle_date, env, game) do update set payload = excluded.payload;

-- ---------------------------------------------------------------------------
-- Giving one out
-- ---------------------------------------------------------------------------
set session "test.uid" = 'f9000000-0000-0000-0000-000000000002';
create temp table gave as select public.take_round_hint('weave') j;
select pg_temp.check('a hint comes back with a word off the round board',
  (select j->>'ok' from gave) = 'true'
  and (select j->>'target' from gave) in ('SHARE', 'STAKE', 'OWNERSHIP'));
select pg_temp.check('and the server counted it',
  (select (j->>'taken')::int from gave) = 1
  and public.round_hints_taken('f9000000-0000-0000-0000-000000000002', 'weave',
                               (select starts_on from hr)) = 1);

-- A reload asks again for a hint it is already showing. That is the same help,
-- not more of it.
select pg_temp.check('asking again for the same unfound word does not charge twice',
  (public.take_round_hint('weave')->>'target') = (select j->>'target' from gave)
  and public.round_hints_taken('f9000000-0000-0000-0000-000000000002', 'weave',
                               (select starts_on from hr)) = 1);

-- Once that word is found, the next ask is a new hint.
insert into public.daily_progress (user_id, game, variant, difficulty, puzzle_date, env, state, completed, result)
values ('f9000000-0000-0000-0000-000000000002', 'weave', '', 'hard', (select starts_on from hr), 'round',
        jsonb_build_object('found', jsonb_build_array((select j->>'target' from gave))), false, null)
on conflict (user_id, game, variant, difficulty, puzzle_date, env)
do update set state = excluded.state;
select pg_temp.check('with it found, the next ask is another hint',
  (public.take_round_hint('weave')->>'taken')::int = 2);

select pg_temp.check('what the page asks for on a reload is what it was given',
  (public.my_round_hints('weave')->>'taken')::int = 2
  and jsonb_array_length(public.my_round_hints('weave')->'targets') = 2);

-- A word already given and still unfound comes back free however often it is
-- asked for -- so this ask is the second hint again, not a third -- and the
-- board only runs out once everything it gave has been found.
select pg_temp.check('a hint still on screen is not charged for again',
  (public.take_round_hint('weave')->>'taken')::int = 2);
update public.daily_progress
   set state = jsonb_build_object('found', jsonb_build_array('SHARE', 'STAKE', 'OWNERSHIP'))
 where user_id = 'f9000000-0000-0000-0000-000000000002' and game = 'weave' and env = 'round';
select pg_temp.check('and with all of them found, the board has nothing left to give',
  (public.take_round_hint('weave')->>'reason') = 'there is nothing left to hint'
  and public.round_hints_taken('f9000000-0000-0000-0000-000000000002', 'weave',
                               (select starts_on from hr)) = 2);

-- ---------------------------------------------------------------------------
-- What the board counts
-- ---------------------------------------------------------------------------
-- Both solve it in the same time. Hattie took hints and her browser says she
-- took none; Harold took none and says so. The tie falls to the hints, and the
-- server's count is the one that decides it.
update public.daily_progress
   set completed = true,
       result = '{"solved": true, "timeMs": 120000, "hints": 0}'::jsonb
 where user_id = 'f9000000-0000-0000-0000-000000000002' and game = 'weave' and env = 'round';
insert into public.daily_progress (user_id, game, variant, difficulty, puzzle_date, env, state, completed, result)
values ('f9000000-0000-0000-0000-000000000003', 'weave', '', 'hard', (select starts_on from hr), 'round',
        '{}'::jsonb, true, '{"solved": true, "timeMs": 120000, "hints": 0}'::jsonb)
on conflict do nothing;

create or replace function pg_temp.board() returns text[]
language sql as $$
  select coalesce(array(
    select x->>'name'
    from jsonb_array_elements(
      public.boards_between((select starts_on from hr), (select starts_on from hr),
                            'round', 'hard', null, 50)->'weave') x
    where x->>'name' like 'H%'), '{}')
$$;

select pg_temp.check('a browser claiming no hints does not win the tie',
  pg_temp.board() = array['Harold Honest', 'Hattie Hinter']);
select pg_temp.check('and the board shows the count the server kept, not the one sent',
  (select (x->>'hints')::int from jsonb_array_elements(
     public.boards_between((select starts_on from hr), (select starts_on from hr),
                           'round', 'hard', null, 50)->'weave') x
   where x->>'name' = 'Hattie Hinter') = 2);

-- ---------------------------------------------------------------------------
-- Who may, and when
-- ---------------------------------------------------------------------------
select pg_temp.check('a game the round does not list has no hints to give',
  (public.take_round_hint('hive')->>'reason') = 'that game is not in this round');

reset "test.uid";
select pg_temp.check('and nobody signed out is given one',
  (public.take_round_hint('weave')->>'reason') = 'not signed in');
select pg_temp.check('anon cannot ask at all',
  not has_function_privilege('anon', 'public.take_round_hint(text)', 'execute'));
select pg_temp.check('and no browser may read or write the count directly',
  not has_table_privilege('authenticated', 'public.round_hints', 'select')
  and not has_table_privilege('authenticated', 'public.round_hints', 'update')
  and not has_function_privilege('authenticated', 'public.round_hints_taken(uuid, text, date)', 'execute'));

-- Leave the database as it was: a round covering today would collide with the
-- rounds every later file sets up.
delete from public.tournaments where id = (select id from ht);
select pg_temp.check('with the tournament gone, there is no round to hint',
  (public.take_round_hint('weave')->>'reason') = 'not signed in');

\echo '--- round hint checks passed ---'
