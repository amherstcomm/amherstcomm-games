// The words of an auction email: who it goes to, what it says, and that what
// people typed cannot become a second header.
import { describe, expect, it } from 'vitest';
import { compose, moment } from '../../scripts/auction-mail.mjs';

const base = {
  id: 1,
  to: 'ann@example.com',
  name: 'Ann Smith',
  item: 'Signed ball',
  auction: 'Holiday Auction',
  auction_id: 'a1',
  high: 1250,
  min_bid: 1255,
  closes_at: '2026-12-04T21:00:00Z',
  payment_note: 'Cash or cheque to Dana in HR by Friday.',
};
const site = { site: 'https://games.example.com/' };

describe('auction emails', () => {
  it('tells an outbid bidder the bid to beat, the close and the way back', () => {
    const m = compose({ ...base, kind: 'outbid' }, site);
    expect(m.to).toBe('ann@example.com');
    expect(m.subject).toBe("You've been outbid on Signed ball");
    expect(m.text).toContain('Hi Ann Smith,');
    expect(m.text).toContain('Somebody has bid $1,250 on Signed ball in Holiday Auction');
    expect(m.text).toContain('bid at least $1,255');
    expect(m.text).toContain('Friday, December 4 at 3:00 PM CST');
    // one slash, however the site was written
    expect(m.text).toContain('https://games.example.com/auctions/a1');
  });

  it('tells a winner what they won, for how much, and how to pay', () => {
    const m = compose({ ...base, kind: 'won' }, site);
    expect(m.subject).toBe('You won Signed ball');
    expect(m.text).toContain('your bid of $1,250 won it');
    expect(m.text).toContain('How to pay:\nCash or cheque to Dana in HR by Friday.');
  });

  it('says somebody will be in touch when the auction has no payment note', () => {
    const m = compose({ ...base, kind: 'won', payment_note: null }, site);
    expect(m.text).toContain('will be in touch about paying');
    expect(m.text).not.toContain('How to pay');
  });

  it('greets nobody by name when there is no name', () => {
    expect(compose({ ...base, kind: 'won', name: '' }, site).text.startsWith('Hi,\n')).toBe(true);
  });

  it('keeps a title with a line break in it on one line of the subject', () => {
    const m = compose({ ...base, kind: 'outbid', item: 'Ball\r\nBcc: everyone@example.com' }, site);
    expect(m.subject).toBe("You've been outbid on Ball Bcc: everyone@example.com");
    expect(m.subject).not.toMatch(/[\r\n]/);
  });

  it('writes times on the company clock, or another when told', () => {
    expect(moment('2026-07-01T17:30:00Z')).toBe('Wednesday, July 1 at 12:30 PM CDT');
    expect(moment('2026-07-01T17:30:00Z', 'America/New_York')).toBe('Wednesday, July 1 at 1:30 PM EDT');
  });

  it('refuses a kind it has no words for', () => {
    expect(() => compose({ ...base, kind: 'lost' }, site)).toThrow();
  });
});
