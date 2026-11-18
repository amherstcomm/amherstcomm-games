-- Private comments: an open question only the host and site admins read.
\set ON_ERROR_STOP on

insert into auth.users (id, email) values
  ('57000000-0000-0000-0000-000000000001', 'private-host@example.com'),
  ('57000000-0000-0000-0000-000000000002', 'private-ada@example.com'),
  ('57000000-0000-0000-0000-000000000003', 'private-bo@example.com'),
  ('57000000-0000-0000-0000-000000000009', 'private-admin@example.com')
on conflict do nothing;
insert into public.role_grants (user_id, role) values
  ('57000000-0000-0000-0000-000000000001', 'games.edit'),
  ('57000000-0000-0000-0000-000000000009', 'games.admin')
on conflict do nothing;
insert into public.profiles (id, display_name)
values ('57000000-0000-0000-0000-000000000002', 'Private Ada')
on conflict (id) do update set display_name = excluded.display_name;

create or replace function pg_temp.check(label text, got boolean) returns void
language plpgsql as $$
begin
  raise notice '%  %', case when got is true then 'PASS' else 'FAIL' end, label;
  if got is not true then raise exception 'failed: %', label; end if;
end $$;

create temp table t (k text primary key, v jsonb);
create or replace function pg_temp.id(k text) returns uuid language sql as $$
  select (v->>'id')::uuid from t where t.k = $1 $$;

-- ---------------------------------------------------------------------------
-- An ordinary survey: readers see who wrote it
-- ---------------------------------------------------------------------------
set session "test.uid" = '57000000-0000-0000-0000-000000000001';
insert into t select 'sess', public.create_session('Team feedback', 'strict', 'open');
insert into t select 'q', public.save_item(pg_temp.id('sess'), null, 'open',
  'Anything you would rather tell us privately?', '{"private":true}'::jsonb);
insert into t select 'pub', public.save_item(pg_temp.id('sess'), null, 'open', 'One word for this month', '{}'::jsonb);
select public.set_session_options(pg_temp.id('sess'), null, true);
select public.advance_session(pg_temp.id('sess'), 'start');

set session "test.uid" = '57000000-0000-0000-0000-000000000002';
select public.begin_playing(pg_temp.id('sess'));
select public.current_item(pg_temp.id('sess'), null);
select public.answer_item(pg_temp.id('q'), '"The on-call rota is wearing people out."'::jsonb);
select pg_temp.check('a player cannot read private comments',
  (public.private_comments(pg_temp.id('q'))->>'reason') = 'only the host and admins read these');

set session "test.uid" = '57000000-0000-0000-0000-000000000001';
insert into t select 'host', public.private_comments(pg_temp.id('q'));
select pg_temp.check('the host reads them, with the name, in an ordinary survey',
  (select v->'comments'->0->>'text' from t where k = 'host') = 'The on-call rota is wearing people out.'
  and (select v->'comments'->0->>'who' from t where k = 'host') = 'Private Ada');
select pg_temp.check('the results show a count and not the words',
  (select c->'chart' from jsonb_array_elements(public.session_results(pg_temp.id('sess'))->'items') c
   where c->>'id' = (select v->>'id' from t where k = 'q'))
    = '{"type":"private","total":1,"readable":true}'::jsonb);
select pg_temp.check('the presenter view gives a count and no list',
  (public.presenter_view(pg_temp.id('q'))->>'answered')::int = 1
  and (public.presenter_view(pg_temp.id('q'))->'responses') = '[]'::jsonb);
select pg_temp.check('a question not set private is not readable this way',
  (public.private_comments(pg_temp.id('pub'))->>'reason') = 'that question is not private');

set session "test.uid" = '57000000-0000-0000-0000-000000000009';
select pg_temp.check('a site admin who did not host it reads them too',
  (public.private_comments(pg_temp.id('q'))->'comments'->0->>'who') = 'Private Ada');

-- shared with everybody once it closes, and still not the private words
set session "test.uid" = '57000000-0000-0000-0000-000000000001';
select public.advance_session(pg_temp.id('sess'), 'close');
set session "test.uid" = '57000000-0000-0000-0000-000000000003';
insert into t select 'shared', public.session_results(pg_temp.id('sess'));
select pg_temp.check('shared results give everybody else a count, and no way in',
  (select v->>'ok' from t where k = 'shared') = 'true'
  and (select c->'chart' from jsonb_array_elements((select v->'items' from t where k = 'shared')) c
       where c->>'id' = (select v->>'id' from t where k = 'q'))
    = '{"type":"private","total":1,"readable":false}'::jsonb
  and (select v::text from t where k = 'shared') not like '%on-call rota%');

-- ---------------------------------------------------------------------------
-- In front of a room
-- ---------------------------------------------------------------------------
set session "test.uid" = '57000000-0000-0000-0000-000000000001';
insert into t select 'room', public.create_session('Town hall');
insert into t select 'rq', public.save_item(pg_temp.id('room'), null, 'open', 'Tell us privately', '{"private":true}'::jsonb);
select public.advance_session(pg_temp.id('room'), 'start');
select public.advance_session(pg_temp.id('room'), 'show', pg_temp.id('rq'));
set session "test.uid" = '57000000-0000-0000-0000-000000000002';
select public.answer_item(pg_temp.id('rq'), '"Something for the board"'::jsonb);
set session "test.uid" = '57000000-0000-0000-0000-000000000001';
select public.advance_session(pg_temp.id('room'), 'lock', pg_temp.id('rq'));
select public.advance_session(pg_temp.id('room'), 'reveal', pg_temp.id('rq'));
select pg_temp.check('the room is never shown a tally of them',
  (public.item_tally(pg_temp.id('rq'))->>'ok') = 'false');

-- ---------------------------------------------------------------------------
-- A fully anonymous survey: never a name, and not under its minimum
-- ---------------------------------------------------------------------------
insert into t select 'anon', public.create_session('Pay feedback', 'strict', 'open');
select public.set_session_privacy(pg_temp.id('anon'), 'full');
insert into t select 'aq', public.save_item(pg_temp.id('anon'), null, 'open', 'Anything else?', '{"private":true}'::jsonb);
select public.advance_session(pg_temp.id('anon'), 'start');
set session "test.uid" = '57000000-0000-0000-0000-000000000002';
select public.answer_anonymously(pg_temp.id('aq'), '"Semi-monthly would break my budget."'::jsonb, repeat('57', 32));
set session "test.uid" = '57000000-0000-0000-0000-000000000001';
select pg_temp.check('under the minimum, even the host is told only how many',
  (public.private_comments(pg_temp.id('aq'))->>'reason') = 'waiting'
  and (public.private_comments(pg_temp.id('aq'))->>'answered')::int = 1
  and not (public.private_comments(pg_temp.id('aq')) ? 'comments'));
select public.set_session_privacy(pg_temp.id('anon'), null, 5);
-- four more people
do $$
declare n int;
begin
  for n in 4..7 loop
    insert into auth.users (id, email)
    values (('57000000-0000-0000-0000-00000000000' || n)::uuid, 'private-' || n || '@example.com')
    on conflict do nothing;
    perform set_config('test.uid', '57000000-0000-0000-0000-00000000000' || n, false);
    perform public.answer_anonymously(
      (select id from public.items where prompt = 'Anything else?' limit 1),
      to_jsonb('Comment ' || n), repeat(lpad(n::text, 2, '0'), 32));
  end loop;
end $$;
set session "test.uid" = '57000000-0000-0000-0000-000000000001';
insert into t select 'anonread', public.private_comments(pg_temp.id('aq'));
select pg_temp.check('at the minimum, the comments, with no name and no time on any',
  (select v->>'ok' from t where k = 'anonread') = 'true'
  and jsonb_array_length((select v->'comments' from t where k = 'anonread')) = 5
  and not exists (select 1 from jsonb_array_elements((select v->'comments' from t where k = 'anonread')) c
                  where c->>'who' is not null or c->>'at' is not null));
