-- The one piece of personal data a report holds, and when it goes.
--
-- The form says the address is deleted once the outcome is sent. That was true
-- of every report somebody closed and false of every report nobody did -- the
-- address sat there indefinitely on exactly the reports most likely to be
-- forgotten. So there are two ages now, and this asserts both of them, in both
-- directions: what the sweep clears, and what it must leave alone.
--
-- Left alone matters as much as cleared. A sweep that took the address off a
-- report handled this morning would break the receipt the reporter is waiting
-- for, and would do it silently.
\set ON_ERROR_STOP on

create or replace function pg_temp.check(label text, got boolean) returns void
language plpgsql as $$
begin
  raise notice '%  %', case when got is true then 'PASS' else 'FAIL' end, label;
  if got is not true then raise exception 'failed: %', label; end if;
end $$;

-- Six reports, aged deliberately. Written straight into the table rather than
-- through file_report(), because what is being tested is the age rule and the
-- ages have to be lies.
insert into public.reports (id, kind, subject, evidence, reason, status, ticket,
                            reporter_email, resolved_at, outcome_sent_at, created_at)
values
  -- handled, never told, and old: the case the sweep exists for
  ('11111111-0000-0000-0000-000000000001', 'site', '/daily/guess', '{}'::jsonb,
   'stale closed', 'handled', 'TKT-STALE', 'stale@example.com',
   now() - interval '30 days', null, now() - interval '31 days'),
  -- handled, never told, and recent: the mailer has not had its chance yet
  ('11111111-0000-0000-0000-000000000002', 'site', '/daily/guess', '{}'::jsonb,
   'fresh closed', 'handled', 'TKT-FRESH', 'fresh@example.com',
   now() - interval '2 days', null, now() - interval '3 days'),
  -- open and ancient: nobody is coming
  ('11111111-0000-0000-0000-000000000003', 'site', '/daily/guess', '{}'::jsonb,
   'old open', 'new', 'TKT-OLD', 'old@example.com',
   null, null, now() - interval '100 days'),
  -- open and merely stale: still inside the ninety days
  ('11111111-0000-0000-0000-000000000004', 'site', '/daily/guess', '{}'::jsonb,
   'newer open', 'new', 'TKT-NEWER', 'newer@example.com',
   null, null, now() - interval '60 days'),
  -- handled and told, long ago: the address is already gone, and nothing here
  -- may put one back or count it twice
  ('11111111-0000-0000-0000-000000000005', 'site', '/daily/guess', '{}'::jsonb,
   'done', 'handled', 'TKT-DONE', null,
   now() - interval '40 days', now() - interval '40 days', now() - interval '41 days'),
  -- old, open, and anonymous, which is most of them
  ('11111111-0000-0000-0000-000000000006', 'site', '/daily/guess', '{}'::jsonb,
   'anonymous', 'new', 'TKT-ANON', null,
   null, null, now() - interval '200 days')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- The sweep
-- ---------------------------------------------------------------------------
select pg_temp.check('it says what it cleared, per reason',
  public.sweep_reporter_emails() = '{"closed_unsent": 1, "still_open": 1}'::jsonb);

select pg_temp.check('the closed report nobody was ever told about loses its address',
  (select reporter_email from public.reports
   where id = '11111111-0000-0000-0000-000000000001') is null);
select pg_temp.check('and the open one nobody came back to',
  (select reporter_email from public.reports
   where id = '11111111-0000-0000-0000-000000000003') is null);

-- The half that would be a silent breakage rather than a visible one.
select pg_temp.check('but a report closed this week keeps it, because the outcome is still owed',
  (select reporter_email from public.reports
   where id = '11111111-0000-0000-0000-000000000002') = 'fresh@example.com');
select pg_temp.check('and one still open inside ninety days',
  (select reporter_email from public.reports
   where id = '11111111-0000-0000-0000-000000000004') = 'newer@example.com');

-- The report is the record; the address is the only part of it about a person.
select pg_temp.check('the reports themselves are kept',
  (select count(*) from public.reports
   where ticket in ('TKT-STALE', 'TKT-FRESH', 'TKT-OLD', 'TKT-NEWER', 'TKT-DONE', 'TKT-ANON')) = 6);

select pg_temp.check('running it again finds nothing left to do',
  public.sweep_reporter_emails() = '{"closed_unsent": 0, "still_open": 0}'::jsonb);

-- Clearing the address is also what takes a report out of the mailer's queue,
-- so a backlog it can never send does not accumulate for ever.
select pg_temp.check('and the swept report is no longer waiting to be emailed',
  not exists (select 1 from public.unsent_outcomes() where ticket = 'TKT-STALE'));
select pg_temp.check('while the recent one still is',
  exists (select 1 from public.unsent_outcomes() where ticket = 'TKT-FRESH'));

-- ---------------------------------------------------------------------------
-- Who may run it
-- ---------------------------------------------------------------------------
-- The address is the thing this function can destroy, so the web roles cannot
-- call it at all: a sweep is not something a browser asks for.
select pg_temp.check('no web role may sweep',
  not has_function_privilege('anon', 'public.sweep_reporter_emails()', 'execute')
  and not has_function_privilege('authenticated', 'public.sweep_reporter_emails()', 'execute'));
select pg_temp.check('while the publish host may',
  has_function_privilege('service_role', 'public.sweep_reporter_emails()', 'execute'));

\echo '--- retention checks passed ---'
