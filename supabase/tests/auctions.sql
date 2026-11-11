-- Auctions: bidding, closing, and what each person may see.
--
-- What has to hold: an open bid has to beat the last by the increment; a
-- sealed one stays secret until the close and ties go to whoever bid first; a
-- late open bid pushes the close back only when the auction says so; nobody
-- but an organiser sees who anybody else is; and every bid an organiser takes
-- off is written down.
\set ON_ERROR_STOP on

insert into auth.users (id, email) values
  ('4e000000-0000-0000-0000-000000000001', 'auction.runner@example.com'),
  ('4e000000-0000-0000-0000-000000000002', 'auction.ann@example.com'),
  ('4e000000-0000-0000-0000-000000000003', 'auction.bo@example.com')
on conflict do nothing;
insert into public.role_grants (user_id, role)
values ('4e000000-0000-0000-0000-000000000001', 'games.admin')
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
-- one item as the caller sees it
create or replace function pg_temp.item(p_auction uuid, p_item uuid) returns jsonb
language sql as $$
  select x from jsonb_array_elements(public.auction_view(p_auction)->'items') x
  where (x->>'id')::uuid = p_item
$$;

\set RUNNER '4e000000-0000-0000-0000-000000000001'
\set ANN '4e000000-0000-0000-0000-000000000002'
\set BO '4e000000-0000-0000-0000-000000000003'

-- ---------------------------------------------------------------------------
-- Setting one up
-- ---------------------------------------------------------------------------
select pg_temp.as_(:'ANN');
select pg_temp.check('a player cannot set one up',
  public.save_auction(null, 'Mine', null, null, 'open', 2, now(), now() + interval '1 day')->>'reason'
  = 'not allowed');

select pg_temp.as_(:'RUNNER');
select pg_temp.check('it has to close after it opens',
  public.save_auction(null, 'Backwards', null, null, 'open', 2, now(), now() - interval '1 hour')->>'ok'
  = 'false');
insert into t select 'open', public.save_auction(null, 'Holiday Auction', 'For the food bank',
  'Pay Dana in HR by Friday', 'open', 5, now() - interval '1 hour', now() + interval '1 day');
insert into t select 'ball', public.save_auction_item(pg_temp.id('open'), null, 'Signed ball', null,
  'The Brewers', null, 10, 5, null);
insert into t select 'spot', public.save_auction_item(pg_temp.id('open'), null, 'Parking spot', null,
  null, null, 1, 1, now() + interval '2 hours');
insert into t select 'later', public.save_auction(null, 'Spring Auction', null, null, 'open', 0,
  now() + interval '1 day', now() + interval '2 days');
select pg_temp.check('an item cannot close before its auction opens',
  public.save_auction_item(pg_temp.id('later'), null, 'Too soon', null, null, null, 1, 1,
                           now())->>'ok' = 'false');

-- ---------------------------------------------------------------------------
-- Who sees what
-- ---------------------------------------------------------------------------
select pg_temp.as_(:'ANN');
select pg_temp.check('a player sees the open one and not the one being set up',
  exists (select 1 from jsonb_array_elements(public.auctions_list()->'auctions') x
          where (x->>'id')::uuid = pg_temp.id('open'))
  and not exists (select 1 from jsonb_array_elements(public.auctions_list()->'auctions') x
                  where (x->>'id')::uuid = pg_temp.id('later'))
  and public.auction_view(pg_temp.id('later'))->>'ok' = 'false');
select pg_temp.as_(:'RUNNER');
select pg_temp.check('an organiser sees both',
  (select count(*) from jsonb_array_elements(public.auctions_list()->'auctions') x
   where (x->>'id')::uuid in (pg_temp.id('open'), pg_temp.id('later'))) = 2
  and (public.auctions_list()->>'can_manage')::boolean);
select pg_temp.as_('');
select pg_temp.check('nobody signed out sees anything',
  public.auctions_list()->>'ok' = 'false'
  and public.auction_view(pg_temp.id('open'))->>'ok' = 'false'
  and public.place_auction_bid(pg_temp.id('ball'), 50)->>'ok' = 'false');

-- ---------------------------------------------------------------------------
-- Open bidding
-- ---------------------------------------------------------------------------
select pg_temp.as_(:'ANN');
select pg_temp.check('a bid under the start is refused, and says the least',
  public.place_auction_bid(pg_temp.id('ball'), 5)->>'min_bid' = '10');
select pg_temp.check('a bid at the start is taken',
  public.place_auction_bid(pg_temp.id('ball'), 10)->>'ok' = 'true');
select pg_temp.check('the highest bidder cannot bid against themselves',
  public.place_auction_bid(pg_temp.id('ball'), 30)->>'reason' = 'you are already the highest bidder');
select pg_temp.as_(:'BO');
select pg_temp.check('the next has to beat it by the increment',
  public.place_auction_bid(pg_temp.id('ball'), 12)->>'min_bid' = '15');
select pg_temp.check('and one that does is taken',
  public.place_auction_bid(pg_temp.id('ball'), 15)->>'ok' = 'true');

select pg_temp.as_(:'ANN');
insert into t select 'ann sees', pg_temp.item(pg_temp.id('open'), pg_temp.id('ball'));
select pg_temp.check('a bidder sees the high bid, that they are not on it, and the least to beat it',
  (select (v->>'high')::int from t where k = 'ann sees') = 15
  and (select v->>'leading' from t where k = 'ann sees') = 'false'
  and (select (v->>'my_bid')::int from t where k = 'ann sees') = 10
  and (select (v->>'min_bid')::int from t where k = 'ann sees') = 20
  and (select (v->>'bids')::int from t where k = 'ann sees') = 2);
select pg_temp.check('and nothing about who anybody else is',
  not (select v ? 'leader' or v ? 'bid_list' from t where k = 'ann sees')
  and public.auction_view(pg_temp.id('open'))->'log' = 'null'::jsonb);
select pg_temp.as_(:'RUNNER');
select pg_temp.check('an organiser sees who is winning, with an address to collect from',
  pg_temp.item(pg_temp.id('open'), pg_temp.id('ball'))->'leader'->>'email' = 'auction.bo@example.com'
  and jsonb_array_length(pg_temp.item(pg_temp.id('open'), pg_temp.id('ball'))->'bid_list') = 2);

-- A bid inside the last five minutes moves the close to five minutes from now.
update public.auctions set closes_at = now() + interval '1 minute' where id = pg_temp.id('open');
select pg_temp.as_(:'ANN');
select pg_temp.check('a bid near the close moves it back, and says so',
  public.place_auction_bid(pg_temp.id('ball'), 20)->>'extended' = 'true'
  and (pg_temp.item(pg_temp.id('open'), pg_temp.id('ball'))->>'closes_at')::timestamptz
      > now() + interval '4 minutes'
  and (pg_temp.item(pg_temp.id('open'), pg_temp.id('ball'))->>'extended')::boolean);
select pg_temp.check('an item with its own close is not moved by a bid on another',
  (pg_temp.item(pg_temp.id('open'), pg_temp.id('spot'))->>'closes_at')::timestamptz
  > now() + interval '1 hour');

-- The same, with no extension: on the dot.
select pg_temp.as_(:'RUNNER');
insert into t select 'hard', public.save_auction(null, 'On the dot', null, null, 'open', 0,
  now() - interval '1 hour', now() + interval '1 minute');
insert into t select 'mug', public.save_auction_item(pg_temp.id('hard'), null, 'Mug', null, null, null,
  1, 1, null);
select pg_temp.as_(:'ANN');
select pg_temp.check('with a hard close a late bid moves nothing',
  public.place_auction_bid(pg_temp.id('mug'), 5)->>'extended' = 'false'
  and (pg_temp.item(pg_temp.id('hard'), pg_temp.id('mug'))->>'closes_at')::timestamptz
      < now() + interval '2 minutes');
select pg_temp.check('an open bid cannot be taken back',
  public.withdraw_auction_bid(pg_temp.id('mug'))->>'ok' = 'false');

-- ---------------------------------------------------------------------------
-- Sealed bidding
-- ---------------------------------------------------------------------------
select pg_temp.as_(:'RUNNER');
insert into t select 'sealed', public.save_auction(null, 'Sealed', null, 'Cash to Dana', 'sealed', 5,
  now() - interval '1 hour', now() + interval '1 day');
insert into t select 'day', public.save_auction_item(pg_temp.id('sealed'), null, 'A day off', null,
  null, null, 25, 1, null);
select pg_temp.as_(:'ANN');
select pg_temp.check('a sealed bid under the start is refused',
  public.place_auction_bid(pg_temp.id('day'), 20)->>'ok' = 'false');
select public.place_auction_bid(pg_temp.id('day'), 30);
select pg_temp.as_(:'BO');
select public.place_auction_bid(pg_temp.id('day'), 50);
insert into t select 'bo sealed', pg_temp.item(pg_temp.id('sealed'), pg_temp.id('day'));
select pg_temp.check('while it is open nobody sees the highest, or whether theirs is it',
  (select v->'high' from t where k = 'bo sealed') = 'null'::jsonb
  and (select v->'leading' from t where k = 'bo sealed') = 'null'::jsonb
  and (select (v->>'my_bid')::int from t where k = 'bo sealed') = 50
  and (select (v->>'min_bid')::int from t where k = 'bo sealed') = 25);
-- Ann matches it, later: a tie, which Bo wins by having bid first.
select pg_temp.as_(:'ANN');
select public.place_auction_bid(pg_temp.id('day'), 50);
select pg_temp.check('a second sealed bid replaces the first rather than adding one',
  (select count(*) from public.auction_bids where item_id = pg_temp.id('day')
   and bidder = :'ANN') = 1);
select pg_temp.check('a sealed bid can be taken back',
  public.withdraw_auction_bid(pg_temp.id('day'))->>'ok' = 'true'
  and pg_temp.item(pg_temp.id('sealed'), pg_temp.id('day'))->'my_bid' = 'null'::jsonb);
select public.place_auction_bid(pg_temp.id('day'), 50);
-- and a sealed bid at the last minute moves nothing, whatever the auction says
update public.auctions set closes_at = now() + interval '1 minute' where id = pg_temp.id('sealed');
select pg_temp.check('a sealed bid never pushes the close',
  public.place_auction_bid(pg_temp.id('day'), 50)->>'extended' = 'false');
-- The bid Ann just repeated counts from now, Bo's from before. Close it.
update public.auctions set opens_at = now() - interval '2 hours', closes_at = now() - interval '1 second'
 where id = pg_temp.id('sealed');
select pg_temp.check('a bid after the close is refused',
  public.place_auction_bid(pg_temp.id('day'), 99)->>'reason' = 'bidding on this has closed');
select pg_temp.as_(:'BO');
insert into t select 'bo after', pg_temp.item(pg_temp.id('sealed'), pg_temp.id('day'));
select pg_temp.check('once it closes the tie goes to whoever bid first, and they are told',
  (select v->>'won' from t where k = 'bo after') = 'true'
  and (select (v->>'high')::int from t where k = 'bo after') = 50);
select pg_temp.as_(:'ANN');
select pg_temp.check('and the other is told they did not',
  pg_temp.item(pg_temp.id('sealed'), pg_temp.id('day'))->>'won' = 'false'
  and pg_temp.item(pg_temp.id('sealed'), pg_temp.id('day'))->>'leading' = 'false');

-- ---------------------------------------------------------------------------
-- After the close
-- ---------------------------------------------------------------------------
select pg_temp.as_(:'RUNNER');
select pg_temp.check('an item still open cannot be marked paid',
  public.set_auction_item_paid(pg_temp.id('ball'), true)->>'ok' = 'false');
select pg_temp.check('a sold one can',
  public.set_auction_item_paid(pg_temp.id('day'), true)->>'ok' = 'true'
  and (pg_temp.item(pg_temp.id('sealed'), pg_temp.id('day'))->>'paid')::boolean);
select pg_temp.check('it cannot switch to open with bids in it',
  public.save_auction(pg_temp.id('sealed'), 'Sealed', null, null, 'open', 5,
                      now() - interval '2 hours', now() - interval '1 second')->>'ok' = 'false');

-- Bo does not pay. Take the bid off; Ann is the winner now.
select pg_temp.as_(:'ANN');
select pg_temp.check('a player cannot take bids off',
  public.remove_auction_bid((select id from public.auction_bids where item_id = pg_temp.id('day')
                             and bidder = :'BO'))->>'reason' = 'not allowed');
select pg_temp.as_(:'RUNNER');
select public.remove_auction_bid((select id from public.auction_bids
                                  where item_id = pg_temp.id('day') and bidder = :'BO'));
select pg_temp.check('the next highest wins, and the old winner''s payment is not theirs',
  pg_temp.item(pg_temp.id('sealed'), pg_temp.id('day'))->'leader'->>'email' = 'auction.ann@example.com'
  and not (pg_temp.item(pg_temp.id('sealed'), pg_temp.id('day'))->>'paid')::boolean);
select pg_temp.check('and the log says who was taken off, for how much, and by whom',
  exists (select 1 from jsonb_array_elements(public.auction_view(pg_temp.id('sealed'))->'log') l
          where l->>'action' = 'bid removed' and (l->'detail'->>'amount')::int = 50
            and l->'detail'->>'bidder' = public.auction_person(:'BO')->>'name'
            and l->>'actor' = public.auction_person(:'RUNNER')->>'name'));

select public.delete_auction(pg_temp.id('sealed'));
select pg_temp.check('deleting one takes its bids, and leaves the log',
  not exists (select 1 from public.auction_bids where item_id = pg_temp.id('day'))
  and exists (select 1 from public.auction_log where action = 'deleted'
              and detail->>'title' = 'Sealed' and auction_id is null));

select public.delete_auction(pg_temp.id('open'));
select public.delete_auction(pg_temp.id('later'));
select public.delete_auction(pg_temp.id('hard'));

\echo '--- auction checks passed ---'
