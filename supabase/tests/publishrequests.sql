-- Asking the publish host to regenerate a day.
--
-- The page files, the host claims, the host finishes. What has to hold is the
-- part a page cannot enforce for itself: a day that has started is refused
-- without force, asking twice is asking once, two hosts never take the same
-- request, a host that died mid-publish does not leave a row "publishing now"
-- for ever, and nobody but an admin files one.
\set ON_ERROR_STOP on

insert into auth.users (id, email) values
  ('e5555555-5555-5555-5555-555555555555', 'republish-editor@example.com'),
  ('e6666666-6666-6666-6666-666666666666', 'republish-player@example.com')
on conflict do nothing;
insert into public.role_grants (user_id, role)
values ('e5555555-5555-5555-5555-555555555555', 'games.edit')
on conflict do nothing;

create or replace function pg_temp.check(label text, got boolean) returns void
language plpgsql as $$
begin
  raise notice '%  %', case when got is true then 'PASS' else 'FAIL' end, label;
  if got is not true then raise exception 'failed: %', label; end if;
end $$;

create or replace function pg_temp.today() returns date
language sql as $$ select (now() at time zone 'America/New_York')::date $$;

set session "test.uid" = 'e5555555-5555-5555-5555-555555555555';

-- ---------------------------------------------------------------------------
-- Filing
-- ---------------------------------------------------------------------------
select pg_temp.check('a day that has started is refused without force',
  (public.request_publish(pg_temp.today())->>'reason') = 'already live');
select pg_temp.check('and so is the past',
  (public.request_publish(pg_temp.today() - 2)->>'reason') = 'already live');
select pg_temp.check('and nothing was filed for either',
  not exists (select 1 from public.publish_requests where on_date <= pg_temp.today()));

select pg_temp.check('with force, today can be asked for',
  (public.request_publish(pg_temp.today(), true)->>'ok') = 'true');
select pg_temp.check('and a future day needs no force',
  (public.request_publish(pg_temp.today() + 10)->>'again') = 'false');

-- Asking twice while the first is still waiting is asking once, and the page is
-- told so rather than being allowed to think a second publish is coming.
select pg_temp.check('asking again for a waiting day is the same request',
  (public.request_publish(pg_temp.today() + 10)->>'again') = 'true');
select pg_temp.check('and there is still only one',
  (select count(*) from public.publish_requests where on_date = pg_temp.today() + 10) = 1);

select pg_temp.check('a date years out is refused',
  (public.request_publish(pg_temp.today() + 400)->>'reason') = 'more than a year out');

select pg_temp.check('the page sees what it asked for',
  jsonb_array_length(public.publish_requests_sheet()->'requests') = 2);

-- ---------------------------------------------------------------------------
-- The publish host
-- ---------------------------------------------------------------------------
-- Oldest first: the one filed for today, then the future day.
select pg_temp.check('the host takes the oldest waiting request',
  (public.claim_publish_request()->>'on_date')::date = pg_temp.today());
select pg_temp.check('and it is marked running, with force carried through',
  (select state = 'running' and force from public.publish_requests where on_date = pg_temp.today()));

select pg_temp.check('the next claim takes the next one, not the same one again',
  (public.claim_publish_request()->>'on_date')::date = pg_temp.today() + 10);
select pg_temp.check('and with both taken there is nothing to claim',
  public.claim_publish_request() is null);

select public.finish_publish_request(
  (select id from public.publish_requests where on_date = pg_temp.today() + 10),
  true, 'published, themed from "October"');
select pg_temp.check('finishing records the answer',
  (select state = 'done' and note like '%themed from%' and finished_at is not null
   from public.publish_requests where on_date = pg_temp.today() + 10));

-- A second host closing a row the first already closed is ignored, not allowed
-- to overwrite the first answer with its own.
select public.finish_publish_request(
  (select id from public.publish_requests where on_date = pg_temp.today() + 10),
  false, 'a late second answer');
select pg_temp.check('and a finished request cannot be finished again',
  (select state from public.publish_requests where on_date = pg_temp.today() + 10) = 'done');

-- A host that died mid-publish: the row says running, and nobody will ever
-- finish it. After a quarter of an hour it is claimable again, or the page
-- would say "publishing now" for ever.
update public.publish_requests set started_at = now() - interval '20 minutes'
 where on_date = pg_temp.today();
select pg_temp.check('a request abandoned mid-publish is taken again',
  (public.claim_publish_request()->>'on_date')::date = pg_temp.today());

-- ---------------------------------------------------------------------------
-- Who may
-- ---------------------------------------------------------------------------
set session "test.uid" = 'e6666666-6666-6666-6666-666666666666';
select pg_temp.check('a player cannot ask for a day',
  (public.request_publish(pg_temp.today() + 5)->>'reason') = 'not allowed');
select pg_temp.check('nor see what has been asked for',
  (public.publish_requests_sheet()->>'reason') = 'not allowed');

-- The host's two functions are the service key's alone. A browser that could
-- call claim could mark somebody's request running and leave it there.
select pg_temp.check('no web role may claim or finish a request',
  not has_function_privilege('authenticated', 'public.claim_publish_request()', 'execute')
  and not has_function_privilege('anon', 'public.claim_publish_request()', 'execute')
  and not has_function_privilege('authenticated',
        'public.finish_publish_request(uuid, boolean, text)', 'execute'));
select pg_temp.check('while the publish host may',
  has_function_privilege('service_role', 'public.claim_publish_request()', 'execute')
  and has_function_privilege('service_role',
        'public.finish_publish_request(uuid, boolean, text)', 'execute'));
select pg_temp.check('and anon may not ask at all',
  not has_function_privilege('anon', 'public.request_publish(date, boolean)', 'execute'));

\echo '--- publish request checks passed ---'
