-- Rounds that overlap.
--
-- A pumpkin contest runs for a week; the daily game rounds run a day each. A
-- tournament holding both needs rounds that overlap, and save_round refused any
-- overlap at all. What has to hold now: rounds may overlap, but never over the
-- same game -- a round's board is kept under its game and its first day, and a
-- player reaches it as /tournament/<game>, so one game in two rounds on one day
-- is two boards behind one address. And everything that used to find "the
-- round on today" has to find the right one of several: the board a game is
-- dealt, the hint a player takes, and the hints they have already had.
\set ON_ERROR_STOP on

insert into auth.users (id, email) values
  ('0c000000-0000-0000-0000-000000000001', 'overlap.organiser@example.com'),
  ('0c000000-0000-0000-0000-000000000002', 'overlap.player@example.com')
on conflict do nothing;
insert into public.role_grants (user_id, role)
values ('0c000000-0000-0000-0000-000000000001', 'games.edit')
on conflict do nothing;

create or replace function pg_temp.check(label text, got boolean) returns void
language plpgsql as $$
begin
  raise notice '%  %', case when got is true then 'PASS' else 'FAIL' end, label;
  if got is not true then raise exception 'failed: %', label; end if;
end $$;

create or replace function pg_temp.d(n int) returns date
language sql as $$ select public.puzzle_day() + n $$;

-- A round's save, asserted rather than fired: a refused save returns no id,
-- and every check after it would be about a round that is not there.
create or replace function pg_temp.round(starts int, ends int, games text[], contests jsonb default '[]')
returns uuid
language plpgsql as $$
declare
  got jsonb := public.save_round(null, (select id from public.tournaments where name = 'Overlap Cup'),
                                 pg_temp.d(starts), pg_temp.d(ends), games, '[]'::jsonb, null,
                                 '{}'::jsonb, contests);
begin
  if got->>'ok' is distinct from 'true' then
    raise exception 'round % to % (%) was refused: %', starts, ends, games, got->>'reason';
  end if;
  return (got->>'id')::uuid;
end $$;

set session "test.uid" = '0c000000-0000-0000-0000-000000000001';
select public.save_tournament(null, 'Overlap Cup', 'hard', pg_temp.d(-10), pg_temp.d(20));

-- ---------------------------------------------------------------------------
-- What may overlap
-- ---------------------------------------------------------------------------
-- A runs across today; B is today only, a different game. Before this, B was
-- refused for sharing a day with A.
create temp table ra as select pg_temp.round(-2, 5, array['weave']) id;
create temp table rb as select pg_temp.round(0, 0, array['hive']) id;
select pg_temp.check('two rounds may share days when they share no game',
  (select id from ra) is not null and (select id from rb) is not null);

-- D starts the same day as B, which is the case two of the fixes below are
-- about: anything that found the round by its first day alone found two.
create temp table rd as select pg_temp.round(0, 2, array['box']) id;
select pg_temp.check('and two may even start on the same day',
  (select id from rd) is not null);

-- The case this was asked for: a contest running across the daily rounds.
create temp table oc as
  select (public.save_contest(null, 'Overlap pumpkins', null, pg_temp.d(-5), pg_temp.d(-1),
                              pg_temp.d(0), pg_temp.d(4))->>'id')::uuid id;
create temp table rc as
  select pg_temp.round(-1, 4, '{}'::text[], jsonb_build_array(jsonb_build_object('id', (select id from oc)))) id;
select pg_temp.check('a contest round can run across the daily ones',
  (select id from rc) is not null);

-- ---------------------------------------------------------------------------
-- What may not
-- ---------------------------------------------------------------------------
select pg_temp.check('the same game in two rounds on the same day is refused, by name',
  (public.save_round(null, (select id from public.tournaments where name = 'Overlap Cup'),
                     pg_temp.d(3), pg_temp.d(8), array['weave'])->>'reason')
    = 'Weave is already in another round on some of those days');
-- Boxed's round (D) runs to d(2), so a round that day with Grid and Boxed
-- clashes on Boxed alone, and the refusal names the one that clashes.
select pg_temp.check('even when only one game of several clashes',
  (public.save_round(null, (select id from public.tournaments where name = 'Overlap Cup'),
                     pg_temp.d(2), pg_temp.d(2), array['grid', 'box'])->>'reason')
    = 'Boxed is already in another round on some of those days');

-- The same game is fine once the first round has finished with it.
create temp table re as select pg_temp.round(6, 8, array['weave']) id;
select pg_temp.check('the same game can follow on once the earlier round has ended',
  (select id from re) is not null);

-- And a round under way cannot be stretched into a clash: its end date is the
-- one thing it may still move, and moving it is checked like anything else.
select pg_temp.check('a round under way cannot be stretched over the next round''s game',
  (public.save_round((select id from ra), (select id from public.tournaments where name = 'Overlap Cup'),
                     pg_temp.d(-2), pg_temp.d(7), array['weave'])->>'reason')
    = 'Weave is already in another round on some of those days');

-- ---------------------------------------------------------------------------
-- Every round on today, numbered once
-- ---------------------------------------------------------------------------
create temp table now_on as select public.current_rounds() j;
select pg_temp.check('every round on today comes back',
  (select jsonb_array_length(j) from now_on) = 4);
-- Numbered by start, then end, then id: A from d(-2), the contest round from
-- d(-1), then B (ends today) before D (ends d(2)) though both start today, then
-- E after them all. Five in the tournament.
select pg_temp.check('in round order, numbered the same way everywhere',
  (select array_agg((x->>'round_id')::uuid order by ord) from now_on, jsonb_array_elements(j) with ordinality x(x, ord))
    = array[(select id from ra), (select id from rc), (select id from rb), (select id from rd)]
  and (select array_agg((x->>'number')::int order by ord) from now_on, jsonb_array_elements(j) with ordinality x(x, ord))
    = array[1, 2, 3, 4]
  and (select bool_and((x->>'of')::int = 5) from now_on, jsonb_array_elements(j) x));
select pg_temp.check('and the standings number them the same',
  (select array_agg((x->>'id')::uuid order by (x->>'number')::int)
   from jsonb_array_elements(public.tournament_standings(
          (select id from public.tournaments where name = 'Overlap Cup'))->'rounds') x)
    = array[(select id from ra), (select id from rc), (select id from rb), (select id from rd)]);

-- ---------------------------------------------------------------------------
-- The right one of several
-- ---------------------------------------------------------------------------
-- Each round's board, under its game and its first day.
insert into public.daily_puzzles (game, puzzle_date, env, payload)
values ('weave', pg_temp.d(-2), 'round', '{"board": "A"}'),
       ('hive', pg_temp.d(0), 'round', '{"board": "B"}'),
       ('box', pg_temp.d(0), 'round', '{"board": "D"}')
on conflict do nothing;
select pg_temp.check('each game is dealt its own round''s board',
  public.round_puzzle('weave')->>'board' = 'A'
  and public.round_puzzle('hive')->>'board' = 'B'
  and public.round_puzzle('box')->>'board' = 'D');

-- A hint comes from the round that has the game. Taking whichever round came
-- back first refused a hint on a game that was in the other one: both of these
-- would get the same round, so at least one of them would have been told its
-- game was not in it. With no hint words on these boards, getting as far as
-- "that game has no hints" is getting the right round.
set session "test.uid" = '0c000000-0000-0000-0000-000000000002';
select pg_temp.check('a hint is looked for in the round that has the game',
  (public.take_round_hint('weave')->>'reason') = 'that game has no hints'
  and (public.take_round_hint('hive')->>'reason') = 'that game has no hints'
  and (public.take_round_hint('box')->>'reason') = 'that game has no hints');
select pg_temp.check('and a game in no round on today is still told so',
  (public.take_round_hint('grid')->>'reason') = 'that game is not in this round');

-- The hints already taken: two rounds starting today used to match each row
-- twice, and the read failed outright with more than one row.
insert into public.round_hints (user_id, game, puzzle_date, taken, targets)
values ('0c000000-0000-0000-0000-000000000002', 'box', pg_temp.d(0), 2, array['a', 'b']),
       ('0c000000-0000-0000-0000-000000000002', 'hive', pg_temp.d(0), 1, array['c']);
select pg_temp.check('the hints already taken come back for the right round',
  (public.my_round_hints('box')->>'taken')::int = 2
  and (public.my_round_hints('hive')->>'taken')::int = 1);

-- Leave nothing behind: other files set up rounds on today with these games.
delete from public.round_hints where user_id = '0c000000-0000-0000-0000-000000000002';
delete from public.daily_puzzles
 where env = 'round' and (game, puzzle_date) in
       (('weave', pg_temp.d(-2)), ('hive', pg_temp.d(0)), ('box', pg_temp.d(0)));
delete from public.tournaments where name = 'Overlap Cup';
delete from public.contests where id = (select id from oc);

\echo '--- overlapping-round checks passed ---'
