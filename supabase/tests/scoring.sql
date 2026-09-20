-- What a question is worth, and what it costs.
--
-- Every question used to be worth one and a wrong answer cost nothing. Now a
-- question carries its own points and two switches. What has to hold: the
-- points multiply, partial credit is still a fraction of them, a wrong answer
-- costs the question's own points where the switch is on, and -- the one that
-- matters -- a part-marked question never takes that deduction, because
-- "wrong" is not a state it has.
\set ON_ERROR_STOP on

create or replace function pg_temp.check(label text, got boolean) returns void
language plpgsql as $$
begin
  raise notice '%  %', case when got is true then 'PASS' else 'FAIL' end, label;
  if got is not true then raise exception 'failed: %', label; end if;
end $$;

insert into auth.users (id, email) values
  ('b8000000-0000-0000-0000-000000000001', 'points.host@amherstcomm.net'),
  ('b8000000-0000-0000-0000-000000000002', 'polly.points@amherstcomm.net'),
  ('b8000000-0000-0000-0000-000000000003', 'wendell.wrong@amherstcomm.net'),
  ('b8000000-0000-0000-0000-000000000004', 'sandra.skipper@amherstcomm.net')
on conflict do nothing;
insert into public.role_grants (user_id, role)
values ('b8000000-0000-0000-0000-000000000001', 'games.edit')
on conflict do nothing;

set session "test.uid" = 'b8000000-0000-0000-0000-000000000001';
create temp table sess as
  select (public.create_session('Points Night', 'strict', 'live')->>'id')::uuid id;

/** A question, with what it is worth and its two switches. */
create or replace function pg_temp.ask(
  kind text, prompt text, payload jsonb, answer jsonb,
  points numeric default 1, wrong boolean default false, skip boolean default false
) returns uuid language sql as $$
  select (public.save_item((select id from sess), null, kind, prompt, payload, answer,
                           points, wrong, skip)->>'id')::uuid
$$;

/** Answering, straight into the table: what is under test is the scoring. */
create or replace function pg_temp.answered(item uuid, who uuid, value jsonb)
returns void language sql as $$
  insert into public.responses (item_id, user_id, value, submitted_at)
  values (item, who, value, now()) on conflict (item_id, user_id) do update set value = excluded.value
$$;

create or replace function pg_temp.scored(item uuid, who uuid) returns numeric
language sql as $$
  select coalesce((select ip.points from public.item_points(item) ip where ip.user_id = who), 0)
$$;

-- ---------------------------------------------------------------------------
-- Points multiply
-- ---------------------------------------------------------------------------
create temp table q as select pg_temp.ask(
  'choice', 'Who owns this company?',
  '{"options": ["We do", "The bank"]}'::jsonb, '{"correct": ["We do"]}'::jsonb, 5) id;
update public.items set state = 'revealed' where id = (select id from q);
select pg_temp.answered((select id from q), 'b8000000-0000-0000-0000-000000000002', '"We do"');
select pg_temp.answered((select id from q), 'b8000000-0000-0000-0000-000000000003', '"The bank"');

select pg_temp.check('a right answer pays what the question is worth',
  pg_temp.scored((select id from q), 'b8000000-0000-0000-0000-000000000002') = 5);
select pg_temp.check('and a wrong one costs nothing while the switch is off',
  pg_temp.scored((select id from q), 'b8000000-0000-0000-0000-000000000003') = 0);
-- Made first, then looked at: calling the helper inside a where clause runs it
-- once per row of the table being scanned, which makes a question per row.
create temp table plain as select pg_temp.ask('open', 'Anything?', '{}'::jsonb, null) id;
select pg_temp.check('a question defaults to one point',
  (select points from public.items where id = (select id from plain)) = 1);
select pg_temp.check('and cannot be worth nothing, or more than a hundred',
  (public.save_item((select id from sess), null, 'open', 'x', '{}'::jsonb, null, 0)->>'reason')
    like 'a question is worth more than nothing%'
  and (public.save_item((select id from sess), null, 'open', 'x', '{}'::jsonb, null, 101)->>'reason')
    like 'a question is worth more than nothing%');

-- ---------------------------------------------------------------------------
-- A wrong answer, where the switch is on
-- ---------------------------------------------------------------------------
create temp table qw as select pg_temp.ask(
  'choice', 'Which year?', '{"options": ["1998", "2011"]}'::jsonb,
  '{"correct": ["1998"]}'::jsonb, 4, true) id;
update public.items set state = 'revealed' where id = (select id from qw);
select pg_temp.answered((select id from qw), 'b8000000-0000-0000-0000-000000000002', '"1998"');
select pg_temp.answered((select id from qw), 'b8000000-0000-0000-0000-000000000003', '"2011"');

select pg_temp.check('a wrong answer costs the question its own points',
  pg_temp.scored((select id from qw), 'b8000000-0000-0000-0000-000000000003') = -4);
select pg_temp.check('while the right one still pays them',
  pg_temp.scored((select id from qw), 'b8000000-0000-0000-0000-000000000002') = 4);

-- ---------------------------------------------------------------------------
-- The one that matters: a part-marked question takes no deduction
-- ---------------------------------------------------------------------------
create temp table qm as select pg_temp.ask(
  'match', 'Match the year to the event',
  '{"left": ["1998", "2011"], "right": ["ESOP formed", "Fiber launch"]}'::jsonb,
  '{"pairs": {"1998": "ESOP formed", "2011": "Fiber launch"}}'::jsonb, 6, true) id;
update public.items set state = 'revealed' where id = (select id from qm);
-- One pair of two: half the question.
select pg_temp.answered((select id from qm), 'b8000000-0000-0000-0000-000000000002',
  '{"1998": "ESOP formed", "2011": "ESOP formed"}');
-- Both pairs wrong: nothing earned, and nothing taken away.
select pg_temp.answered((select id from qm), 'b8000000-0000-0000-0000-000000000003',
  '{"1998": "Fiber launch", "2011": "ESOP formed"}');

select pg_temp.check('half a matching question is half its points',
  pg_temp.scored((select id from qm), 'b8000000-0000-0000-0000-000000000002') = 3);
select pg_temp.check('and getting none of it right costs nothing, deduction or not',
  pg_temp.scored((select id from qm), 'b8000000-0000-0000-0000-000000000003') = 0);
select pg_temp.check('because matching is marked in parts',
  public.part_marked((select id from qm))
  and not public.part_marked((select id from qw)));
create temp table qmulti as select pg_temp.ask('choice', 'Which of these?',
  '{"options": ["a", "b", "c"], "multi": true}'::jsonb,
  '{"correct": ["a", "b"]}'::jsonb, 2, true) id;
select pg_temp.check('as is a choice with more than one right answer',
  public.part_marked((select id from qmulti)));

-- ---------------------------------------------------------------------------
-- Not answering at all
-- ---------------------------------------------------------------------------
create temp table qs as select pg_temp.ask(
  'choice', 'Still here?', '{"options": ["yes", "no"]}'::jsonb,
  '{"correct": ["yes"]}'::jsonb, 3, false, true) id;
update public.items set state = 'revealed' where id = (select id from qs);
select pg_temp.answered((select id from qs), 'b8000000-0000-0000-0000-000000000002', '"yes"');
-- Sandra played the session but not this question.
select pg_temp.answered((select id from q), 'b8000000-0000-0000-0000-000000000004', '"The bank"');

select pg_temp.check('not answering costs the points when that switch is on',
  pg_temp.scored((select id from qs), 'b8000000-0000-0000-0000-000000000004') = -3);
select pg_temp.check('and the one who answered is unaffected',
  pg_temp.scored((select id from qs), 'b8000000-0000-0000-0000-000000000002') = 3);
select pg_temp.check('somebody who never played the session at all is not scored',
  pg_temp.scored((select id from qs), 'b8000000-0000-0000-0000-000000000001') = 0);
select pg_temp.check('and with the switch off, a skipped question costs nothing',
  pg_temp.scored((select id from qw), 'b8000000-0000-0000-0000-000000000004') = 0);

-- ---------------------------------------------------------------------------
-- What the board makes of it
-- ---------------------------------------------------------------------------
-- Wendell: the five-pointer wrong with no deduction (0), the four-pointer
-- wrong with one (-4), the matching question wrong and part-marked (0), and
-- the three-pointer he never answered at all (-3).
select pg_temp.check('the standings add the points up, deductions and all',
  (select (x->>'points')::numeric
   from jsonb_array_elements(public.session_leaderboard((select id from sess))->'standings') x
   where x->>'name' = 'Wendell Wrong') = -7);
-- Polly: 5 + 4 + half of 6 + 3.
select pg_temp.check('and a good round adds up the same way',
  (select (x->>'points')::numeric
   from jsonb_array_elements(public.session_leaderboard((select id from sess))->'standings') x
   where x->>'name' = 'Polly Points') = 15);
select pg_temp.check('the editor is told what each question is worth',
  (select (x->>'points')::numeric
   from jsonb_array_elements(public.session_sheet((select id from sess))->'items') x
   where x->>'prompt' = 'Which year?') = 4
  and (select (x->>'penalty_wrong')::boolean
   from jsonb_array_elements(public.session_sheet((select id from sess))->'items') x
   where x->>'prompt' = 'Which year?'));

-- "Nobody got that one" over a question somebody got half of is a lie by
-- omission, and it was what the screen said.
select pg_temp.check('a question nobody had full marks on says who came closest',
  (public.item_winner((select id from qm))->>'name') is null
  and (public.item_winner((select id from qm))->'best'->>'name') = 'Polly Points'
  and (public.item_winner((select id from qm))->'best'->>'points')::numeric = 3
  and (public.item_winner((select id from qm))->'best'->>'of')::numeric = 6);
select pg_temp.check('and one somebody did have full marks on names them',
  (public.item_winner((select id from qw))->>'name') = 'Polly Points');

\echo '--- scoring checks passed ---'
