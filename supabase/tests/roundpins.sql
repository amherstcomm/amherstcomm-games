-- Pinning a tournament round's puzzles.
--
-- Asked for: choosing the word a Guess the Word round plays, which the round
-- run used to leave to the draw because a pin was the daily's. What has to
-- hold: a round pin is kept apart from the daily's -- the daily run never
-- sees it and the round run sees only it -- it is refused for a game no round
-- has that day, or a day already played, and the page is told which round
-- boards a day has, by the same rule round_puzzle serves them by.
\set ON_ERROR_STOP on

insert into auth.users (id, email) values
  ('0d000000-0000-0000-0000-000000000001', 'pin.organiser@example.com'),
  ('0d000000-0000-0000-0000-000000000002', 'pin.player@example.com')
on conflict do nothing;
insert into public.role_grants (user_id, role)
values ('0d000000-0000-0000-0000-000000000001', 'games.edit')
on conflict do nothing;

create or replace function pg_temp.check(label text, got boolean) returns void
language plpgsql as $$
begin
  raise notice '%  %', case when got is true then 'PASS' else 'FAIL' end, label;
  if got is not true then raise exception 'failed: %', label; end if;
end $$;

create or replace function pg_temp.d(n int) returns date
language sql as $$ select public.puzzle_day() + n $$;

create temp table t (k text primary key, v jsonb);

set session "test.uid" = '0d000000-0000-0000-0000-000000000001';
select public.save_tournament(null, 'Pin Cup', 'hard', pg_temp.d(20), pg_temp.d(40));
-- Guess changes daily over three days; Hive is one board on the first.
insert into t select 'round', public.save_round(null,
  (select id from public.tournaments where name = 'Pin Cup'), pg_temp.d(21), pg_temp.d(23),
  array['words', 'hive'], '[]'::jsonb, null, '{}'::jsonb, '[]'::jsonb, array['words']);

-- ---------------------------------------------------------------------------
-- Which boards a day has
-- ---------------------------------------------------------------------------
insert into t select 'first', public.round_boards_on(pg_temp.d(21));
insert into t select 'second', public.round_boards_on(pg_temp.d(22));
select pg_temp.check('the first day has a board for both games, named as the pin page names them',
  (select jsonb_agg(b->>'game' order by b->>'game') from t, jsonb_array_elements(v->'boards') b where k = 'first')
    = '["guess", "hive"]'::jsonb);
select pg_temp.check('and the next day only the game with a new board each day',
  (select jsonb_agg(b->>'game') from t, jsonb_array_elements(v->'boards') b where k = 'second') = '["guess"]'::jsonb
  and (select bool_and((b->>'daily')::boolean) from t, jsonb_array_elements(v->'boards') b where k = 'second'));
select pg_temp.check('with the tournament and its difficulty',
  (select b->>'tournament' = 'Pin Cup' and b->>'difficulty' = 'hard'
   from t, jsonb_array_elements(v->'boards') b where k = 'second'));

-- ---------------------------------------------------------------------------
-- Pinning one
-- ---------------------------------------------------------------------------
select pg_temp.check('a round pin is refused for a game no round has that day',
  public.pin_puzzle(pg_temp.d(22), 'hive', null, '{"word": "pangram"}'::jsonb, 'round')->>'reason'
    = 'no tournament round has a board for that game on that day');
select pg_temp.check('and for a game in no round at all',
  public.pin_puzzle(pg_temp.d(21), 'scramble', null, '{"word": "capital"}'::jsonb, 'round')->>'reason'
    = 'no tournament round has a board for that game on that day');
select pg_temp.check('a round''s word can be pinned for each of its days',
  public.pin_puzzle(pg_temp.d(21), 'guess', null, '{"word": "owners"}'::jsonb, 'round')->>'ok' = 'true'
  and public.pin_puzzle(pg_temp.d(22), 'guess', null, '{"word": "shares"}'::jsonb, 'round')->>'ok' = 'true');
select public.pin_puzzle(pg_temp.d(21), 'guess', null, '{"word": "equity"}'::jsonb);

select pg_temp.check('the round run reads the round''s pin',
  public.round_pins(pg_temp.d(21))->'guess'->'all'->>'word' = 'owners'
  and public.round_pins(pg_temp.d(22))->'guess'->'all'->>'word' = 'shares');
select pg_temp.check('and the daily run the daily''s, the same day and game, kept apart',
  public.daily_pins(pg_temp.d(21))->'guess'->'all'->>'word' = 'equity'
  and public.daily_pins(pg_temp.d(22)) = '{}'::jsonb);
select pg_temp.check('pinning again changes the round''s pin rather than adding one',
  public.pin_puzzle(pg_temp.d(21), 'guess', null, '{"word": "voting"}'::jsonb, 'round')->>'ok' = 'true');
select pg_temp.check('which the round run now reads',
  public.round_pins(pg_temp.d(21))->'guess'->'all'->>'word' = 'voting'
  and (select count(*) from public.puzzle_pins where on_date = pg_temp.d(21) and game = 'guess' and env = 'round') = 1);
select pg_temp.check('the page is told which pin is for which',
  (select jsonb_agg(x->>'env' order by x->>'env') from jsonb_array_elements(
     public.pins_sheet(pg_temp.d(21), pg_temp.d(21))->'pins') x where x->>'game' = 'guess')
    = '["daily", "round"]'::jsonb);
select pg_temp.check('a pin for something else entirely is refused',
  public.pin_puzzle(pg_temp.d(21), 'guess', null, '{"word": "x"}'::jsonb, 'weekly')->>'reason'
    = 'a pin is for the daily or a round');

set session "test.uid" = '0d000000-0000-0000-0000-000000000002';
select pg_temp.check('a player cannot pin a round''s word',
  public.pin_puzzle(pg_temp.d(21), 'guess', null, '{"word": "x"}'::jsonb, 'round')->>'reason' = 'not allowed'
  and public.round_boards_on(pg_temp.d(21))->>'reason' = 'not allowed');

-- A day that is over has been played: a round under way can still be pinned
-- ahead, not behind. Moved back in time by hand, as no function would.
set session "test.uid" = '0d000000-0000-0000-0000-000000000001';
update public.tournaments set starts_on = pg_temp.d(-5) where name = 'Pin Cup';
update public.tournament_rounds set starts_on = pg_temp.d(-2), ends_on = pg_temp.d(2)
 where id = (select (v->>'id')::uuid from t where k = 'round');
select pg_temp.check('a round day already played cannot be pinned',
  public.pin_puzzle(pg_temp.d(-1), 'guess', null, '{"word": "owners"}'::jsonb, 'round')->>'reason'
    = 'that day''s round board has been played');
select pg_temp.check('but a day still ahead in a round under way can',
  public.pin_puzzle(pg_temp.d(1), 'guess', null, '{"word": "owners"}'::jsonb, 'round')->>'ok' = 'true');

-- Leave nothing behind.
delete from public.puzzle_pins where created_by = '0d000000-0000-0000-0000-000000000001';
delete from public.tournaments where name = 'Pin Cup';

\echo '--- round pin checks passed ---'
