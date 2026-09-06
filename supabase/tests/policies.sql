-- What a themed day accepts as a word.
--
-- Three checks carry this file. The overlap rule, because overlapping windows
-- are the ordinary case and "half themed" is not a thing a board can be: a row
-- naming a game beats the day's default, and the most recent of equals wins.
-- The ladder's refusal, because narrowing the accepted words there changes the
-- answer rather than the difficulty. And that nothing a browser holds can ask
-- what today's policy is — it is part of the day's answer key.
\set ON_ERROR_STOP on

insert into auth.users (id, email) values
  ('e1111111-1111-1111-1111-111111111111', 'policy-editor@example.com'),
  ('e3333333-3333-3333-3333-333333333333', 'policy-player@example.com')
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
-- Eleven months of the year nobody has written a rule, and that has to mean
-- "as it always was" rather than an empty answer the generator has to guess at.
select pg_temp.check('a day with no rule has no policy at all',
  public.daily_word_policy(date '2026-06-01') = '{}'::jsonb);

-- ---------------------------------------------------------------------------
-- Writing one
-- ---------------------------------------------------------------------------
select pg_temp.check('a default for the month can be written',
  (public.save_word_policy(null, null, 'both', date '2026-10-01', date '2026-10-31')->>'ok')
    = 'true');
select pg_temp.check('and one game can be told something else',
  (public.save_word_policy(null, 'boxed', 'themed', date '2026-10-05', date '2026-10-09')->>'ok')
    = 'true');

select pg_temp.check('the day carries the default',
  public.daily_word_policy(date '2026-10-02')->>'default' = 'both');
select pg_temp.check('and nothing for a game nobody named',
  not (public.daily_word_policy(date '2026-10-02') ? 'boxed'));
-- The rule the whole shape exists for: a game named beats the day's default,
-- and the two live side by side rather than one replacing the other.
select pg_temp.check('a game named beats the default, and the default remains',
  public.daily_word_policy(date '2026-10-07')->>'boxed' = 'themed'
  and public.daily_word_policy(date '2026-10-07')->>'default' = 'both');
select pg_temp.check('and the ends of the window are included',
  public.daily_word_policy(date '2026-10-05')->>'boxed' = 'themed'
  and public.daily_word_policy(date '2026-10-09')->>'boxed' = 'themed');
select pg_temp.check('while a day outside it has only the default',
  not (public.daily_word_policy(date '2026-10-10') ? 'boxed'));

-- Two rules of equal standing covering one day: the later one wins, because
-- somebody wrote it later. Nothing is merged.
select public.save_word_policy(null, 'boxed', 'dictionary', date '2026-10-07', date '2026-10-07');
select pg_temp.check('the most recent of two equals wins',
  public.daily_word_policy(date '2026-10-07')->>'boxed' = 'dictionary');
select pg_temp.check('and the day either side is untouched',
  public.daily_word_policy(date '2026-10-06')->>'boxed' = 'themed');

-- ---------------------------------------------------------------------------
-- What is refused
-- ---------------------------------------------------------------------------
select pg_temp.check('a policy that is not one of the three is refused',
  (public.save_word_policy(null, null, 'sometimes', date '2026-10-01', date '2026-10-02')->>'reason')
    = 'a policy is both, themed or dictionary');
-- The one game this cannot be done to: par is the shortest route through the
-- words a player may use, so narrowing them changes the answer.
select pg_temp.check('and the ladder is refused by name, with the reason',
  (public.save_word_policy(null, 'ladder', 'themed', date '2026-10-01', date '2026-10-02')->>'reason')
    like 'the ladder cannot take one%');
select pg_temp.check('a window cannot finish before it starts',
  (public.save_word_policy(null, null, 'both', date '2026-10-10', date '2026-10-01')->>'reason')
    = 'it cannot finish before it starts');
select pg_temp.check('and it needs both dates',
  (public.save_word_policy(null, null, 'both', date '2026-10-01', null)->>'ok') = 'false');
select pg_temp.check('while an edit of something gone says so',
  (public.save_word_policy('11111111-2222-3333-4444-555555555555'::uuid, null, 'both',
     date '2026-10-01', date '2026-10-02')->>'reason') = 'no such rule');

-- ---------------------------------------------------------------------------
-- Editing and deleting
-- ---------------------------------------------------------------------------
create temp table pol (id uuid);
insert into pol
select (public.save_word_policy(null, 'hive', 'themed',
  date '2026-11-01', date '2026-11-07')->>'id')::uuid;
select public.save_word_policy((select id from pol), 'hive', 'dictionary',
  date '2026-11-02', date '2026-11-08');
select pg_temp.check('an edit changes the rule',
  public.daily_word_policy(date '2026-11-05')->>'hive' = 'dictionary');
select pg_temp.check('and the dates that came with it',
  not (public.daily_word_policy(date '2026-11-01') ? 'hive'));
select public.delete_word_policy((select id from pol));
select pg_temp.check('and deleting it leaves the day ordinary',
  not (public.daily_word_policy(date '2026-11-05') ? 'hive'));

-- The coverage page reads it through the same function, which is the point of
-- that function existing.
select pg_temp.check('coverage carries the day s policy',
  (select d->'policy' from jsonb_array_elements(
     public.theme_coverage(date '2026-10-06', date '2026-10-08')->'days') d
   where d->>'date' = '2026-10-07')
    = public.daily_word_policy(date '2026-10-07'));

-- ---------------------------------------------------------------------------
-- Who may
-- ---------------------------------------------------------------------------
set session "test.uid" = 'e3333333-3333-3333-3333-333333333333';
select pg_temp.check('a player cannot read the rules',
  (public.word_policies_sheet()->>'ok') = 'false');
select pg_temp.check('nor write one',
  (public.save_word_policy(null, null, 'themed', date '2026-10-01', date '2026-10-02')->>'ok')
    = 'false');
-- Which words a board will take is part of the day's answer key: a browser that
-- could ask would learn that tomorrow is themed-only, and that is a strong hint
-- about tomorrow's board.
select pg_temp.check('and no web role may ask what today s policy is',
  not has_function_privilege('authenticated', 'public.daily_word_policy(date)', 'execute')
  and not has_function_privilege('anon', 'public.daily_word_policy(date)', 'execute'));
select pg_temp.check('while the generator may',
  has_function_privilege('service_role', 'public.daily_word_policy(date)', 'execute'));
select pg_temp.check('and anon may call none of the rest',
  not has_function_privilege('anon', 'public.word_policies_sheet()', 'execute')
  and not has_function_privilege('anon',
    'public.save_word_policy(uuid, text, text, date, date)', 'execute'));

set session "test.uid" = 'e1111111-1111-1111-1111-111111111111';
select pg_temp.check('an editor can see them all',
  jsonb_array_length(public.word_policies_sheet()->'policies') >= 3);

\echo '--- word policy checks passed ---'
