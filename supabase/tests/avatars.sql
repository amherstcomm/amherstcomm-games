-- Avatars, and avatars on a trivia's answers.
--
-- What has to hold: anybody sets their own avatar -- a picture from the set on
-- a colour, or a photo in their own folder -- and nobody else's; an organiser
-- takes one down and stops that person setting another; the site switch
-- turns every avatar off. In a trivia set to show them, who picked what comes
-- with their avatars: never before the reveal when it says the reveal; as
-- they answer for a room that moves together; only once you have answered,
-- for a session played at your own pace; and never anybody who answered
-- anonymously, who is only a count.
\set ON_ERROR_STOP on

insert into auth.users (id, email) values
  ('2d000000-0000-0000-0000-000000000001', 'avatar.admin@example.com'),
  ('2d000000-0000-0000-0000-000000000002', 'ada.avatar@example.com'),
  ('2d000000-0000-0000-0000-000000000003', 'bea.avatar@example.com'),
  ('2d000000-0000-0000-0000-000000000004', 'cy.avatar@example.com')
on conflict do nothing;
insert into public.role_grants (user_id, role)
values ('2d000000-0000-0000-0000-000000000001', 'games.admin')
on conflict do nothing;
insert into public.profiles (id, display_name) values
  ('2d000000-0000-0000-0000-000000000002', 'Ada Avatar'),
  ('2d000000-0000-0000-0000-000000000003', 'Bea Avatar'),
  ('2d000000-0000-0000-0000-000000000004', 'Cy Avatar')
on conflict (id) do update set display_name = excluded.display_name;

create or replace function pg_temp.check(label text, got boolean) returns void
language plpgsql as $$
begin
  raise notice '%  %', case when got is true then 'PASS' else 'FAIL' end, label;
  if got is not true then raise exception 'failed: %', label; end if;
end $$;
create or replace function pg_temp.as_(who text) returns void
language sql as $$ select set_config('test.uid', who, false) $$;
create temp table t (k text primary key, v jsonb);

-- ---------------------------------------------------------------------------
-- Setting one
-- ---------------------------------------------------------------------------
select pg_temp.as_('2d000000-0000-0000-0000-000000000002');
select pg_temp.check('a picture from the set needs a colour',
  public.set_my_avatar('preset', 'fox')->>'reason' = 'pick a picture and a colour');
insert into t select 'ada', public.set_my_avatar('preset', 'fox', '#2563eb');
select pg_temp.check('a picture from the set, on a colour, is your avatar',
  (select v->>'ok' from t where k = 'ada') = 'true'
  and public.my_avatar()->'avatar' = '{"kind": "preset", "value": "fox", "color": "#2563eb"}'::jsonb);
select pg_temp.check('a photo has to be in your own folder',
  public.set_my_avatar('photo', '2d000000-0000-0000-0000-000000000003/avatar-0f0f0f0f-0f0f-0f0f-0f0f-0f0f0f0f0f0f.webp')->>'reason'
    = 'that photo is not yours to use');
select pg_temp.as_('2d000000-0000-0000-0000-000000000003');
insert into t select 'bea', public.set_my_avatar('photo',
  '2d000000-0000-0000-0000-000000000003/avatar-0f0f0f0f-0f0f-0f0f-0f0f-0f0f0f0f0f0f.webp');
select pg_temp.check('and from there it is',
  (select v->>'ok' from t where k = 'bea') = 'true'
  and public.my_avatar()->'avatar'->>'kind' = 'photo');

-- An organiser takes one down.
select pg_temp.check('a player cannot take anybody''s down',
  public.set_person_avatar('2d000000-0000-0000-0000-000000000002', true)->>'reason' = 'not allowed');
select pg_temp.as_('2d000000-0000-0000-0000-000000000001');
select public.set_person_avatar('2d000000-0000-0000-0000-000000000003', true);
select pg_temp.as_('2d000000-0000-0000-0000-000000000003');
select pg_temp.check('taken down by an organiser, it is gone and another cannot be set',
  public.my_avatar()->'avatar' = 'null'::jsonb and (public.my_avatar()->>'blocked')::boolean
  and public.set_my_avatar('preset', 'owl', '#16a34a')->>'reason' = 'an organiser has turned off your avatar');
select pg_temp.as_('2d000000-0000-0000-0000-000000000001');
select pg_temp.check('organisers see who is blocked, and allow them again',
  exists (select 1 from jsonb_array_elements(public.find_people('bea.avatar')->'people') x
          where (x->>'avatar_blocked')::boolean)
  and public.set_person_avatar('2d000000-0000-0000-0000-000000000003', false)->>'ok' = 'true');
select pg_temp.as_('2d000000-0000-0000-0000-000000000003');
select public.set_my_avatar('preset', 'owl', '#16a34a');

-- ---------------------------------------------------------------------------
-- On a trivia's answers
-- ---------------------------------------------------------------------------
select pg_temp.as_('2d000000-0000-0000-0000-000000000001');
insert into public.sessions (id, title, host, state, mode) values
  ('2d000000-0000-0000-0000-0000000000a1', 'Avatars Live', '2d000000-0000-0000-0000-000000000001', 'live', 'live'),
  ('2d000000-0000-0000-0000-0000000000a2', 'Avatars Own Time', '2d000000-0000-0000-0000-000000000001', 'live', 'open')
on conflict (id) do nothing;
insert into public.items (id, session_id, position, kind, prompt, payload, state, opened_at) values
  ('2d000000-0000-0000-0000-0000000000b1', '2d000000-0000-0000-0000-0000000000a1', 1, 'choice', 'Pick one',
   '{"options": ["alpha", "bravo"]}'::jsonb, 'open', now()),
  ('2d000000-0000-0000-0000-0000000000b2', '2d000000-0000-0000-0000-0000000000a2', 1, 'choice', 'Pick one',
   '{"options": ["alpha", "bravo"]}'::jsonb, 'open', now())
on conflict (id) do nothing;
insert into public.responses (item_id, user_id, value, anonymous) values
  ('2d000000-0000-0000-0000-0000000000b1', '2d000000-0000-0000-0000-000000000002', '"alpha"', false),
  ('2d000000-0000-0000-0000-0000000000b1', '2d000000-0000-0000-0000-000000000003', '"bravo"', false),
  ('2d000000-0000-0000-0000-0000000000b1', '2d000000-0000-0000-0000-000000000004', '"bravo"', true),
  ('2d000000-0000-0000-0000-0000000000b2', '2d000000-0000-0000-0000-000000000002', '"alpha"', false)
on conflict do nothing;
create or replace function pg_temp.avatars(item text) returns jsonb
language sql as $$ select public.item_avatars(item::uuid) $$;

select pg_temp.as_('2d000000-0000-0000-0000-000000000003');
select pg_temp.check('off unless the session says otherwise',
  pg_temp.avatars('2d000000-0000-0000-0000-0000000000b1')->>'reason' = 'off');
select pg_temp.check('only its host switches them on',
  public.set_session_options('2d000000-0000-0000-0000-0000000000a1', null, null, null, 'reveal')->>'reason' = 'not allowed');
select pg_temp.as_('2d000000-0000-0000-0000-000000000001');
insert into t select 'reveal', public.set_session_options('2d000000-0000-0000-0000-0000000000a1', null, null, null, 'reveal');
select pg_temp.check('a host sets them to the reveal, and the editor is told',
  (select v->>'ok' from t where k = 'reveal') = 'true'
  and public.session_sheet('2d000000-0000-0000-0000-0000000000a1')->'session'->>'avatars' = 'reveal');
select pg_temp.check('nothing but off, live or the reveal',
  public.set_session_options('2d000000-0000-0000-0000-0000000000a1', null, null, null, 'always')->>'reason'
    = 'avatars are off, live, or at the reveal');
select pg_temp.as_('2d000000-0000-0000-0000-000000000003');
select pg_temp.check('set to the reveal, nobody sees who picked what while it is open',
  pg_temp.avatars('2d000000-0000-0000-0000-0000000000b1')->>'reason' = 'not yet');
update public.items set state = 'revealed' where id = '2d000000-0000-0000-0000-0000000000b1';
select pg_temp.check('at the reveal, who picked what comes with their avatars',
  pg_temp.avatars('2d000000-0000-0000-0000-0000000000b1')->'picks' = jsonb_build_array(
    jsonb_build_object('option', 'alpha', 'user', '2d000000-0000-0000-0000-000000000002', 'name', 'Ada Avatar',
                       'avatar', '{"kind": "preset", "value": "fox", "color": "#2563eb"}'::jsonb),
    jsonb_build_object('option', 'bravo', 'user', '2d000000-0000-0000-0000-000000000003', 'name', 'Bea Avatar',
                       'avatar', '{"kind": "preset", "value": "owl", "color": "#16a34a"}'::jsonb)));
select pg_temp.check('and somebody who answered anonymously is only a count',
  (pg_temp.avatars('2d000000-0000-0000-0000-0000000000b1')->>'anonymous')::int = 1);

update public.items set state = 'open' where id = '2d000000-0000-0000-0000-0000000000b1';
select pg_temp.as_('2d000000-0000-0000-0000-000000000001');
select public.set_session_options('2d000000-0000-0000-0000-0000000000a1', null, null, null, 'live');
select public.set_session_options('2d000000-0000-0000-0000-0000000000a2', null, null, null, 'live');
select pg_temp.as_('2d000000-0000-0000-0000-000000000004');
select pg_temp.check('live, a room that moves together sees them as people answer',
  jsonb_array_length(pg_temp.avatars('2d000000-0000-0000-0000-0000000000b1')->'picks') = 2);
select pg_temp.check('played at your own pace, not before you have answered yourself',
  pg_temp.avatars('2d000000-0000-0000-0000-0000000000b2')->>'reason' = 'not yet');
select pg_temp.as_('2d000000-0000-0000-0000-000000000002');
select pg_temp.check('and once you have, you do',
  jsonb_array_length(pg_temp.avatars('2d000000-0000-0000-0000-0000000000b2')->'picks') = 1);

-- The site switch.
select pg_temp.as_('2d000000-0000-0000-0000-000000000001');
select public.set_feature_window('site:avatars', false);
select pg_temp.as_('2d000000-0000-0000-0000-000000000002');
select pg_temp.check('switched off for the site, no avatar shows and none can be set',
  (public.my_avatar()->>'off')::boolean
  and pg_temp.avatars('2d000000-0000-0000-0000-0000000000b1')->>'reason' = 'off'
  and public.set_my_avatar('preset', 'cat', '#dc2626')->>'reason' = 'avatars are turned off just now');
select pg_temp.check('but going back to initials still can be',
  public.set_my_avatar(null)->>'ok' = 'true');

-- Leave nothing behind.
select pg_temp.as_('');
delete from public.feature_windows where feature = 'site:avatars';
delete from public.sessions where id in ('2d000000-0000-0000-0000-0000000000a1', '2d000000-0000-0000-0000-0000000000a2');
update public.profiles set avatar_kind = null, avatar_value = null, avatar_color = null, avatar_blocked = false
 where id::text like '2d000000-%';

\echo '--- avatar checks passed ---'
