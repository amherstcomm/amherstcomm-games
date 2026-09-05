-- Word lists of somebody's own.
--
-- The two checks worth the most are opposite sides of one decision: a themed
-- list supplies the answer, not the language. So an ordinary word stays
-- typeable in a themed round, and a themed word that no dictionary has heard of
-- becomes typeable in the round built out of it. Get either backwards and the
-- board reads as broken rather than as themed.
--
-- The third is that the list never reaches a player. It is the answer key.
\set ON_ERROR_STOP on

insert into auth.users (id, email) values
  ('e1111111-1111-1111-1111-111111111111', 'list-editor@example.com'),
  ('e3333333-3333-3333-3333-333333333333', 'list-player@example.com')
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

create temp table t (k text primary key, v jsonb);
set session "test.uid" = 'e1111111-1111-1111-1111-111111111111';

-- ---------------------------------------------------------------------------
-- Writing one
-- ---------------------------------------------------------------------------
insert into t select 'list', public.save_word_list(
  null, 'Employee ownership',
  E'shares\ndividend\nesop\nOWNER\nowner\nemployee\nvesting\nequity');
select pg_temp.check('a list can be written', (select v->>'ok' from t where k='list') = 'true');
-- Whatever somebody pasted: one per line, commas, a document with junk in it.
select pg_temp.check('the same word twice is one word',
  (select (v->>'words')::int from t where k='list') = 7);

select pg_temp.check('case is not part of a word',
  exists (select 1 from public.word_list_entries
          where list_id = ((select v->>'id' from t where k='list'))::uuid and word = 'owner'));
select pg_temp.check('and anything that is not a letter separates',
  (public.save_word_list(null, 'Punctuated', 'one, two; three.  four')->>'words')::int = 4);

-- A paste of a document has junk in it, and rejecting the whole list for one
-- stray "a" helps nobody.
select pg_temp.check('a word too short to be one is dropped, not fatal',
  (public.save_word_list(null, 'With junk', 'a an the shares of it')->>'words')::int = 2);

select pg_temp.check('a list needs a name',
  (public.save_word_list(null, '   ', 'shares')->>'reason') = 'it needs a name');
select pg_temp.check('and two lists cannot share one',
  (public.save_word_list(null, 'Employee ownership', 'shares')->>'reason')
    = 'there is already a list with that name');

-- Saving replaces: it is the one action that looks most like a text file, and a
-- save that kept deleted words would be the wrong behaviour for it.
select public.save_word_list(((select v->>'id' from t where k='list'))::uuid,
  'Employee ownership', E'shares\ndividend\nesop\nowner\nemployee\nvesting\nequity\nbuyout');
select pg_temp.check('saving replaces rather than merging',
  (select count(*) from public.word_list_entries
   where list_id = ((select v->>'id' from t where k='list'))::uuid) = 8);

-- ---------------------------------------------------------------------------
-- What an editor sees
-- ---------------------------------------------------------------------------
select pg_temp.check('the sheet says how many are in each',
  (select (e->>'words')::int from jsonb_array_elements(
     public.word_lists_sheet()->'lists') e
   where e->>'name' = 'Employee ownership') = 8);
-- Picking a list for a six-letter board needs to know it has six-letter words.
select pg_temp.check('and which lengths it can fill a board with',
  (select e->'lengths' from jsonb_array_elements(public.word_lists_sheet()->'lists') e
   where e->>'name' = 'Employee ownership') @> '[6]'::jsonb);
select pg_temp.check('the words themselves are a separate ask',
  jsonb_array_length(
    public.word_list_words(((select v->>'id' from t where k='list'))::uuid)->'words') = 8);

-- ---------------------------------------------------------------------------
-- A round drawn from one
-- ---------------------------------------------------------------------------
insert into t select 'sess', public.create_session('Themed round');
insert into t select 'item', public.save_item(
  ((select v->>'id' from t where k='sess'))::uuid, null, 'game', 'Guess the word',
  '{"slug":"guess","tries":6}'::jsonb,
  jsonb_build_object('list', (select v->>'id' from t where k='list'), 'length', 6));
select pg_temp.check('a question can be drawn from a list',
  (select v->>'ok' from t where k='item') = 'true');

select pg_temp.check('and the word it drew is in the list',
  exists (select 1 from public.item_answers a
          join public.word_list_entries e
            on e.list_id = ((select v->>'id' from t where k='list'))::uuid
           and e.word = lower(a.answer ->> 'word')
          where a.item_id = ((select v->>'id' from t where k='item'))::uuid));
select pg_temp.check('of the length that was asked for',
  (select length(a.answer ->> 'word') from public.item_answers a
   where a.item_id = ((select v->>'id' from t where k='item'))::uuid) = 6);
-- The board is drawn before the room knows anything else, so the payload's
-- length has to follow the word that was actually drawn.
select pg_temp.check('and the board is the size of it',
  (select (payload ->> 'length')::int from public.items
   where id = ((select v->>'id' from t where k='item'))::uuid) = 6);

-- The payload goes to the room. A six-letter word drawn from a list of eight is
-- nearly given away by naming the list.
select pg_temp.check('the payload does not say which list it came from',
  not ((select payload from public.items
        where id = ((select v->>'id' from t where k='item'))::uuid) ? 'list'));
select pg_temp.check('and the answer does, where no web role can read it',
  (select a.answer ->> 'list' from public.item_answers a
   where a.item_id = ((select v->>'id' from t where k='item'))::uuid)
    = (select v->>'id' from t where k='list'));

select pg_temp.check('a list with nothing of that length says so',
  (public.save_item(((select v->>'id' from t where k='sess'))::uuid, null, 'game', 'Nope',
     '{"slug":"guess","tries":6}'::jsonb,
     jsonb_build_object('list', (select v->>'id' from t where k='list'), 'length', 14))->>'reason')
   like '%14-letter%');

-- ---------------------------------------------------------------------------
-- What may be typed at it
-- ---------------------------------------------------------------------------
select public.advance_session(((select v->>'id' from t where k='sess'))::uuid, 'start');
select public.advance_session(((select v->>'id' from t where k='sess'))::uuid, 'show',
  ((select v->>'id' from t where k='item'))::uuid);
-- An ordinary six-letter word that is *not* in the themed list, so the
-- dictionary path is what accepts it. Deliberately not one of the list's own —
-- the draw is random among the six-letter entries, and a guess that might be
-- the answer would solve the board and make everything after it depend on luck.
insert into public.words (word, len, sorted) values ('planet', 6, 'aelnpt')
on conflict do nothing;

-- A themed word of the right length that is not the one drawn. Worked out
-- rather than written down, for the same reason.
insert into t select 'themed', to_jsonb((
  select e.word from public.word_list_entries e
  where e.list_id = ((select v->>'id' from t where k='list'))::uuid
    and length(e.word) = 6
    and e.word <> lower((select a.answer ->> 'word' from public.item_answers a
                         where a.item_id = ((select v->>'id' from t where k='item'))::uuid))
  limit 1));

set session "test.uid" = 'e3333333-3333-3333-3333-333333333333';
-- The theme decides what the puzzle is, not what English is. A board that
-- rejects an ordinary word because the theme is about shares reads as broken.
select pg_temp.check('an ordinary word is still a legal guess',
  (public.guess_word(((select v->>'id' from t where k='item'))::uuid, 'planet')->>'ok') = 'true');
-- And the other direction. No dictionary here has heard of EQUITY or BUYOUT as
-- part of this game's word list, and they have to be typeable in a round built
-- out of them.
select pg_temp.check('and so is a themed word the dictionary does not have',
  (public.guess_word(((select v->>'id' from t where k='item'))::uuid,
                     (select v#>>'{}' from t where k='themed'))->>'ok') = 'true');
select pg_temp.check('while something that is neither is refused',
  (public.guess_word(((select v->>'id' from t where k='item'))::uuid, 'zzzzzz')->>'reason')
    = 'That is not a word I know.');

-- ---------------------------------------------------------------------------
-- Who may
-- ---------------------------------------------------------------------------
select pg_temp.check('a player cannot read a list',
  (public.word_lists_sheet()->>'ok') = 'false'
  and (public.word_list_words(((select v->>'id' from t where k='list'))::uuid)->>'ok') = 'false');
select pg_temp.check('nor write one',
  (public.save_word_list(null, 'Mine', 'shares')->>'ok') = 'false');
select pg_temp.check('nor draw from one',
  not has_function_privilege('authenticated', 'public.draw_word(uuid, int)', 'execute'));
select pg_temp.check('and anon may call none of it',
  not has_function_privilege('anon', 'public.word_lists_sheet()', 'execute')
  and not has_function_privilege('anon', 'public.save_word_list(uuid, text, text, text, text, date, date)', 'execute'));

-- ---------------------------------------------------------------------------
-- Tidying up
-- ---------------------------------------------------------------------------
set session "test.uid" = 'e1111111-1111-1111-1111-111111111111';
insert into t select 'word', to_jsonb((select a.answer ->> 'word' from public.item_answers a
  where a.item_id = ((select v->>'id' from t where k='item'))::uuid));
select public.delete_word_list(((select v->>'id' from t where k='list'))::uuid);
select pg_temp.check('deleting a list takes its words with it',
  not exists (select 1 from public.word_list_entries
              where list_id = ((select v->>'id' from t where k='list'))::uuid));
-- The word was copied when it was drawn, so a round that has been built does
-- not come apart because somebody tidied up afterwards.
select pg_temp.check('but a round already drawn from it keeps its answer',
  (select a.answer ->> 'word' from public.item_answers a
   where a.item_id = ((select v->>'id' from t where k='item'))::uuid)
    = (select v#>>'{}' from t where k='word'));

-- ---------------------------------------------------------------------------
-- Taking over the dailies
--
-- Dates rather than a switch, and the reason is the fortnight: the window is
-- generated ahead, so the run on 25 September already writes 1 October. The
-- theme has to be decided per puzzle date or the first two weeks of an event
-- go out unthemed and already published.
-- ---------------------------------------------------------------------------
set session "test.uid" = 'e1111111-1111-1111-1111-111111111111';
insert into t select 'oct', public.save_word_list(
  null, 'October', E'shares
dividend
owner
equity
buyout
vesting',
  'What we all are', 'employeeowned', date '2026-10-01', date '2026-10-31');
select pg_temp.check('a list can be given a run of days',
  (select v->>'ok' from t where k='oct') = 'true');

select pg_temp.check('and the generator finds it by date',
  public.daily_theme(date '2026-10-08')->>'clue' = 'What we all are');
select pg_temp.check('with the words and the spangram it needs',
  jsonb_array_length(public.daily_theme(date '2026-10-08')->'words') = 6
  and public.daily_theme(date '2026-10-08')->>'spangram' = 'employeeowned');
-- Eleven months of the year there is no theme, and that is the ordinary state
-- rather than a failure: the generator makes the day it would have made.
select pg_temp.check('a day nothing covers has no theme',
  public.daily_theme(date '2026-09-30') is null
  and public.daily_theme(date '2026-11-01') is null);
select pg_temp.check('the ends are included',
  public.daily_theme(date '2026-10-01') is not null
  and public.daily_theme(date '2026-10-31') is not null);

-- The name is the obvious clue and usually the right one.
insert into t select 'noclue', public.save_word_list(
  null, 'Anniversary week', E'silver
golden
decade
planet',
  null, null, date '2026-12-01', date '2026-12-07');
select pg_temp.check('a list with no clue of its own is called by its name',
  public.daily_theme(date '2026-12-03')->>'clue' = 'Anniversary week');
-- Without a spangram it can still pick the daily word; it just cannot build a
-- Weave board, which the generator decides rather than this.
select pg_temp.check('and may have no spangram at all',
  public.daily_theme(date '2026-12-03')->'spangram' = 'null'::jsonb);

-- ---------------------------------------------------------------------------
-- What is refused
-- ---------------------------------------------------------------------------
select pg_temp.check('a spangram that will not thread is refused while somebody is looking',
  (public.save_word_list(null, 'Too short', 'shares', null, 'short',
     date '2027-01-01', date '2027-01-07')->>'reason') like 'a spangram is one word%');
select pg_temp.check('and one with a space in it',
  (public.save_word_list(null, 'Spaced', 'shares', null, 'employee owned',
     date '2027-01-01', date '2027-01-07')->>'ok') = 'false');
select pg_temp.check('a window cannot finish before it starts',
  (public.save_word_list(null, 'Backwards', 'shares', null, null,
     date '2027-02-10', date '2027-02-01')->>'reason') = 'it cannot finish before it starts');
-- Two themes covering one day would make the daily depend on which row was read
-- first: a puzzle that changes when nobody changed anything.
select pg_temp.check('and two lists cannot cover the same day',
  (public.save_word_list(null, 'Also October', 'shares', null, null,
     date '2026-10-15', date '2026-10-20')->>'reason') like 'another list already covers%');
select pg_temp.check('though a list may be edited without colliding with itself',
  (public.save_word_list(((select v->>'id' from t where k='oct'))::uuid, 'October',
     'shares dividend owner', 'What we all are', 'employeeowned',
     date '2026-10-01', date '2026-10-31')->>'ok') = 'true');

-- ---------------------------------------------------------------------------
-- Who may read a theme
--
-- The generator, with the service-role key, and nobody else: the words are
-- answers and nothing a browser holds should be able to ask for tomorrow's.
-- ---------------------------------------------------------------------------
select pg_temp.check('the generator may read a theme',
  has_function_privilege('service_role', 'public.daily_theme(date)', 'execute'));
select pg_temp.check('and no web role may',
  not has_function_privilege('authenticated', 'public.daily_theme(date)', 'execute')
  and not has_function_privilege('anon', 'public.daily_theme(date)', 'execute'));

\echo '--- word list checks passed ---'
