// Auctions, as a bidder and as whoever runs them.
//
// The server decides everything (auctions.sql): what a bid has to beat, when
// it closes, who may see whose bid. What the page owes: to say where the
// reader stands, to ask before a bid that commits them to paying, to say why
// one was refused, and to give the organiser the names and the money owed.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './fixtures';

const AUCTION = '7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
type Sent = { fn: string; args: Record<string, unknown> };

async function signedIn(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    localStorage.setItem('sb-stub-auth-token', JSON.stringify({
      access_token: 'test', refresh_token: 'test', token_type: 'bearer', expires_in: 3600, expires_at: exp,
      user: { id: 'u-me', aud: 'authenticated', role: 'authenticated', email: 'me@example.net',
              app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' },
    }));
  });
}

const soon = (hours: number) => new Date(Date.now() + hours * 3600_000).toISOString();

const AUCTION_ROW = {
  id: AUCTION,
  title: 'Holiday Auction',
  blurb: 'Everything raised goes to the food bank.',
  payment_note: 'Pay Dana in HR by Friday, cash or cheque.',
  bidding: 'open',
  extend_minutes: 2,
  opens_at: soon(-24),
  closes_at: soon(30),
  state: 'open',
};

const BALL = {
  id: 'i-ball',
  title: 'Signed Brewers ball',
  blurb: null,
  donated_by: 'The front office',
  pictures: [],
  starting_bid: 10,
  increment: 5,
  closes_at: soon(30),
  own_close: false,
  extended: false,
  state: 'open',
  bids: 2,
  high: 40,
  min_bid: 45,
  my_bid: null,
  leading: null,
  won: false,
  paid: false,
};

async function server(
  page: import('@playwright/test').Page,
  view: () => Record<string, unknown>,
  answers: Record<string, (args: Record<string, unknown>) => unknown> = {}
) {
  const sent: Sent[] = [];
  await page.route('**/rest/v1/rpc/**', (route) => {
    const fn = route.request().url().match(/\/rpc\/(\w+)/)?.[1] ?? '';
    const args = JSON.parse(route.request().postData() ?? '{}');
    sent.push({ fn, args });
    const reply = (body: unknown) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (fn === 'auction_view') return reply(view());
    if (fn in answers) return reply(answers[fn](args));
    return route.fallback();
  });
  return sent;
}

test('a bidder sees the highest bid, bids after saying yes, and is told they lead', async ({ page }) => {
  await signedIn(page);
  let ball: Record<string, unknown> = { ...BALL };
  const sent = await server(page, () => ({ ok: true, can_manage: false, auction: AUCTION_ROW, items: [ball] }), {
    place_auction_bid: (args) => {
      ball = { ...ball, high: args.p_amount, my_bid: args.p_amount, leading: true, bids: 3, min_bid: 55 };
      return { ok: true, extended: false };
    },
  });
  await page.goto(`/auctions/${AUCTION}`);

  const card = page.getByRole('article', { name: 'Signed Brewers ball' });
  await expect(card.getByText('Highest bid $40 · 2 bids · next at least $45')).toBeVisible();
  await expect(card.getByText('Donated by The front office')).toBeVisible();
  await expect(page.getByText('Pay Dana in HR by Friday, cash or cheque.')).toBeVisible();
  await expect(card.getByLabel('Your bid, in dollars')).toHaveValue('45');

  await card.getByLabel('Your bid, in dollars').fill('50');
  let asked = '';
  page.once('dialog', (d) => {
    asked = d.message();
    void d.accept();
  });
  await card.getByRole('button', { name: 'Bid' }).click();
  await expect(card.getByText('You are the highest bidder.')).toBeVisible();
  expect(asked).toContain('$50');
  expect(asked).toContain('agreeing to pay');
  expect(sent.find((s) => s.fn === 'place_auction_bid')?.args).toEqual({ p_item: 'i-ball', p_amount: 50 });
  // nothing to bid against: the leader cannot outbid themselves
  await expect(card.getByRole('button', { name: 'Bid' })).toHaveCount(0);
});

test('saying no to the question sends nothing', async ({ page }) => {
  await signedIn(page);
  const sent = await server(page, () => ({ ok: true, can_manage: false, auction: AUCTION_ROW, items: [BALL] }));
  await page.goto(`/auctions/${AUCTION}`);
  page.once('dialog', (d) => void d.dismiss());
  await page.getByRole('button', { name: 'Bid' }).click();
  await expect(page.getByRole('button', { name: 'Bid' })).toBeEnabled();
  expect(sent.some((s) => s.fn === 'place_auction_bid')).toBe(false);
});

test('a refused bid says why, and the box moves to what will be taken', async ({ page }) => {
  await signedIn(page);
  await server(page, () => ({ ok: true, can_manage: false, auction: AUCTION_ROW, items: [BALL] }), {
    place_auction_bid: () => ({ ok: false, reason: 'the least you can bid now is $60', min_bid: 60 }),
  });
  await page.goto(`/auctions/${AUCTION}`);
  page.on('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: 'Bid' }).click();
  await expect(page.getByText('the least you can bid now is $60')).toBeVisible();
  await expect(page.getByLabel('Your bid, in dollars')).toHaveValue('60');
});

test('outbid says so', async ({ page }) => {
  await signedIn(page);
  await server(page, () => ({
    ok: true, can_manage: false, auction: AUCTION_ROW,
    items: [{ ...BALL, my_bid: 35, leading: false }],
  }));
  await page.goto(`/auctions/${AUCTION}`);
  await expect(page.getByText('You have been outbid. Your bid was $35.')).toBeVisible();
});

test('sealed bidding shows no highest bid, and a bid can be changed or taken back', async ({ page }) => {
  await signedIn(page);
  const sent = await server(page, () => ({
    ok: true, can_manage: false, auction: { ...AUCTION_ROW, bidding: 'sealed' },
    items: [{ ...BALL, high: null, min_bid: 10, my_bid: 30, leading: null, bids: 4 }],
  }), { withdraw_auction_bid: () => ({ ok: true }) });
  await page.goto(`/auctions/${AUCTION}`);
  await expect(page.getByText(/Sealed bids: nobody sees anybody else/)).toBeVisible();
  await expect(page.getByText('Bids start at $10 · 4 bids so far')).toBeVisible();
  await expect(page.getByText(/Highest bid/)).toHaveCount(0);
  await expect(page.getByText('Your sealed bid: $30.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Change bid' })).toBeVisible();
  page.once('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: 'Take my bid back' }).click();
  await expect(page.getByText('Your bid has been taken back.')).toBeVisible();
  expect(sent.some((s) => s.fn === 'withdraw_auction_bid')).toBe(true);
});

test('the winner is told, with how to pay', async ({ page }) => {
  await signedIn(page);
  await server(page, () => ({
    ok: true, can_manage: false, auction: { ...AUCTION_ROW, state: 'closed' },
    items: [{ ...BALL, state: 'closed', min_bid: null, high: 50, my_bid: 50, leading: true, won: true }],
  }));
  await page.goto(`/auctions/${AUCTION}`);
  const card = page.getByRole('article', { name: 'Signed Brewers ball' });
  await expect(card.getByText('Sold for $50')).toBeVisible();
  await expect(card.getByText('You won this for $50.')).toBeVisible();
  await expect(card.getByText('Pay Dana in HR by Friday, cash or cheque.')).toBeVisible();
  await expect(card.getByRole('button', { name: 'Bid' })).toHaveCount(0);
});

const WON = {
  ...BALL,
  state: 'closed',
  min_bid: null,
  high: 50,
  leader: { id: 'u-bo', name: 'Bo', email: 'bo@example.net' },
  leader_bid: 50,
  paid_at: null,
  bid_list: [
    { id: 'b-2', amount: 50, at: soon(-1), who: { id: 'u-bo', name: 'Bo', email: 'bo@example.net' } },
    { id: 'b-1', amount: 40, at: soon(-2), who: { id: 'u-ann', name: 'Ann', email: 'ann@example.net' } },
  ],
};

test('an organiser sees who won, what is owed, and can mark it paid or take a bid off', async ({ page }) => {
  await signedIn(page);
  const sent = await server(page, () => ({
    ok: true, can_manage: true, auction: { ...AUCTION_ROW, state: 'closed' }, items: [WON],
    log: [{ at: soon(-1), action: 'bid removed', actor: 'Ray',
            detail: { item: 'Signed Brewers ball', amount: 60, bidder: 'Cy' } }],
  }), {
    set_auction_item_paid: () => ({ ok: true }),
    remove_auction_bid: () => ({ ok: true }),
  });
  await page.goto(`/auctions/${AUCTION}`);

  const winners = page.getByRole('region', { name: 'Winners' });
  await expect(winners.getByText('bo@example.net')).toBeVisible();
  await expect(winners.getByText('$50 still to collect.')).toBeVisible();
  // the box shows what the server says, so it is clicked rather than checked
  await winners.getByRole('checkbox', { name: 'Signed Brewers ball is paid for' }).click();
  await expect.poll(() => sent.find((s) => s.fn === 'set_auction_item_paid')?.args).toEqual({
    p_item: 'i-ball',
    p_paid: true,
  });

  await page.getByText('All 2 bids').click();
  page.once('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: 'Remove' }).first().click();
  await expect.poll(() => sent.find((s) => s.fn === 'remove_auction_bid')?.args).toEqual({ p_bid: 'b-2' });

  await expect(page.getByText("Ray removed Cy's $60 bid on Signed Brewers ball")).toBeVisible();
});

test('a bidder is shown nobody’s name', async ({ page }) => {
  await signedIn(page);
  await server(page, () => ({ ok: true, can_manage: false, auction: AUCTION_ROW, items: [BALL] }));
  await page.goto(`/auctions/${AUCTION}`);
  await expect(page.getByRole('region', { name: 'Winners' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Change the auction' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Add an item' })).toHaveCount(0);
});

test('an organiser sets one up: sealed bidding has no late-bid setting', async ({ page }) => {
  await signedIn(page);
  const sent = await server(page, () => ({ ok: true, can_manage: true, auction: AUCTION_ROW, items: [] }), {
    auctions_list: () => ({ ok: true, can_manage: true, auctions: [] }),
    save_auction: () => ({ ok: true, id: AUCTION }),
  });
  await page.goto('/auctions');
  await page.getByRole('button', { name: 'New auction' }).click();
  const form = page.getByRole('form', { name: 'New auction' });
  await form.getByLabel('Name').fill('Spring Auction');
  await form.getByLabel(/Bidding opens/).fill('2026-12-01T09:00');
  await form.getByLabel(/Bidding closes/).fill('2026-12-05T15:00');
  await expect(form.getByText('A late bid moves the close back by')).toBeVisible();
  await form.getByLabel(/Sealed:/).check();
  await expect(form.getByText('A late bid moves the close back by')).toHaveCount(0);
  await form.getByRole('button', { name: 'Create the auction' }).click();

  await expect(page).toHaveURL(new RegExp(`/auctions/${AUCTION}$`));
  const args = sent.find((s) => s.fn === 'save_auction')?.args ?? {};
  expect(args.p_title).toBe('Spring Auction');
  expect(args.p_bidding).toBe('sealed');
  expect(args.p_extend_minutes).toBe(0);
  expect(typeof args.p_opens_at).toBe('string');
});

test('signed out, the list says to sign in', async ({ page }) => {
  await server(page, () => ({}), { auctions_list: () => ({ ok: false, reason: 'not signed in' }) });
  await page.goto('/auctions');
  await expect(page.getByText('Sign in to see the auctions and bid.')).toBeVisible();
});

const PICS = ['u-me/item-11111111-1111-1111-1111-111111111111.jpg',
              'u-me/item-22222222-2222-2222-2222-222222222222.jpg',
              'u-me/item-33333333-3333-3333-3333-333333333333.jpg'];

test('an item with several pictures offers each of them', async ({ page }) => {
  await signedIn(page);
  await server(page, () => ({ ok: true, can_manage: false, auction: AUCTION_ROW, items: [{ ...BALL, pictures: PICS }] }));
  await page.goto(`/auctions/${AUCTION}`);
  const pictures = page.getByRole('list', { name: 'Pictures of Signed Brewers ball' });
  await expect(pictures.getByRole('button')).toHaveCount(3);
  await expect(pictures.getByRole('button', { name: 'Show picture 1 of 3' })).toHaveAttribute('aria-pressed', 'true');
  await pictures.getByRole('button', { name: 'Show picture 3 of 3' }).click();
  await expect(pictures.getByRole('button', { name: 'Show picture 3 of 3' })).toHaveAttribute('aria-pressed', 'true');
  await expect(pictures.getByRole('button', { name: 'Show picture 1 of 3' })).toHaveAttribute('aria-pressed', 'false');
});

test('one picture is just the picture, with nothing to pick from', async ({ page }) => {
  await signedIn(page);
  await server(page, () => ({ ok: true, can_manage: false, auction: AUCTION_ROW, items: [{ ...BALL, pictures: [PICS[0]] }] }));
  await page.goto(`/auctions/${AUCTION}`);
  await expect(page.getByRole('article', { name: 'Signed Brewers ball' })).toBeVisible();
  await expect(page.getByRole('list', { name: /Pictures of/ })).toHaveCount(0);
});

test('an organiser puts the pictures in order, takes one off, and saves the rest', async ({ page }) => {
  await signedIn(page);
  const sent = await server(page, () => ({
    ok: true, can_manage: true, auction: AUCTION_ROW, items: [{ ...BALL, pictures: PICS, bid_list: [] }], log: [],
  }), { save_auction_item: () => ({ ok: true, id: 'i-ball' }) });
  await page.goto(`/auctions/${AUCTION}`);
  await page.getByRole('article', { name: 'Signed Brewers ball' }).getByRole('button', { name: 'Change', exact: true }).click();
  const form = page.getByRole('form', { name: 'Change Signed Brewers ball' });
  await expect(form.getByText('Pictures (3 of 8)')).toBeVisible();
  await expect(form.getByRole('button', { name: 'Move picture 1 earlier' })).toBeDisabled();
  await form.getByRole('button', { name: 'Move picture 3 earlier' }).click();
  await form.getByRole('button', { name: 'Remove picture 1' }).click();
  await expect(form.getByText('Pictures (2 of 8)')).toBeVisible();
  await expect(form.getByLabel('Add pictures')).toBeVisible();
  await form.getByRole('button', { name: 'Save' }).click();
  await expect.poll(() => sent.find((s) => s.fn === 'save_auction_item')?.args.p_pictures).toEqual([PICS[2], PICS[1]]);
});

test('an organiser moves an item, and the server is sent the whole new order', async ({ page }) => {
  await signedIn(page);
  const items = [
    { ...BALL, id: 'i-1', title: 'First thing', bid_list: [] },
    { ...BALL, id: 'i-2', title: 'Second thing', bid_list: [] },
    { ...BALL, id: 'i-3', title: 'Third thing', bid_list: [] },
  ];
  const sent = await server(page, () => ({ ok: true, can_manage: true, auction: AUCTION_ROW, items, log: [] }), {
    order_auction_items: () => ({ ok: true }),
  });
  await page.goto(`/auctions/${AUCTION}`);
  await expect(page.getByRole('button', { name: 'Move First thing earlier' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Move Third thing later' })).toBeDisabled();
  await page.getByRole('button', { name: 'Move Third thing earlier' }).click();
  await expect.poll(() => sent.find((s) => s.fn === 'order_auction_items')?.args).toEqual({
    p_auction: AUCTION,
    p_items: ['i-1', 'i-3', 'i-2'],
  });
});

test('a bidder is offered no way to move anything', async ({ page }) => {
  await signedIn(page);
  await server(page, () => ({ ok: true, can_manage: false, auction: AUCTION_ROW, items: [BALL] }));
  await page.goto(`/auctions/${AUCTION}`);
  await expect(page.getByRole('button', { name: /^Move / })).toHaveCount(0);
});

test('the organiser view, gallery and picture editor open, has no WCAG A/AA violations axe can see', async ({ page }) => {
  await signedIn(page);
  const items = [
    { ...BALL, id: 'i-1', title: 'First thing', pictures: PICS, bid_list: [] },
    { ...BALL, id: 'i-2', title: 'Second thing', bid_list: [] },
  ];
  await server(page, () => ({ ok: true, can_manage: true, auction: AUCTION_ROW, items, log: [] }));
  await page.goto(`/auctions/${AUCTION}`);
  await page.getByRole('article', { name: 'First thing' }).getByRole('button', { name: 'Change', exact: true }).click();
  await expect(page.getByRole('form', { name: 'Change First thing' })).toBeVisible();
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const summary = results.violations.map((v) => ({ id: v.id, nodes: v.nodes.length, sample: v.nodes[0]?.html.slice(0, 120) }));
  expect(summary, JSON.stringify(summary, null, 2)).toEqual([]);
});
