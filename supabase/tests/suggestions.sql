-- Suggestion boxes.
--
-- What has to hold: only a box's readers read what is in it -- not an
-- administrator, not anybody else; an anonymous suggestion is stored with
-- nothing that leads to its sender, and only the key they were handed brings
-- it back; a reader's answer goes to the sender alone or on the board, and the
-- board shows no sender; a named sender is emailed a reply and an anonymous
-- one is not; a box with suggestions in it cannot be deleted from under its
-- readers.
\set ON_ERROR_STOP on

insert into auth.users (id, email) values
  ('52000000-0000-0000-0000-000000000001', 'box.ceo@example.com'),
  ('52000000-0000-0000-0000-000000000002', 'box.coo@example.com'),
  ('52000000-0000-0000-0000-000000000003', 'box.ann@example.com'),
  ('52000000-0000-0000-0000-000000000004', 'box.admin@example.com')
on conflict do nothing;
insert into public.role_grants (user_id, role)
values ('52000000-0000-0000-0000-000000000004', 'games.admin')
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
create or replace function pg_temp.key(k_ text) returns text
language sql as $$ select v->>'key' from t where k = k_ $$;
create or replace function pg_temp.as_(who text) returns void
language sql as $$ select set_config('test.uid', who, false) $$;
create or replace function pg_temp.inbox_item(p_id uuid) returns jsonb
language sql as $$
  select s from jsonb_array_elements(public.suggestion_inbox()->'boxes') b,
                jsonb_array_elements(b->'suggestions') s
  where (s->>'id')::uuid = p_id
$$;

\set CEO '52000000-0000-0000-0000-000000000001'
\set COO '52000000-0000-0000-0000-000000000002'
\set ANN '52000000-0000-0000-0000-000000000003'
\set ADMIN '52000000-0000-0000-0000-000000000004'

-- ---------------------------------------------------------------------------
-- Setting the boxes up
-- ---------------------------------------------------------------------------
select pg_temp.as_(:'ANN');
select pg_temp.check('a player cannot set up a box',
  public.save_suggestion_box(null, 'Mine', null, array[:'ANN']::uuid[])->>'reason' = 'not allowed');
select pg_temp.as_(:'ADMIN');
select pg_temp.check('a box needs somebody to read it',
  public.save_suggestion_box(null, 'Nobody''s', null, '{}')->>'reason' = 'somebody has to read it');
insert into t select 'ceo', public.save_suggestion_box(null, 'The CEO''s box', 'Ray reads these', array[:'CEO']::uuid[]);
insert into t select 'coo', public.save_suggestion_box(null, 'The COO''s box', null, array[:'COO']::uuid[], true, 1);

select pg_temp.as_(:'ANN');
select pg_temp.check('everybody sees the boxes and who reads each',
  (select count(*) from jsonb_array_elements(public.suggestion_page()->'boxes') b
   where (b->>'id')::uuid in (pg_temp.id('ceo'), pg_temp.id('coo'))) = 2
  and exists (select 1 from jsonb_array_elements(public.suggestion_page()->'boxes') b
              where (b->>'id')::uuid = pg_temp.id('ceo') and (b->'readers'->0->>'user')::uuid = :'CEO'));

-- ---------------------------------------------------------------------------
-- Putting one in
-- ---------------------------------------------------------------------------
select pg_temp.check('a suggestion has to say something',
  public.submit_suggestion(pg_temp.id('ceo'), 'hi', false)->>'reason' = 'say a little more');
insert into t select 'named', public.submit_suggestion(pg_temp.id('ceo'),
  '  Could the break room get a second microwave?  ', false);
insert into t select 'anon', public.submit_suggestion(pg_temp.id('ceo'),
  'The on-call rota is unfair to the night shift.', true);
select pg_temp.check('a named one hands back no key',
  (select v->'key' from t where k = 'named') = 'null'::jsonb);
select pg_temp.check('an anonymous one hands back a long random key',
  char_length(pg_temp.key('anon')) = 64);
select pg_temp.check('and is stored with nothing that leads to the sender',
  (select sender is null and key_hash is not null and key_hash <> pg_temp.key('anon')
   from public.suggestions where id = pg_temp.id('anon')));
select pg_temp.check('nothing anywhere in the row is the sender',
  (select row_to_json(s)::text not like '%' || :'ANN' || '%' from public.suggestions s where id = pg_temp.id('anon')));

select pg_temp.check('the sender finds the named one by being them, the anonymous one by its key',
  (select count(*) from jsonb_array_elements(public.my_suggestions(array[pg_temp.key('anon')])->'suggestions') x
   where (x->>'id')::uuid in (pg_temp.id('named'), pg_temp.id('anon'))) = 2);
select pg_temp.check('without the key, the anonymous one is not theirs to see',
  not exists (select 1 from jsonb_array_elements(public.my_suggestions('{}')->'suggestions') x
              where (x->>'id')::uuid = pg_temp.id('anon')));

-- ---------------------------------------------------------------------------
-- Who reads what
-- ---------------------------------------------------------------------------
select pg_temp.as_(:'COO');
select pg_temp.check('the COO does not see what is in the CEO''s box',
  pg_temp.inbox_item(pg_temp.id('named')) is null
  and public.reply_to_suggestion(pg_temp.id('named'), 'nosy', false)->>'ok' = 'false');
select pg_temp.as_(:'ADMIN');
select pg_temp.check('nor does an administrator, who sees how many and nothing more',
  pg_temp.inbox_item(pg_temp.id('named')) is null
  and (select (b->>'count')::int from jsonb_array_elements(public.suggestion_boxes_sheet()->'boxes') b
       where (b->>'id')::uuid = pg_temp.id('ceo')) = 2
  and public.suggestion_boxes_sheet()::text not like '%microwave%');
select pg_temp.as_(:'CEO');
select pg_temp.check('the CEO reads both, the named one by name and the other as nobody',
  pg_temp.inbox_item(pg_temp.id('named'))->>'body' = 'Could the break room get a second microwave?'
  and pg_temp.inbox_item(pg_temp.id('named'))->>'from' is not null
  and pg_temp.inbox_item(pg_temp.id('anon'))->'from' = 'null'::jsonb
  and public.suggestions_unread() = 2);
select public.mark_suggestion(pg_temp.id('named'), true);
select pg_temp.check('marking one read takes it off the count', public.suggestions_unread() = 1);

-- ---------------------------------------------------------------------------
-- Answering, privately and on the board
-- ---------------------------------------------------------------------------
select public.reply_to_suggestion(pg_temp.id('named'), 'Ordered one; it arrives Monday.', false);
select public.reply_to_suggestion(pg_temp.id('anon'), 'We are moving to a four-week rota from January.', true);
select pg_temp.as_(:'ANN');
select pg_temp.check('a private answer is not on the board',
  public.suggestion_page()::text not like '%microwave%');
select pg_temp.check('a public one is, with the suggestion and no sender',
  exists (select 1 from jsonb_array_elements(public.suggestion_page()->'board') x
          where (x->>'id')::uuid = pg_temp.id('anon')
            and x->>'body' = 'The on-call rota is unfair to the night shift.'
            and x->'replies'->0->>'body' = 'We are moving to a four-week rota from January.'
            and x ? 'from' is false));
select pg_temp.check('the sender sees both answers in their own threads',
  (select count(*) from jsonb_array_elements(public.my_suggestions(array[pg_temp.key('anon')])->'suggestions') x,
                        jsonb_array_elements(x->'thread') m where m->>'author' = 'reader') = 2);
select pg_temp.check('the anonymous sender can write back with the key',
  public.suggestion_follow_up(pg_temp.id('anon'), pg_temp.key('anon'), 'Thank you. Will weekends count?')->>'ok' = 'true');
select pg_temp.check('and nobody can without it',
  public.suggestion_follow_up(pg_temp.id('anon'), 'guess', 'Pretending')->>'ok' = 'false'
  and public.suggestion_follow_up(pg_temp.id('anon'), null, 'Pretending')->>'ok' = 'false');
select pg_temp.check('writing back puts it back in the reader''s unread',
  (select read_at is null from public.suggestions where id = pg_temp.id('anon')));

-- ---------------------------------------------------------------------------
-- Email
-- ---------------------------------------------------------------------------
insert into t select 'mail', jsonb_build_object('mail', public.suggestion_mail_claim(50)->'mail');
select pg_temp.check('the CEO is told twice in all, once a suggestion: the follow-up folds into the waiting one',
  (select count(*) from jsonb_array_elements((select v->'mail' from t where k = 'mail')) m
   where m->>'kind' = 'new' and m->>'to' = 'box.ceo@example.com') = 2);
select pg_temp.check('a reader''s email names a named sender and nobody for an anonymous one',
  exists (select 1 from jsonb_array_elements((select v->'mail' from t where k = 'mail')) m
          where m->>'kind' = 'new' and m->>'body' like 'Could the break room%' and m->>'from' is not null)
  and exists (select 1 from jsonb_array_elements((select v->'mail' from t where k = 'mail')) m
              where m->>'kind' = 'new' and m->>'body' = 'Thank you. Will weekends count?'
                and m->'from' = 'null'::jsonb and (m->>'follow_up')::boolean));
select pg_temp.check('the named sender is told of the reply, and nobody is told anything about the anonymous one',
  (select jsonb_agg(m->>'to') from jsonb_array_elements((select v->'mail' from t where k = 'mail')) m
   where m->>'kind' = 'reply') = '["box.ann@example.com"]'::jsonb);
select pg_temp.check('the mail queue is the service role''s alone',
  not has_function_privilege('authenticated', 'public.suggestion_mail_claim(int)', 'execute'));

-- ---------------------------------------------------------------------------
-- Tidying
-- ---------------------------------------------------------------------------
select pg_temp.as_(:'CEO');
select public.set_suggestion_reply((select id from public.suggestion_messages
                                    where suggestion_id = pg_temp.id('anon') and author = 'reader'), false);
select pg_temp.check('an answer taken off the board takes the suggestion off with it',
  public.suggestion_page()::text not like '%rota%');
select pg_temp.as_(:'ADMIN');
select pg_temp.check('a box with suggestions in it cannot be deleted',
  public.delete_suggestion_box(pg_temp.id('ceo'))->>'ok' = 'false');
select pg_temp.check('an empty one can',
  public.delete_suggestion_box(pg_temp.id('coo'))->>'ok' = 'true');
select pg_temp.as_(:'ANN');
select pg_temp.check('a sender cannot delete one, even their own',
  public.delete_suggestion(pg_temp.id('named'))->>'ok' = 'false');
select pg_temp.as_(:'CEO');
select public.delete_suggestion(pg_temp.id('named'));
select public.delete_suggestion(pg_temp.id('anon'));
select pg_temp.check('the reader can, and its thread goes with it',
  not exists (select 1 from public.suggestion_messages where suggestion_id in (pg_temp.id('named'), pg_temp.id('anon'))));
select pg_temp.as_('');
select pg_temp.check('nobody signed out sees or sends anything',
  public.suggestion_page()->>'ok' = 'false'
  and public.submit_suggestion(pg_temp.id('ceo'), 'Signed out but trying.', true)->>'ok' = 'false');
delete from public.suggestion_boxes where id = pg_temp.id('ceo');

\echo '--- suggestion box checks passed ---'
