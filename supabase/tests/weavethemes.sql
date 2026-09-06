-- Weave themes of somebody's own.
--
-- A different shape from a word list, and the tests are about the difference:
-- a theme is a set that tiles a board — a clue, a spangram, and words — and the
-- dates work as a pool rather than as ownership, so every theme covering a day
-- is a candidate for it.
\set ON_ERROR_STOP on

insert into auth.users (id, email) values
  ('c1111111-1111-1111-1111-111111111111', 'weave-editor@example.com'),
  ('c3333333-3333-3333-3333-333333333333', 'weave-player@example.com')
on conflict do nothing;
insert into public.role_grants (user_id, role)
values ('c1111111-1111-1111-1111-111111111111', 'games.edit')
on conflict do nothing;

create or replace function pg_temp.check(label text, got boolean) returns void
language plpgsql as $$
begin
  raise notice '%  %', case when got is true then 'PASS' else 'FAIL' end, label;
  if got is not true then raise exception 'failed: %', label; end if;
end $$;

set session "test.uid" = 'c1111111-1111-1111-1111-111111111111';

-- ---------------------------------------------------------------------------
-- Writing one
-- ---------------------------------------------------------------------------
select pg_temp.check('a theme can be written',
  (public.save_weave_theme(null, 'Profit sharing', 'profitsharing',
     'metrics payout reward target bonus split',
     date '2026-10-01', date '2026-10-31')->>'ok') = 'true');

-- Weave places words of four to ten letters; the rest are dropped rather than
-- refused, because a paste has junk in it.
select pg_temp.check('words the board cannot hold are dropped, not fatal',
  (public.save_weave_theme(null, 'With junk', 'stakeholders',
     'ox voting shares trustee extraordinarily equity',
     null, null)->>'words')::int = 4);

select pg_temp.check('a theme needs a clue',
  (public.save_weave_theme(null, '  ', 'profitsharing', 'metrics payout')->>'reason')
    = 'it needs a clue');
select pg_temp.check('and a spangram that can thread',
  (public.save_weave_theme(null, 'Short', 'short', 'metrics payout')->>'reason')
    like 'a spangram is one word%');
select pg_temp.check('and some words',
  (public.save_weave_theme(null, 'Empty', 'profitsharing', 'ox a an')->>'reason')
    = 'it needs some words');
select pg_temp.check('and a window that does not finish first',
  (public.save_weave_theme(null, 'Backwards', 'profitsharing', 'metrics payout',
     date '2026-11-10', date '2026-11-01')->>'reason')
    = 'it cannot finish before it starts');

-- Whether it *tiles* is not refused here. The page works that out while
-- somebody types, and a theme that fits no board today may fit one tomorrow
-- when a word is added — refusing it would lose the half-written thing.
select pg_temp.check('a theme that fills no board is still saved',
  (public.save_weave_theme(null, 'Too small', 'profitsharing', 'bonus split',
     null, null)->>'ok') = 'true');

-- ---------------------------------------------------------------------------
-- The pool, by date
-- ---------------------------------------------------------------------------
select public.save_weave_theme(null, 'On the board', 'stakeholders',
  'voting shares trustee equity member owner', date '2026-10-01', date '2026-10-31');
select public.save_weave_theme(null, 'One day only', 'employeeowned',
  'shares dividend vesting payout equity buyout', date '2026-10-15', date '2026-10-15');

select pg_temp.check('every theme covering a day is a candidate for it',
  jsonb_array_length(public.daily_weave_themes(date '2026-10-08')) = 2);
-- One theme on one date is a theme for that date; the range ones are still
-- there too, which is what makes a pool a pool.
select pg_temp.check('and a single date adds to the pool rather than replacing it',
  jsonb_array_length(public.daily_weave_themes(date '2026-10-15')) = 3);
select pg_temp.check('a day nothing covers has none',
  public.daily_weave_themes(date '2026-09-30') = '[]'::jsonb);
-- Unscheduled is kept and editable, and never comes up.
select pg_temp.check('and an unscheduled theme is never a candidate',
  not (public.daily_weave_themes(date '2026-10-08')::text like '%With junk%'));

select pg_temp.check('a candidate carries what the generator needs',
  (public.daily_weave_themes(date '2026-10-15')->0) ?& array['clue', 'spangram', 'words']);

-- ---------------------------------------------------------------------------
-- Who may
-- ---------------------------------------------------------------------------
select pg_temp.check('the sheet lists them for an editor',
  jsonb_array_length(public.weave_themes_sheet()->'themes') =
  (select count(*) from public.weave_themes));

set session "test.uid" = 'c3333333-3333-3333-3333-333333333333';
select pg_temp.check('a player cannot read or write them',
  (public.weave_themes_sheet()->>'ok') = 'false'
  and (public.save_weave_theme(null, 'Mine', 'profitsharing', 'metrics payout')->>'ok') = 'false');

-- The words are answers. A browser that could ask for tomorrow's board has been
-- handed tomorrow's board.
select pg_temp.check('and no web role may ask what is on tomorrow',
  not has_function_privilege('authenticated', 'public.daily_weave_themes(date)', 'execute')
  and not has_function_privilege('anon', 'public.daily_weave_themes(date)', 'execute'));
select pg_temp.check('while the generator may',
  has_function_privilege('service_role', 'public.daily_weave_themes(date)', 'execute'));

-- ---------------------------------------------------------------------------
-- Editing one
--
-- Written because it was broken. `set clue = clue` assigned the column from
-- itself and Postgres refused to guess between the column and the plpgsql local
-- of the same name — "column reference clue is ambiguous", every time anybody
-- edited a theme. It shipped because nothing here edited one: every check above
-- writes a new theme, and the insert path has no such collision.
-- ---------------------------------------------------------------------------
-- Back to somebody who may: the section above left the session as a player, and
-- a refusal here would look exactly like the bug this is about.
set session "test.uid" = 'c1111111-1111-1111-1111-111111111111';
create temp table edited (id uuid);
insert into edited
select (public.save_weave_theme(
  null, 'Before', 'profitsharing', 'metrics payout reward target bonus split',
  date '2027-03-01', date '2027-03-07')->>'id')::uuid;
select public.save_weave_theme((select id from edited),
  'After', 'stakeholders', 'voting shares trustee',
  date '2027-03-02', date '2027-03-08');
select pg_temp.check('a theme can be edited at all',
  exists (select 1 from public.weave_themes where id = (select id from edited)));
select pg_temp.check('and the clue is the new one',
  (select clue from public.weave_themes where id = (select id from edited)) = 'After');
select pg_temp.check('with the spangram, words and dates that came with it',
  (select spangram = 'stakeholders' and words @> array['trustee'] and starts_on = date '2027-03-02'
   from public.weave_themes where id = (select id from edited)));

\echo '--- weave theme checks passed ---'
