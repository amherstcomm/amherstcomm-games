-- A clue for a round's Guess the Word.
--
-- Asked for: a pinned round word can carry a clue, which a player asks for,
-- at a cost. What has to hold: only an organiser sets one, only on a round's
-- Guess pin; a player sees that a clue exists but not what it says until they
-- take it; taking it is recorded once and counted on the board, between the
-- fewest guesses and the clock; and there is no clue for a board that is not
-- the pinned word, or once the board is finished.
\set ON_ERROR_STOP on

insert into auth.users (id, email) values
  ('0c000000-0000-0000-0000-000000000001', 'clue.organiser@example.com'),
  ('0c000000-0000-0000-0000-000000000002', 'ada.clue@example.com'),
  ('0c000000-0000-0000-0000-000000000003', 'bea.clue@example.com')
on conflict do nothing;
insert into public.role_grants (user_id, role)
values ('0c000000-0000-0000-0000-000000000001', 'games.edit')
on conflict do nothing;
insert into public.profiles (id, display_name) values
  ('0c000000-0000-0000-0000-000000000002', 'Ada Clue'),
  ('0c000000-0000-0000-0000-000000000003', 'Bea Clue')
on conflict (id) do update set display_name = excluded.display_name;

create or replace function pg_temp.check(label text, got boolean) returns void
language plpgsql as $$
begin
  raise notice '%  %', case when got is true then 'PASS' else 'FAIL' end, label;
  if got is not true then raise exception 'failed: %', label; end if;
end $$;

create or replace function pg_temp.d(n int) returns date
language sql as $$ select public.puzzle_day() + n $$;

-- A won Guess board on the round. No guesses in the state: the board is
-- checked against them when they are there, and this one is about the count.
create or replace function pg_temp.won(who uuid, guesses int, ms int) returns void
language sql as $$
  insert into public.daily_progress (user_id, game, variant, difficulty, puzzle_date, env, state, completed, result)
  values (who, 'guess', '6', 'hard', public.puzzle_day(), 'round',
          '{}'::jsonb, true,
          jsonb_build_object('won', true, 'guesses', guesses, 'timeMs', ms, 'length', 6))
  on conflict do nothing
$$;

create temp table t (k text primary key, v jsonb);

set session "test.uid" = '0c000000-0000-0000-0000-000000000001';
select public.save_tournament(null, 'Clue Cup', 'hard', pg_temp.d(-3), pg_temp.d(10));
insert into t select 'round', public.save_round(null,
  (select id from public.tournaments where name = 'Clue Cup'), pg_temp.d(-1), pg_temp.d(1),
  array['words'], '[]'::jsonb, null, '{}'::jsonb, '[]'::jsonb, array['words']);
-- Pinned before the round began, as an organiser would; the day it is for
-- is today now.
update public.tournament_rounds set starts_on = pg_temp.d(-1)
 where id = (select (v->>'id')::uuid from t where k = 'round');
insert into public.puzzle_pins (on_date, env, game, difficulty, choice, created_by)
values (pg_temp.d(0), 'round', 'guess', null, '{"word": "owners"}'::jsonb, '0c000000-0000-0000-0000-000000000001');
-- Today's board: the pinned word, and only it.
insert into public.daily_puzzles (puzzle_date, env, game, payload) values
  (pg_temp.d(0), 'round', 'words', jsonb_build_object('date', pg_temp.d(0), 'byDifficulty',
     jsonb_build_object('hard', jsonb_build_object('words', jsonb_build_object('6', encode(convert_to('owners', 'UTF8'), 'base64'))))))
on conflict (puzzle_date, env, game) do update set payload = excluded.payload;

-- ---------------------------------------------------------------------------
-- Setting one
-- ---------------------------------------------------------------------------
-- Separate statements: a check in the same statement as the change it checks
-- reads the database as it was before.
insert into t select 'set', public.set_pin_clue(
  (select id from public.puzzle_pins where on_date = pg_temp.d(0) and env = 'round' and game = 'guess'),
  '  What every employee-owner holds  ');
select pg_temp.check('a clue is set on a round''s Guess pin',
  (select v->>'ok' from t where k = 'set') = 'true'
  and (select choice->>'clue' from public.puzzle_pins where on_date = pg_temp.d(0) and env = 'round' and game = 'guess')
      = 'What every employee-owner holds');
insert into public.puzzle_pins (on_date, env, game, difficulty, choice)
values (pg_temp.d(5), 'daily', 'guess', null, '{"word": "voting"}'::jsonb);
select pg_temp.check('and not on the daily''s',
  public.set_pin_clue((select id from public.puzzle_pins where on_date = pg_temp.d(5) and env = 'daily' and game = 'guess'),
    'x')->>'reason' = 'a clue is for a tournament round''s Guess the Word');

set session "test.uid" = '0c000000-0000-0000-0000-000000000002';
select pg_temp.check('a player cannot set one',
  public.set_pin_clue((select id from public.puzzle_pins where on_date = pg_temp.d(0) and env = 'round' and game = 'guess'),
    'x')->>'reason' = 'not allowed');

-- ---------------------------------------------------------------------------
-- Taking it
-- ---------------------------------------------------------------------------
insert into t select 'look', public.round_clue('words');
select pg_temp.check('a player is told there is a clue, but not what it says',
  (select v from t where k = 'look') = '{"ok": true, "available": true, "taken": false, "clue": null}'::jsonb);
insert into t select 'take', public.round_clue('words', true);
select pg_temp.check('taking it gives it',
  (select v->>'clue' from t where k = 'take') = 'What every employee-owner holds');
select public.round_clue('words', true);
select pg_temp.check('and is recorded once, however often it is asked for',
  (select taken from public.round_hints where user_id = '0c000000-0000-0000-0000-000000000002'
     and game = 'guess' and puzzle_date = pg_temp.d(0)) = 1);
select pg_temp.check('another game has no clue',
  public.round_clue('hive') = '{"ok": true, "available": false}'::jsonb);

-- Ada took the clue and won in three; Bea won in three without it, slower.
select pg_temp.won('0c000000-0000-0000-0000-000000000002', 3, 20000);
select pg_temp.won('0c000000-0000-0000-0000-000000000003', 3, 90000);
set session "test.uid" = '0c000000-0000-0000-0000-000000000003';
select pg_temp.check('once the board is finished, the clue is not taken',
  public.round_clue('words', true)->>'reason' = 'you have finished this board'
  and not exists (select 1 from public.round_hints where user_id = '0c000000-0000-0000-0000-000000000003'));

insert into t select 'board', public.boards_between(pg_temp.d(0), pg_temp.d(0), 'round', 'hard',
  array['0c000000-0000-0000-0000-000000000002', '0c000000-0000-0000-0000-000000000003']::uuid[]);
select pg_temp.check('the clue counts against a win: same guesses, and the one without it places first',
  (select v->'guess'->0->>'name' from t where k = 'board') = 'Bea Clue'
  and (select (v->'guess'->1->>'clues')::int from t where k = 'board') = 1
  and (select (v->'guess'->0->>'clues')::int from t where k = 'board') = 0);

-- ---------------------------------------------------------------------------
-- No clue for a board that is not the pinned word
-- ---------------------------------------------------------------------------
update public.daily_puzzles
   set payload = jsonb_set(payload, '{byDifficulty,hard,words}',
                           jsonb_build_object('6', encode(convert_to('shares', 'UTF8'), 'base64')))
 where puzzle_date = pg_temp.d(0) and env = 'round' and game = 'words';
set session "test.uid" = '0c000000-0000-0000-0000-000000000002';
select pg_temp.check('a board that fell back to its own draw has no clue',
  public.round_clue('words') = '{"ok": true, "available": false}'::jsonb);

-- ---------------------------------------------------------------------------
-- Clues that come with a word list
-- ---------------------------------------------------------------------------
set session "test.uid" = '0c000000-0000-0000-0000-000000000001';
insert into t select 'list', public.save_word_list(null, 'Clue list', 'stock shares equity',
  null, null, pg_temp.d(-1), pg_temp.d(1), '{"stock": "The S in ESOP", "equity": "  Your piece, in a word  "}'::jsonb);
select pg_temp.check('a list keeps the clues it was saved with',
  (select jsonb_object_agg(word, clue) from public.word_list_entries
   where list_id = (select (v->>'id')::uuid from t where k = 'list') and clue is not null)
    = '{"stock": "The S in ESOP", "equity": "Your piece, in a word"}'::jsonb);
-- Saved again from the editor, which knows words and not clues, without
-- equity: the clue for stock stays, equity's goes with the word.
select public.save_word_list((select (v->>'id')::uuid from t where k = 'list'), 'Clue list', 'stock shares growth',
  null, null, pg_temp.d(-1), pg_temp.d(1));
select pg_temp.check('and a save that does not mention clues keeps them for the words still in it',
  (select jsonb_object_agg(word, clue) from public.word_list_entries
   where list_id = (select (v->>'id')::uuid from t where k = 'list') and clue is not null)
    = '{"stock": "The S in ESOP"}'::jsonb);

-- An unpinned board: a word at every length. The clue is the one for the
-- word at the length being played, from its list.
delete from public.puzzle_pins where on_date = pg_temp.d(0) and env = 'round' and game = 'guess';
delete from public.round_hints where user_id = '0c000000-0000-0000-0000-000000000002';
-- mid-board again: a finished board takes no clue
delete from public.daily_progress where user_id = '0c000000-0000-0000-0000-000000000002';
update public.daily_puzzles
   set payload = jsonb_set(payload, '{byDifficulty,hard,words}', jsonb_build_object(
         '5', encode(convert_to('stock', 'UTF8'), 'base64'),
         '6', encode(convert_to('shares', 'UTF8'), 'base64')))
 where puzzle_date = pg_temp.d(0) and env = 'round' and game = 'words';
set session "test.uid" = '0c000000-0000-0000-0000-000000000002';
select pg_temp.check('an unpinned board offers its list''s clue for the word at that length',
  public.round_clue('words', false, 5) = '{"ok": true, "available": true, "taken": false, "clue": null}'::jsonb
  and public.round_clue('words', false, 6) = '{"ok": true, "available": false}'::jsonb);
insert into t select 'listtake', public.round_clue('words', true, 5);
select pg_temp.check('and gives it when taken',
  (select v->>'clue' from t where k = 'listtake') = 'The S in ESOP');

-- A clue written on the round's pin wins over the list's, for that word.
delete from public.round_hints where user_id = '0c000000-0000-0000-0000-000000000002';
insert into public.puzzle_pins (on_date, env, game, difficulty, choice)
values (pg_temp.d(0), 'round', 'guess', null, '{"word": "stock", "clue": "Not bonds"}'::jsonb);
update public.daily_puzzles
   set payload = jsonb_set(payload, '{byDifficulty,hard,words}', jsonb_build_object(
         '5', encode(convert_to('stock', 'UTF8'), 'base64')))
 where puzzle_date = pg_temp.d(0) and env = 'round' and game = 'words';
insert into t select 'pintake', public.round_clue('words', true, 5);
select pg_temp.check('a clue written on the pin wins over the list''s',
  (select v->>'clue' from t where k = 'pintake') = 'Not bonds');

set session "test.uid" = '0c000000-0000-0000-0000-000000000001';
delete from public.word_lists where name = 'Clue list';

-- Leave nothing behind.
delete from public.round_hints where user_id in ('0c000000-0000-0000-0000-000000000002', '0c000000-0000-0000-0000-000000000003');
delete from public.daily_progress where user_id in ('0c000000-0000-0000-0000-000000000002', '0c000000-0000-0000-0000-000000000003');
delete from public.daily_puzzles where puzzle_date = pg_temp.d(0) and env = 'round' and game = 'words';
delete from public.puzzle_pins where on_date in (pg_temp.d(0), pg_temp.d(5)) and game = 'guess';
delete from public.tournaments where name = 'Clue Cup';

\echo '--- round clue checks passed ---'
