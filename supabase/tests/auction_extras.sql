-- Auctions, the second round: several pictures an item, the items' order, an
-- auction on the home page, and the emails.
--
-- What has to hold: pictures are only ever paths the uploader writes, up to
-- eight; a new order is every item exactly once or nothing; an auction is on
-- the home page while it takes bids and not before or after, featured only by
-- whoever runs auctions; and an email goes to the person it is true of at the
-- moment it is sent -- once, however many times they were outbid in between.
\set ON_ERROR_STOP on

insert into auth.users (id, email) values
  ('4f000000-0000-0000-0000-000000000001', 'extras.runner@example.com'),
  ('4f000000-0000-0000-0000-000000000002', 'extras.ann@example.com'),
  ('4f000000-0000-0000-0000-000000000003', 'extras.bo@example.com'),
  ('4f000000-0000-0000-0000-000000000004', 'extras.editor@example.com')
on conflict do nothing;
insert into public.capability_grants (user_id, capability)
values ('4f000000-0000-0000-0000-000000000001', 'giveaways.manage')
on conflict do nothing;
insert into public.role_grants (user_id, role)
values ('4f000000-0000-0000-0000-000000000004', 'games.edit')
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
create or replace function pg_temp.item(p_auction uuid, p_item uuid) returns jsonb
language sql as $$
  select x from jsonb_array_elements(public.auction_view(p_auction)->'items') x
  where (x->>'id')::uuid = p_item
$$;
create or replace function pg_temp.order_of(p_auction uuid) returns text
language sql as $$
  select string_agg(x->>'title', ',' order by n)
  from jsonb_array_elements(public.auction_view(p_auction)->'items') with ordinality a(x, n)
$$;
-- What the mail timer would be handed, as postgres (the service role's stand-in).
create or replace function pg_temp.claim() returns jsonb
language sql as $$ select public.auction_mail_claim(50)->'mail' $$;

\set RUNNER '4f000000-0000-0000-0000-000000000001'
\set ANN '4f000000-0000-0000-0000-000000000002'
\set BO '4f000000-0000-0000-0000-000000000003'
\set EDITOR '4f000000-0000-0000-0000-000000000004'
\set PIC1 '4f000000-0000-0000-0000-000000000001/item-11111111-1111-1111-1111-111111111111.jpg'
\set PIC2 '4f000000-0000-0000-0000-000000000001/item-22222222-2222-2222-2222-222222222222.webp'

select pg_temp.as_(:'RUNNER');
insert into t select 'a', public.save_auction(null, 'Extras Auction', null, 'Cash to Dana',
  'open', 0, now() - interval '1 hour', now() + interval '1 day');
insert into t select 'later', public.save_auction(null, 'Extras Later', null, null,
  'open', 0, now() + interval '1 day', now() + interval '2 days');

-- ---------------------------------------------------------------------------
-- Pictures
-- ---------------------------------------------------------------------------
insert into t select 'mug', public.save_auction_item(pg_temp.id('a'), null, 'Mug', null, null,
  array[:'PIC2', :'PIC1'], 5, 1, null);
select pg_temp.check('an item keeps its pictures, in the order given',
  pg_temp.item(pg_temp.id('a'), pg_temp.id('mug'))->'pictures' = jsonb_build_array(:'PIC2', :'PIC1'));
select pg_temp.check('a path that is not an upload is refused',
  public.save_auction_item(pg_temp.id('a'), null, 'Bad', null, null,
    array['../../somebody-else/secret.jpg'], 5, 1, null)->>'ok' = 'false');
select pg_temp.check('and so are more than eight',
  public.save_auction_item(pg_temp.id('a'), null, 'Many', null, null,
    array_fill(:'PIC1'::text, array[9]), 5, 1, null)->>'reason' = 'an item can have up to 8 pictures');
select public.save_auction_item(pg_temp.id('a'), pg_temp.id('mug'), 'Mug', null, null, '{}', 5, 1, null);
select pg_temp.check('and all of them can be taken off',
  pg_temp.item(pg_temp.id('a'), pg_temp.id('mug'))->'pictures' = '[]'::jsonb);

-- ---------------------------------------------------------------------------
-- Order
-- ---------------------------------------------------------------------------
insert into t select 'hat', public.save_auction_item(pg_temp.id('a'), null, 'Hat', null, null, null, 5, 1, null);
insert into t select 'pen', public.save_auction_item(pg_temp.id('a'), null, 'Pen', null, null, null, 5, 1, null);
select pg_temp.check('items start in the order they were added', pg_temp.order_of(pg_temp.id('a')) = 'Mug,Hat,Pen');
select pg_temp.check('an organiser can put them in another',
  public.order_auction_items(pg_temp.id('a'), array[pg_temp.id('pen'), pg_temp.id('mug'), pg_temp.id('hat')])->>'ok' = 'true'
  and pg_temp.order_of(pg_temp.id('a')) = 'Pen,Mug,Hat');
select pg_temp.check('a list missing one is refused, and changes nothing',
  public.order_auction_items(pg_temp.id('a'), array[pg_temp.id('hat'), pg_temp.id('mug')])->>'ok' = 'false'
  and pg_temp.order_of(pg_temp.id('a')) = 'Pen,Mug,Hat');
select pg_temp.check('so is one with an item twice',
  public.order_auction_items(pg_temp.id('a'),
    array[pg_temp.id('hat'), pg_temp.id('hat'), pg_temp.id('mug')])->>'ok' = 'false');
select pg_temp.as_(:'ANN');
select pg_temp.check('a player cannot reorder them',
  public.order_auction_items(pg_temp.id('a'), array[pg_temp.id('hat'), pg_temp.id('mug'), pg_temp.id('pen')])->>'reason'
  = 'not allowed');

-- ---------------------------------------------------------------------------
-- On the home page
-- ---------------------------------------------------------------------------
select pg_temp.as_(:'EDITOR');
select pg_temp.check('an editor cannot feature an auction',
  public.save_home_feature('auction', pg_temp.id('a'))->>'reason' = 'not allowed');
select pg_temp.as_(:'RUNNER');
select pg_temp.check('whoever runs auctions can, and it is one of their choices',
  public.save_home_feature('auction', pg_temp.id('a'), 'Bid for the food bank')->>'ok' = 'true'
  and public.save_home_feature('auction', pg_temp.id('later'))->>'ok' = 'true'
  and (public.home_features_sheet()->'can'->>'auction')::boolean
  and exists (select 1 from jsonb_array_elements(public.home_features_sheet()->'choices'->'auction') c
              where (c->>'id')::uuid = pg_temp.id('a')));
select pg_temp.as_(:'ANN');
select pg_temp.check('a player sees the one taking bids, with its title and how many items',
  exists (select 1 from jsonb_array_elements(public.home_features()->'features') f
          where f->>'kind' = 'auction' and (f->>'ref')::uuid = pg_temp.id('a')
            and f->'item'->>'title' = 'Extras Auction' and (f->'item'->>'items')::int = 3));
select pg_temp.check('and not the one that has not opened',
  not exists (select 1 from jsonb_array_elements(public.home_features()->'features') f
              where (f->>'ref')::uuid = pg_temp.id('later')));
select pg_temp.as_(:'RUNNER');
select pg_temp.check('the organiser is told why that one is not showing',
  exists (select 1 from jsonb_array_elements(public.home_features_sheet()->'features') f
          where (f->>'ref')::uuid = pg_temp.id('later') and not (f->>'showing')::boolean
            and f->>'title' = 'Extras Later'));

-- ---------------------------------------------------------------------------
-- Email
-- ---------------------------------------------------------------------------
select pg_temp.check('nobody signed in can claim the mail or mark it sent',
  not has_function_privilege('authenticated', 'public.auction_mail_claim(int)', 'execute')
  and not has_function_privilege('anon', 'public.auction_mail_claim(int)', 'execute')
  and not has_function_privilege('authenticated', 'public.auction_mail_done(bigint, text)', 'execute')
  and has_function_privilege('service_role', 'public.auction_mail_claim(int)', 'execute'));

select pg_temp.as_(:'ANN');
select public.place_auction_bid(pg_temp.id('hat'), 5);
select pg_temp.check('the first bid outbids nobody', pg_temp.claim() = '[]'::jsonb);
select pg_temp.as_(:'BO');
select public.place_auction_bid(pg_temp.id('hat'), 10);
select pg_temp.as_(:'ANN');
select public.place_auction_bid(pg_temp.id('hat'), 15);
select pg_temp.as_(:'BO');
select public.place_auction_bid(pg_temp.id('hat'), 20);
-- Ann was outbid twice, Bo once and is back on top.
select pg_temp.check('somebody outbid twice before a run is one email',
  (select count(*) from public.auction_mail where user_id = :'ANN' and done_at is null) = 1);
insert into t select 'claimed', jsonb_build_object('mail', pg_temp.claim());
select pg_temp.check('the run is handed Ann''s, with the bid to beat',
  jsonb_array_length((select v->'mail' from t where k = 'claimed')) = 1
  and (select v->'mail'->0->>'to' from t where k = 'claimed') = 'extras.ann@example.com'
  and (select v->'mail'->0->>'kind' from t where k = 'claimed') = 'outbid'
  and (select (v->'mail'->0->>'high')::int from t where k = 'claimed') = 20
  and (select (v->'mail'->0->>'min_bid')::int from t where k = 'claimed') = 21
  and (select v->'mail'->0->>'item' from t where k = 'claimed') = 'Hat');
select pg_temp.check('and not Bo''s, who has bid back to the top',
  exists (select 1 from public.auction_mail where user_id = :'BO' and kind = 'outbid' and outcome = 'skipped'));
select pg_temp.check('a claimed email is not handed to the next run', pg_temp.claim() = '[]'::jsonb);

select public.auction_mail_done((select (v->'mail'->0->>'id')::bigint from t where k = 'claimed'), 'mail server said no');
select pg_temp.check('one that failed is not tried again straight away', pg_temp.claim() = '[]'::jsonb);
update public.auction_mail set claimed_at = now() - interval '11 minutes'
 where id = (select (v->'mail'->0->>'id')::bigint from t where k = 'claimed');
select pg_temp.check('but is ten minutes on',
  (select (x->>'id')::bigint from jsonb_array_elements(pg_temp.claim()) x)
  = (select (v->'mail'->0->>'id')::bigint from t where k = 'claimed'));
select public.auction_mail_done((select (v->'mail'->0->>'id')::bigint from t where k = 'claimed'));
select pg_temp.check('and one that went is marked sent',
  (select outcome from public.auction_mail where id = (select (v->'mail'->0->>'id')::bigint from t where k = 'claimed'))
  = 'sent');

-- Ann is outbid again; then the hat closes before the run.
select pg_temp.as_(:'ANN');
select public.place_auction_bid(pg_temp.id('hat'), 25);
select pg_temp.as_(:'BO');
select public.place_auction_bid(pg_temp.id('hat'), 30);
update public.auction_items set closes_at = now() - interval '1 second' where id = pg_temp.id('hat');
insert into t select 'closed', jsonb_build_object('mail', pg_temp.claim());
select pg_temp.check('an outbid email for something closed is not sent',
  exists (select 1 from public.auction_mail where user_id = :'ANN' and kind = 'outbid' and outcome = 'skipped'));
select pg_temp.check('the winner is told, once',
  jsonb_array_length((select v->'mail' from t where k = 'closed')) = 1
  and (select v->'mail'->0->>'kind' from t where k = 'closed') = 'won'
  and (select v->'mail'->0->>'to' from t where k = 'closed') = 'extras.bo@example.com'
  and (select (v->'mail'->0->>'high')::int from t where k = 'closed') = 30
  and (select v->'mail'->0->>'payment_note' from t where k = 'closed') = 'Cash to Dana'
  and pg_temp.claim() = '[]'::jsonb);
select public.auction_mail_done((select (v->'mail'->0->>'id')::bigint from t where k = 'closed'));

-- Taking off a bid that did not win changes nothing about the winner.
select pg_temp.as_(:'RUNNER');
select public.set_auction_item_paid(pg_temp.id('hat'), true);
select public.remove_auction_bid((select id from public.auction_bids where item_id = pg_temp.id('hat') and amount = 5));
select pg_temp.check('taking off a losing bid leaves the winner paid and not told again',
  (pg_temp.item(pg_temp.id('a'), pg_temp.id('hat'))->>'paid')::boolean
  and pg_temp.claim() = '[]'::jsonb);
-- Bo does not pay; the bid comes off, and Ann wins at 25.
select public.remove_auction_bid((select id from public.auction_bids where item_id = pg_temp.id('hat') and amount = 30));
select pg_temp.check('taking off the winning bid tells whoever wins instead',
  (select x->>'to' from jsonb_array_elements(pg_temp.claim()) x where x->>'kind' = 'won') = 'extras.ann@example.com'
  and not (pg_temp.item(pg_temp.id('a'), pg_temp.id('hat'))->>'paid')::boolean);

select public.delete_auction(pg_temp.id('a'));
select public.delete_auction(pg_temp.id('later'));
select pg_temp.check('deleting an auction takes its waiting email with it',
  not exists (select 1 from public.auction_mail m join auth.users u on u.id = m.user_id
              where u.email like 'extras.%' and m.done_at is null));

\echo '--- auction extras checks passed ---'
