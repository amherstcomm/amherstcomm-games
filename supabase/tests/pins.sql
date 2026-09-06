-- Pinning a themed puzzle to a date.
--
-- A pin is a *seed*, not a board: the generator builds from it exactly as it
-- would have built its own choice, so a pin cannot make a shape the game does
-- not understand. That is why almost nothing is validated here — the rules
-- about what a seed may be belong to the games, and a copy of them in this file
-- would be a staler copy.
--
-- What is worth asserting is the shape the generator reads, the two games with
-- nothing to pin, and that pinning twice is changing your mind rather than
-- queueing.
\set ON_ERROR_STOP on

insert into auth.users (id, email) values
  ('e1111111-1111-1111-1111-111111111111', 'pin-editor@example.com'),
  ('e3333333-3333-3333-3333-333333333333', 'pin-player@example.com')
on conflict do nothing;
insert into public.role_grants (user_id, role)
values ('e1111111-1111-1111-1111-111111111111', 'games.edit')
on conflict do nothing;

create or replace function pg_temp.check(label text, got boolean) returns void
language plpgsql as $$
begin
  raise notice '%  %', case when got is true then 'PASS' else 'FAIL' end, label;
  if got is not true then raise exception 'failed: %', label; end if;
end $$;

set session "test.uid" = 'e1111111-1111-1111-1111-111111111111';

-- ---------------------------------------------------------------------------
-- The ordinary state
-- ---------------------------------------------------------------------------
select pg_temp.check('a day nobody pinned has no pins',
  public.daily_pins(date '2026-06-01') = '{}'::jsonb);

-- ---------------------------------------------------------------------------
-- Pinning
-- ---------------------------------------------------------------------------
select pg_temp.check('a board can be pinned to a date',
  (public.pin_puzzle(date '2026-10-08', 'boxed', 'easy',
     '{"from": ["voting", "shared"]}'::jsonb)->>'ok') = 'true');
select pg_temp.check('and the generator reads it by game and difficulty',
  public.daily_pins(date '2026-10-08')->'boxed'->'easy'->'from' = '["voting","shared"]'::jsonb);

-- Every board of a game is a real answer somebody chooses, and JSON has no null
-- key, so it is spelled out.
select public.pin_puzzle(date '2026-10-08', 'scramble', null, '{"word": "capital"}'::jsonb);
select pg_temp.check('a pin naming no difficulty is every difficulty',
  public.daily_pins(date '2026-10-08')->'scramble'->'all'->>'word' = 'capital');

select pg_temp.check('and a day carries the games pinned on it, and no others',
  (select array_agg(k order by k)
   from jsonb_object_keys(public.daily_pins(date '2026-10-08')) k)
    = array['boxed', 'scramble']);
select pg_temp.check('while the day after has none of them',
  public.daily_pins(date '2026-10-09') = '{}'::jsonb);

-- Pinning twice is changing your mind, not queueing: one board, one pin.
select public.pin_puzzle(date '2026-10-08', 'boxed', 'easy',
  '{"from": ["invested", "growth"]}'::jsonb);
select pg_temp.check('pinning the same board again replaces the choice',
  public.daily_pins(date '2026-10-08')->'boxed'->'easy'->'from'
    = '["invested","growth"]'::jsonb);
select pg_temp.check('and does not leave two behind',
  (select count(*) from public.puzzle_pins
   where on_date = date '2026-10-08' and game = 'boxed' and difficulty = 'easy') = 1);
-- Difficulties are separate boards, so they are separate pins.
select public.pin_puzzle(date '2026-10-08', 'boxed', 'hard', '{"from": ["voting", "shared"]}'::jsonb);
select pg_temp.check('a second difficulty is a second pin',
  (select count(*) from public.puzzle_pins
   where on_date = date '2026-10-08' and game = 'boxed') = 2);

-- ---------------------------------------------------------------------------
-- What is refused
-- ---------------------------------------------------------------------------
-- The one game with no themed shortlist: a grid is dice, so there is nothing
-- to choose between.
select pg_temp.check('the grid has nothing to pin',
  (public.pin_puzzle(date '2026-10-08', 'grid', null, '{"cells": []}'::jsonb)->>'reason')
    = 'grid has no themed candidates to choose between');
-- Squares was refused here too, and is not any more: a themed square is a
-- theme word heading it, which happens often enough to curate. This check
-- fails against the old function, which is the point of keeping it.
select pg_temp.check('but a square can be pinned',
  (public.pin_puzzle(date '2026-10-08', 'squares', 'easy',
     '{"first": "vote", "rows": ["vote","area","tips","east"]}'::jsonb)->>'ok') = 'true');
select pg_temp.check('and the generator is handed the board, not just the word',
  public.daily_pins(date '2026-10-08')->'squares'->'easy'->>'first' = 'vote');
select pg_temp.check('a difficulty that is not one is refused',
  (public.pin_puzzle(date '2026-10-08', 'boxed', 'medium', '{"from": []}'::jsonb)->>'reason')
    = 'a difficulty is easy, hard or extreme');
select pg_temp.check('and a candidate that is not an object',
  (public.pin_puzzle(date '2026-10-08', 'boxed', null, '"voting"'::jsonb)->>'reason')
    = 'it needs a candidate');
select pg_temp.check('and a pin with no date',
  (public.pin_puzzle(null, 'boxed', null, '{}'::jsonb)->>'reason') = 'it needs a date');

-- ---------------------------------------------------------------------------
-- The sheet, and unpinning
-- ---------------------------------------------------------------------------
select pg_temp.check('the page sees a range of them',
  jsonb_array_length(public.pins_sheet(date '2026-10-01', date '2026-10-31')->'pins') = 4);
select pg_temp.check('and not the ones outside it',
  jsonb_array_length(public.pins_sheet(date '2026-11-01', date '2026-11-30')->'pins') = 0);
select pg_temp.check('a range cannot finish before it starts',
  (public.pins_sheet(date '2026-10-31', date '2026-10-01')->>'reason')
    = 'it cannot finish before it starts');

select public.unpin_puzzle(
  (select id from public.puzzle_pins
   where on_date = date '2026-10-08' and game = 'scramble'));
select pg_temp.check('unpinning leaves the day to the generator',
  not (public.daily_pins(date '2026-10-08') ? 'scramble'));

-- The coverage page reads pins through the same function, so what it shows and
-- what the generator obeys cannot disagree.
select pg_temp.check('coverage carries the day s pins',
  (select d->'pins' from jsonb_array_elements(
     public.theme_coverage(date '2026-10-07', date '2026-10-09')->'days') d
   where d->>'date' = '2026-10-08')
    = public.daily_pins(date '2026-10-08'));

-- ---------------------------------------------------------------------------
-- Who may
-- ---------------------------------------------------------------------------
set session "test.uid" = 'e3333333-3333-3333-3333-333333333333';
select pg_temp.check('a player cannot pin anything',
  (public.pin_puzzle(date '2026-10-08', 'boxed', null, '{"from": []}'::jsonb)->>'ok') = 'false');
select pg_temp.check('nor read what is pinned',
  (public.pins_sheet(date '2026-10-01', date '2026-10-31')->>'ok') = 'false');
-- A pin is the day's answer by another name: knowing tomorrow's box is made of
-- voting and shared is knowing tomorrow's box.
select pg_temp.check('and no web role may ask what is pinned to a day',
  not has_function_privilege('authenticated', 'public.daily_pins(date)', 'execute')
  and not has_function_privilege('anon', 'public.daily_pins(date)', 'execute'));
select pg_temp.check('while the generator may',
  has_function_privilege('service_role', 'public.daily_pins(date)', 'execute'));
select pg_temp.check('and anon may call none of the rest',
  not has_function_privilege('anon', 'public.pins_sheet(date, date)', 'execute')
  and not has_function_privilege('anon', 'public.pin_puzzle(date, text, text, jsonb)', 'execute'));

\echo '--- pin checks passed ---'
