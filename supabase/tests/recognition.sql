-- Recognition: nominations, the wall, and award rounds.
--
-- What has to hold: anybody can nominate anybody but themselves; nothing is
-- on the wall until a reviewer posts it, and the wall names the nominator only
-- if they said so (reviewers always see); nobody reviews or picks themselves;
-- a winner is a posted nomination made within the round's dates; posting and
-- winning each email the nominee once, and an email that has stopped being
-- true -- taken down, no longer the winner -- is not sent.
\set ON_ERROR_STOP on

insert into auth.users (id, email) values
  ('51000000-0000-0000-0000-000000000001', 'recog.reviewer@example.com'),
  ('51000000-0000-0000-0000-000000000002', 'recog.ann@example.com'),
  ('51000000-0000-0000-0000-000000000003', 'recog.bo@example.com'),
  ('51000000-0000-0000-0000-000000000004', 'recog.cy@example.com')
on conflict do nothing;
insert into public.capability_grants (user_id, capability)
values ('51000000-0000-0000-0000-000000000001', 'recognition.manage')
on conflict do nothing;

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
create or replace function pg_temp.on_wall(p_id uuid) returns jsonb
language sql as $$
  select x from jsonb_array_elements(public.recognition_view()->'wall') x where (x->>'id')::uuid = p_id
$$;
create or replace function pg_temp.claim() returns jsonb
language sql as $$ select public.recognition_mail_claim(50)->'mail' $$;
create or replace function pg_temp.today() returns date
language sql as $$ select (now() at time zone public.office_zone())::date $$;

\set REVIEWER '51000000-0000-0000-0000-000000000001'
\set ANN '51000000-0000-0000-0000-000000000002'
\set BO '51000000-0000-0000-0000-000000000003'
\set CY '51000000-0000-0000-0000-000000000004'

-- ---------------------------------------------------------------------------
-- Nominating
-- ---------------------------------------------------------------------------
select pg_temp.as_(:'ANN');
select pg_temp.check('nobody nominates themselves',
  public.nominate(:'ANN', 'I stayed late to fix the switch at the CO.')->>'reason' = 'you cannot nominate yourself');
select pg_temp.check('a nomination says what they did',
  public.nominate(:'BO', 'Great job')->>'ok' = 'false');
insert into t select 'quiet', public.nominate(:'BO',
  '  Bo stayed late on a Friday to get a farm customer back online after the storm.  ', false);
insert into t select 'named', public.nominate(:'CY',
  'Cy rewrote the outage call script so customers hear an estimate, not a shrug.', true);
select pg_temp.check('it waits, and is not on the wall',
  pg_temp.on_wall(pg_temp.id('quiet')) is null
  and exists (select 1 from jsonb_array_elements(public.recognition_view()->'mine') m
              where (m->>'id')::uuid = pg_temp.id('quiet') and m->>'status' = 'waiting'));
select pg_temp.check('a player sees no review queue',
  public.recognition_view()->'review' = 'null'::jsonb
  and public.recognition_waiting() = 0);
select pg_temp.check('nor can they post one',
  public.review_nomination(pg_temp.id('quiet'), true)->>'reason' = 'not allowed');
insert into t select 'gone', public.nominate(:'CY', 'Cy brought donuts for the whole plant on Monday.');
select public.withdraw_nomination(pg_temp.id('gone'));
select pg_temp.check('one still waiting can be taken back',
  not exists (select 1 from public.recognition_nominations where id = pg_temp.id('gone')));

select pg_temp.as_(:'CY');
insert into t select 'about_rev', public.nominate(:'REVIEWER',
  'Our reviewer covered every on-call shift over Thanksgiving week.');

-- ---------------------------------------------------------------------------
-- Reviewing
-- ---------------------------------------------------------------------------
select pg_temp.as_(:'REVIEWER');
select pg_temp.check('a reviewer sees who nominated, even when the wall will not',
  exists (select 1 from jsonb_array_elements(public.recognition_view()->'review'->'nominations') x
          where (x->>'id')::uuid = pg_temp.id('quiet') and (x->'from'->>'user')::uuid = :'ANN'
            and not (x->>'show_name')::boolean)
  and public.recognition_waiting() = 2);
select pg_temp.check('nobody reviews a nomination about themselves',
  public.review_nomination(pg_temp.id('about_rev'), true)->>'reason'
  = 'somebody else reviews nominations about you');
select public.review_nomination(pg_temp.id('quiet'), true, 'lovely');
select public.review_nomination(pg_temp.id('named'), true);
select pg_temp.as_(:'BO');
select pg_temp.check('posted, it is on the wall, trimmed, without a name the nominator kept back',
  pg_temp.on_wall(pg_temp.id('quiet'))->>'story'
    = 'Bo stayed late on a Friday to get a farm customer back online after the storm.'
  and pg_temp.on_wall(pg_temp.id('quiet'))->'from' = 'null'::jsonb
  and (pg_temp.on_wall(pg_temp.id('quiet'))->'who'->>'user')::uuid = :'BO');
select pg_temp.check('and with it, when they said so',
  (pg_temp.on_wall(pg_temp.id('named'))->'from'->>'user')::uuid = :'ANN');
select pg_temp.check('the reviewer''s note is not on the wall',
  pg_temp.on_wall(pg_temp.id('quiet'))->'note' is null);
select pg_temp.check('a reviewed one is not the nominator''s to take back',
  (select public.withdraw_nomination(pg_temp.id('quiet'))->>'ok' from (select pg_temp.as_(:'ANN')) x) = 'false');

-- Posting emails the nominee, once.
insert into t select 'posted', jsonb_build_object('mail', pg_temp.claim());
select pg_temp.check('each nominee is told it went up, with the story and the name only if shown',
  jsonb_array_length((select v->'mail' from t where k = 'posted')) = 2
  and exists (select 1 from jsonb_array_elements((select v->'mail' from t where k = 'posted')) m
              where m->>'to' = 'recog.bo@example.com' and m->>'kind' = 'posted' and m->'from' = 'null'::jsonb)
  and exists (select 1 from jsonb_array_elements((select v->'mail' from t where k = 'posted')) m
              where m->>'to' = 'recog.cy@example.com' and m->>'from' is not null));
select public.recognition_mail_done((m->>'id')::bigint)
  from jsonb_array_elements((select v->'mail' from t where k = 'posted')) m;
select pg_temp.as_(:'REVIEWER');
select public.review_nomination(pg_temp.id('named'), false, 'posted by mistake');
select public.review_nomination(pg_temp.id('named'), true);
select pg_temp.check('taken down and put back up, nobody is told twice', pg_temp.claim() = '[]'::jsonb);

-- ---------------------------------------------------------------------------
-- Award rounds
-- ---------------------------------------------------------------------------
insert into t select 'round', public.save_recognition_round(null, 'Employee Ownership Month', null,
  pg_temp.today() - 3, pg_temp.today() + 3);
insert into t select 'old', public.save_recognition_round(null, 'Last year', null,
  pg_temp.today() - 400, pg_temp.today() - 370);
select pg_temp.check('a round has to end after it starts',
  public.save_recognition_round(null, 'Backwards', null, pg_temp.today(), pg_temp.today() - 1)->>'ok' = 'false');
select pg_temp.check('a winner has to be from the round''s dates',
  public.pick_round_winner(pg_temp.id('old'), pg_temp.id('quiet'))->>'reason'
  = 'that nomination was made outside this round''s dates');
select pg_temp.check('and on the wall',
  public.pick_round_winner(pg_temp.id('round'), pg_temp.id('about_rev'))->>'reason'
  = 'only a nomination on the wall can win');
select pg_temp.check('a reviewer picks one',
  public.pick_round_winner(pg_temp.id('round'), pg_temp.id('quiet'), 'For keeping a farm running.')->>'ok' = 'true');
select pg_temp.as_(:'CY');
select pg_temp.check('everybody sees the winner, the note, and the award on the wall',
  exists (select 1 from jsonb_array_elements(public.recognition_view()->'rounds') r
          where (r->>'id')::uuid = pg_temp.id('round')
            and (r->'winner'->'who'->>'user')::uuid = :'BO' and r->'winner'->>'note' = 'For keeping a farm running.')
  and pg_temp.on_wall(pg_temp.id('quiet'))->'awards' = '["Employee Ownership Month"]'::jsonb);
select pg_temp.as_(:'REVIEWER');
select public.pick_round_winner(pg_temp.id('round'), pg_temp.id('named'));
-- Claimed in a statement of its own: the skip it records is not visible to
-- the statement that made it.
insert into t select 'award', jsonb_build_object('mail', pg_temp.claim());
select pg_temp.check('a changed mind tells the new winner, not the old one',
  (select jsonb_agg(m->>'to') from jsonb_array_elements((select v->'mail' from t where k = 'award')) m
   where m->>'kind' = 'award') = '["recog.cy@example.com"]'::jsonb
  and exists (select 1 from public.recognition_mail where user_id = :'BO' and kind = 'award' and outcome = 'skipped'));
select public.review_nomination(pg_temp.id('named'), false);
select pg_temp.check('taking the winner down takes the award with it',
  (select winner_id from public.recognition_rounds where id = pg_temp.id('round')) is null);

-- ---------------------------------------------------------------------------
-- Who may
-- ---------------------------------------------------------------------------
select pg_temp.as_(:'ANN');
select pg_temp.check('a player cannot open a round or pick a winner',
  public.save_recognition_round(null, 'Mine', null, pg_temp.today(), pg_temp.today())->>'reason' = 'not allowed'
  and public.pick_round_winner(pg_temp.id('round'), pg_temp.id('quiet'))->>'reason' = 'not allowed');
select pg_temp.check('a round that has not started is the reviewers'' business',
  (select public.save_recognition_round(null, 'Next year', null, pg_temp.today() + 300, pg_temp.today() + 330)
   from (select pg_temp.as_(:'REVIEWER')) x)->>'ok' = 'true'
  and (select count(*) from jsonb_array_elements((select public.recognition_view()
       from (select pg_temp.as_(:'ANN')) y)->'rounds') r where r->>'title' = 'Next year') = 0);
select pg_temp.as_('');
select pg_temp.check('nobody signed out sees or nominates anything',
  public.recognition_view()->>'ok' = 'false'
  and public.nominate(:'BO', 'Somebody anonymous wants to nominate Bo for this.')->>'ok' = 'false');
select pg_temp.check('the mail queue is the service role''s alone',
  not has_function_privilege('authenticated', 'public.recognition_mail_claim(int)', 'execute')
  and has_function_privilege('service_role', 'public.recognition_mail_claim(int)', 'execute'));

delete from public.recognition_rounds where title in ('Employee Ownership Month', 'Last year', 'Next year');
delete from public.recognition_nominations where nominee in (:'ANN', :'BO', :'CY', :'REVIEWER');

\echo '--- recognition checks passed ---'
