-- The whiteboard: one question a week, and who answered what.
--
-- What has to hold: you see the board once you have answered, and not before
-- (an organiser always, anybody once the week is over); an answer fits the
-- question -- one of its choices, or words -- and can be changed or taken back
-- only while its week lasts; a week has one question at most and a week gone
-- cannot be given one; once people have answered, the kind of question and
-- how many choices it has stay put; and only whoever writes the questions can
-- write them, read the suggestions, or take an answer down.
\set ON_ERROR_STOP on

insert into auth.users (id, email) values
  ('50000000-0000-0000-0000-000000000001', 'board.writer@example.com'),
  ('50000000-0000-0000-0000-000000000002', 'board.ann@example.com'),
  ('50000000-0000-0000-0000-000000000003', 'board.bo@example.com')
on conflict do nothing;
insert into public.capability_grants (user_id, capability)
values ('50000000-0000-0000-0000-000000000001', 'whiteboard.manage')
on conflict do nothing;
insert into public.profiles (id, display_name) values
  ('50000000-0000-0000-0000-000000000002', 'Ann Board')
on conflict (id) do update set display_name = excluded.display_name;

create or replace function pg_temp.check(label text, got boolean) returns void
language plpgsql as $$
begin
  raise notice '%  %', case when got is true then 'PASS' else 'FAIL' end, label;
  if got is not true then raise exception 'failed: %', label; end if;
end $$;
create temp table t (k text primary key, v jsonb);
create or replace function pg_temp.id(key text) returns uuid
language sql as $$ select (v->>'id')::uuid from t where k = key $$;
create or replace function pg_temp.as_(who text) returns void
language sql as $$ select set_config('test.uid', who, false) $$;
create or replace function pg_temp.wk(n int) returns date
language sql as $$ select public.whiteboard_week() + 7 * n $$;

\set WRITER '50000000-0000-0000-0000-000000000001'
\set ANN '50000000-0000-0000-0000-000000000002'
\set BO '50000000-0000-0000-0000-000000000003'

-- Earlier runs of this file, and anything else on these weeks.
delete from public.whiteboard_questions where week_of between pg_temp.wk(-2) and pg_temp.wk(2);

-- ---------------------------------------------------------------------------
-- Writing them
-- ---------------------------------------------------------------------------
select pg_temp.as_(:'ANN');
select pg_temp.check('a player cannot write a question',
  public.save_whiteboard_question(null, 'Mine?', 'text', null, pg_temp.wk(0))->>'reason' = 'not allowed');
select pg_temp.check('nor read the suggestions',
  public.whiteboard_sheet()->>'reason' = 'not allowed');
select pg_temp.check('but can suggest one',
  public.suggest_whiteboard_question('  Cats or dogs?  ')->>'ok' = 'true');

select pg_temp.as_(:'WRITER');
select pg_temp.check('the writer sees it, trimmed, with who suggested it',
  exists (select 1 from jsonb_array_elements(public.whiteboard_sheet()->'suggestions') x
          where x->>'prompt' = 'Cats or dogs?' and x->>'from' = 'Ann Board'));
insert into t select 'laundry', public.save_whiteboard_question(null, 'Do you sort your laundry?', 'choice',
  array['Always', ' Sometimes ', '', 'Never'], pg_temp.wk(0));
select pg_temp.check('a choice question keeps its answers, trimmed, blanks dropped',
  (select options from public.whiteboard_questions where id = pg_temp.id('laundry'))
  = array['Always', 'Sometimes', 'Never']);
insert into t select 'weekend', public.save_whiteboard_question(null, 'Best thing you did this weekend?', 'text',
  array['ignored'], pg_temp.wk(1),
  (select (x->>'id')::uuid from jsonb_array_elements(public.whiteboard_sheet()->'suggestions') x
   where x->>'prompt' = 'Cats or dogs?'));
select pg_temp.check('a written one has no choices, and the suggestion it came from is used',
  (select cardinality(options) from public.whiteboard_questions where id = pg_temp.id('weekend')) = 0
  and not exists (select 1 from jsonb_array_elements(public.whiteboard_sheet()->'suggestions') x
                  where x->>'prompt' = 'Cats or dogs?'));
select pg_temp.check('a week has one question',
  public.save_whiteboard_question(null, 'Another?', 'text', null, pg_temp.wk(0))->>'reason'
  = 'that week already has a question');
select pg_temp.check('a week is its Monday',
  public.save_whiteboard_question(null, 'Tuesday?', 'text', null, pg_temp.wk(0) + 1)->>'reason'
  = 'a week is given by its Monday');
select pg_temp.check('a week gone cannot be given one',
  public.save_whiteboard_question(null, 'Too late?', 'text', null, pg_temp.wk(-1))->>'reason'
  = 'that week has gone');
select pg_temp.check('one choice is not a choice',
  public.save_whiteboard_question(null, 'Yes?', 'choice', array['Yes'], null)->>'ok' = 'false');
select pg_temp.check('nor are two the same',
  public.save_whiteboard_question(null, 'Yes?', 'choice', array['Yes', 'yes'], null)->>'reason'
  = 'two of the answers are the same');

-- ---------------------------------------------------------------------------
-- Answering, and who sees what
-- ---------------------------------------------------------------------------
select pg_temp.as_(:'ANN');
select pg_temp.check('this week''s question is the one on the board',
  (public.whiteboard_view()->'question'->>'id')::uuid = pg_temp.id('laundry')
  and public.whiteboard_view()->'question'->>'state' = 'open');
select pg_temp.check('next week''s is nobody''s business but the writer''s',
  public.whiteboard_view(pg_temp.id('weekend'))->'question' = 'null'::jsonb);
select pg_temp.check('a written answer to a choice question is refused',
  public.answer_whiteboard(pg_temp.id('laundry'), null, 'I do')->>'reason' = 'pick one of the answers');
select pg_temp.check('so is a choice that is not there',
  public.answer_whiteboard(pg_temp.id('laundry'), 3)->>'ok' = 'false');

select pg_temp.as_(:'BO');
select public.answer_whiteboard(pg_temp.id('laundry'), 2);
select pg_temp.as_(:'ANN');
select pg_temp.check('before answering, the count but not the faces',
  (public.whiteboard_view()->>'count')::int = 1
  and public.whiteboard_view()->'answers' = 'null'::jsonb);
select public.answer_whiteboard(pg_temp.id('laundry'), 0);
select pg_temp.check('after, everybody, with their names and what they picked',
  jsonb_array_length(public.whiteboard_view()->'answers') = 2
  and exists (select 1 from jsonb_array_elements(public.whiteboard_view()->'answers') a
              where a->>'name' = 'Ann Board' and (a->>'choice')::int = 0)
  and exists (select 1 from jsonb_array_elements(public.whiteboard_view()->'answers') a
              where (a->>'user')::uuid = :'BO' and a->>'name' <> '' and (a->>'choice')::int = 2)
  and (public.whiteboard_view()->'mine'->>'choice')::int = 0);
select public.answer_whiteboard(pg_temp.id('laundry'), 1);
select pg_temp.check('an answer can be changed, and is still one answer',
  (public.whiteboard_view()->'mine'->>'choice')::int = 1
  and (public.whiteboard_view()->>'count')::int = 2);
select public.withdraw_whiteboard_answer(pg_temp.id('laundry'));
select pg_temp.check('or taken back, and the faces go with it',
  public.whiteboard_view()->'mine' = 'null'::jsonb
  and public.whiteboard_view()->'answers' = 'null'::jsonb);
select public.answer_whiteboard(pg_temp.id('laundry'), 1);

select pg_temp.as_(:'WRITER');
select pg_temp.check('the writer sees the board without answering',
  jsonb_array_length(public.whiteboard_view()->'answers') = 2);
select pg_temp.check('the wording can be mended once people have answered',
  public.save_whiteboard_question(pg_temp.id('laundry'), 'Do you sort your laundry by colour?', 'choice',
    array['Always', 'Sometimes', 'Never'], pg_temp.wk(0))->>'ok' = 'true');
select pg_temp.check('but not the number of choices',
  public.save_whiteboard_question(pg_temp.id('laundry'), 'Do you?', 'choice',
    array['Yes', 'No'], pg_temp.wk(0))->>'ok' = 'false');
select pg_temp.check('nor the kind',
  public.save_whiteboard_question(pg_temp.id('laundry'), 'Do you?', 'text', null, pg_temp.wk(0))->>'ok' = 'false');

-- ---------------------------------------------------------------------------
-- Written answers, and taking one down
-- ---------------------------------------------------------------------------
-- Next week's, brought forward to this one: laundry moves back a week, which
-- is the shape a week that has ended has.
update public.whiteboard_questions set week_of = pg_temp.wk(-1) where id = pg_temp.id('laundry');
update public.whiteboard_questions set week_of = pg_temp.wk(0) where id = pg_temp.id('weekend');
select pg_temp.as_(:'BO');
select pg_temp.check('a week that has ended takes no answers',
  public.answer_whiteboard(pg_temp.id('laundry'), 0)->>'reason' = 'that week is over');
select pg_temp.check('but its board is open to anybody, and it is in the weeks gone',
  jsonb_array_length(public.whiteboard_view(pg_temp.id('laundry'))->'answers') = 2
  and public.whiteboard_view(pg_temp.id('laundry'))->'question'->>'state' = 'closed'
  and exists (select 1 from jsonb_array_elements(public.whiteboard_view()->'past') x
              where (x->>'id')::uuid = pg_temp.id('laundry') and (x->>'answers')::int = 2));
select pg_temp.check('an empty written answer is refused',
  public.answer_whiteboard(pg_temp.id('weekend'), null, '   ')->>'reason' = 'write an answer');
select pg_temp.check('and so is one over 280 characters',
  public.answer_whiteboard(pg_temp.id('weekend'), null, repeat('x', 281))->>'ok' = 'false');
select public.answer_whiteboard(pg_temp.id('weekend'), null, '  Went to a Bucks game  ');
select pg_temp.check('what they wrote is on the board, trimmed',
  (select a->>'body' from jsonb_array_elements(public.whiteboard_view()->'answers') a
   where (a->>'user')::uuid = :'BO') = 'Went to a Bucks game');
select pg_temp.check('a player cannot take somebody''s answer down',
  public.remove_whiteboard_answer(pg_temp.id('weekend'), :'BO')->>'reason' = 'not allowed');
select pg_temp.as_(:'WRITER');
select public.remove_whiteboard_answer(pg_temp.id('weekend'), :'BO');
select pg_temp.check('the writer can',
  (public.whiteboard_view()->>'count')::int = 0);
select pg_temp.check('an asked question stays in its week',
  public.save_whiteboard_question(pg_temp.id('laundry'), 'Do you sort your laundry?', 'choice',
    array['Always', 'Sometimes', 'Never'], pg_temp.wk(2))->>'reason' = 'it has been asked; it stays in its week');

-- ---------------------------------------------------------------------------
-- Suggestions, permissions, and nobody signed out
-- ---------------------------------------------------------------------------
select pg_temp.as_(:'ANN');
select public.suggest_whiteboard_question('Q' || n) from generate_series(1, 5) n;
select pg_temp.check('five waiting suggestions is the most',
  public.suggest_whiteboard_question('One more')->>'ok' = 'false');
select pg_temp.as_(:'WRITER');
select public.dismiss_whiteboard_suggestion((x->>'id')::uuid)
  from jsonb_array_elements(public.whiteboard_sheet()->'suggestions') x where x->>'prompt' like 'Q%';
select pg_temp.as_(:'ANN');
select pg_temp.check('dismissed ones make room again',
  public.suggest_whiteboard_question('One more')->>'ok' = 'true');

select pg_temp.as_('');
select pg_temp.check('nobody signed out sees or answers anything',
  public.whiteboard_view()->>'ok' = 'false'
  and public.answer_whiteboard(pg_temp.id('weekend'), null, 'hi')->>'ok' = 'false'
  and public.suggest_whiteboard_question('hi')->>'ok' = 'false');
select pg_temp.check('the writing permission can be handed to one person',
  exists (select 1 from public.capability_grants where user_id = :'WRITER' and capability = 'whiteboard.manage'));
select pg_temp.check('and the clock and week helpers are not for calling from outside',
  not has_function_privilege('authenticated', 'public.office_zone()', 'execute')
  and not has_function_privilege('authenticated', 'public.whiteboard_week(timestamptz)', 'execute'));

select pg_temp.as_(:'WRITER');
select public.delete_whiteboard_question(pg_temp.id('laundry'));
select public.delete_whiteboard_question(pg_temp.id('weekend'));
select pg_temp.check('deleting a question takes its answers',
  not exists (select 1 from public.whiteboard_answers where question_id in (pg_temp.id('laundry'), pg_temp.id('weekend'))));
delete from public.whiteboard_suggestions where user_id = :'ANN';

\echo '--- whiteboard checks passed ---'
