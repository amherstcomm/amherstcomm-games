-- Cryptogram passages of somebody's own.
--
-- The check worth the most is the length band, because it is the one thing that
-- cannot be fixed later: the generator plays 50 to 100 letters at easy and hard
-- and 35 to 49 at extreme, so a passage outside 35 to 100 is one no day can
-- ever use. Saying so while somebody is typing is the whole point of refusing
-- it here rather than letting the nightly run pass it over in silence.
--
-- The second is that the text never reaches a player. It is the solution.
\set ON_ERROR_STOP on

insert into auth.users (id, email) values
  ('e1111111-1111-1111-1111-111111111111', 'passage-editor@example.com'),
  ('e3333333-3333-3333-3333-333333333333', 'passage-player@example.com')
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

create temp table p (k text primary key, v jsonb);
set session "test.uid" = 'e1111111-1111-1111-1111-111111111111';

-- 52 letters, so it plays at easy and hard.
insert into p select 'standard', public.save_cryptogram_passage(
  null,
  'We own this place together, and every share of it was earned here.',
  'The charter', date '2026-10-01', date '2026-10-31');
select pg_temp.check('a passage can be written', (select v->>'ok' from p where k='standard') = 'true');
-- Counted the way the cipher counts: spaces and punctuation are not enciphered
-- and are not letters.
select pg_temp.check('and is measured in letters rather than characters',
  (select (v->>'letters')::int from p where k='standard') = 52);

-- ---------------------------------------------------------------------------
-- What is refused
-- ---------------------------------------------------------------------------
select pg_temp.check('a passage too short for any board is refused',
  (public.save_cryptogram_passage(null, 'Too short for a board.')->>'reason')
    like 'that is % letters; the shortest board takes 35');
select pg_temp.check('and one too long for any of them',
  (public.save_cryptogram_passage(null, repeat('the quick brown fox jumps over it ', 5))->>'reason')
    like 'that is % letters; the longest board takes 100');
-- Said with the number in it, because "too short" without one leaves somebody
-- counting letters by hand.
select pg_temp.check('and the refusal says how many it had',
  (public.save_cryptogram_passage(null, 'Too short for a board.')->>'reason')
    like 'that is 17 letters%');
select pg_temp.check('punctuation alone is not a passage',
  (public.save_cryptogram_passage(null, '!!! ... ???')->>'reason') = 'it needs some words');
select pg_temp.check('a window cannot finish before it starts',
  (public.save_cryptogram_passage(null,
     'We own this place together, and every share of it was earned here.',
     null, date '2027-02-10', date '2027-02-01')->>'reason')
    = 'it cannot finish before it starts');

-- ---------------------------------------------------------------------------
-- Editing one
--
-- Its own check because the equivalent path in save_weave_theme was broken from
-- the day it was written and nothing noticed: every test wrote a new row, and
-- the insert has no ambiguity to trip over. See weavethemes.sql.
-- ---------------------------------------------------------------------------
select public.save_cryptogram_passage(
  ((select v->>'id' from p where k='standard'))::uuid,
  'Everyone here holds a share, and every one of those was worked for.',
  'The 2026 report', date '2026-10-05', date '2026-10-09');
select pg_temp.check('an edit changes the words',
  (select text from public.cryptogram_passages
   where id = ((select v->>'id' from p where k='standard'))::uuid)
    like 'Everyone here holds%');
select pg_temp.check('and the author, and the dates',
  (select author = 'The 2026 report' and starts_on = date '2026-10-05'
   from public.cryptogram_passages
   where id = ((select v->>'id' from p where k='standard'))::uuid));
select pg_temp.check('while an edit of something gone says so',
  (public.save_cryptogram_passage('11111111-2222-3333-4444-555555555555'::uuid,
     'We own this place together, and every share of it was earned here.')->>'reason')
    = 'no such passage');

-- ---------------------------------------------------------------------------
-- What the generator sees
-- ---------------------------------------------------------------------------
-- 39 letters: the short band, which only extreme plays.
insert into p select 'short', public.save_cryptogram_passage(
  null, 'One share each, and the year we all earned it here.', null,
  date '2026-10-05', date '2026-10-09');
select pg_temp.check('a short passage is kept, for the tier that plays one',
  (select (v->>'letters')::int from p where k='short') between 35 and 49);

select pg_temp.check('the generator finds what covers a day',
  jsonb_array_length(public.daily_cryptogram_passages(date '2026-10-07')) = 2);
select pg_temp.check('with the letters it needs to choose by',
  (select bool_and((e->>'letters')::int > 0)
   from jsonb_array_elements(public.daily_cryptogram_passages(date '2026-10-07')) e));
-- The ordinary state for eleven months of the year: the curated pool, exactly
-- as before any of this existed.
select pg_temp.check('and nothing at all on a day nobody scheduled',
  public.daily_cryptogram_passages(date '2026-09-30') = '[]'::jsonb);
select pg_temp.check('the ends are included',
  jsonb_array_length(public.daily_cryptogram_passages(date '2026-10-05')) = 2
  and jsonb_array_length(public.daily_cryptogram_passages(date '2026-10-09')) = 2);

-- The coverage page reads it through the same function, which is the whole
-- reason that function exists.
select pg_temp.check('coverage carries the day s passages',
  (select d->'passages' from jsonb_array_elements(
     public.theme_coverage(date '2026-10-06', date '2026-10-08')->'days') d
   where d->>'date' = '2026-10-07')
    = public.daily_cryptogram_passages(date '2026-10-07'));

-- ---------------------------------------------------------------------------
-- Who may
-- ---------------------------------------------------------------------------
set session "test.uid" = 'e3333333-3333-3333-3333-333333333333';
select pg_temp.check('a player cannot read the passages',
  (public.cryptogram_passages_sheet()->>'ok') = 'false');
select pg_temp.check('nor write one',
  (public.save_cryptogram_passage(null,
     'We own this place together, and every share of it was earned here.')->>'ok') = 'false');
select pg_temp.check('nor delete one',
  (public.delete_cryptogram_passage(((select v->>'id' from p where k='short'))::uuid)->>'ok')
    = 'false');
-- The plaintext is the solution, so the rule is the same one the daily answers
-- live under: the generator's key, and nothing a browser holds.
select pg_temp.check('and no web role may ask what today s passage is',
  not has_function_privilege('authenticated', 'public.daily_cryptogram_passages(date)', 'execute')
  and not has_function_privilege('anon', 'public.daily_cryptogram_passages(date)', 'execute'));
select pg_temp.check('while the generator may',
  has_function_privilege('service_role', 'public.daily_cryptogram_passages(date)', 'execute'));
select pg_temp.check('and anon may call none of the rest',
  not has_function_privilege('anon', 'public.cryptogram_passages_sheet()', 'execute')
  and not has_function_privilege('anon',
    'public.save_cryptogram_passage(uuid, text, text, date, date)', 'execute'));

set session "test.uid" = 'e1111111-1111-1111-1111-111111111111';
select pg_temp.check('an editor can see them',
  jsonb_array_length(public.cryptogram_passages_sheet()->'passages') = 2);
select public.delete_cryptogram_passage(((select v->>'id' from p where k='short'))::uuid);
select pg_temp.check('and delete one',
  jsonb_array_length(public.cryptogram_passages_sheet()->'passages') = 1);

\echo '--- cryptogram passage checks passed ---'
