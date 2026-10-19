// The site's day turns at 3:15 a.m. Eastern, and everything that decides
// whether a board has started has to agree with puzzle_day() in the schema.
// The scripts used the calendar date, so between midnight and 3:15 a.m. a
// republish of the next day treated it as live and would not rebuild its round
// board -- a pin changed at 12:53 a.m. never reached it.
import { describe, expect, it } from 'vitest';
import { easternToday } from '../../scripts/publishDate.mjs';
import { puzzleDayEt } from '@/dailyStatus';

// 2026-10-19 in Eastern daylight time is UTC-4.
const at = (eastern: string) => new Date(`${eastern}-04:00`);

describe("the site's day", () => {
  it('is still yesterday between midnight and 3:15 a.m. Eastern', () => {
    expect(easternToday(at('2026-10-19T00:54:00'))).toBe('2026-10-18');
    expect(easternToday(at('2026-10-19T03:14:59'))).toBe('2026-10-18');
    expect(puzzleDayEt(at('2026-10-19T00:54:00').getTime())).toBe('2026-10-18');
  });

  it('turns at 3:15, when the nightly window runs', () => {
    expect(easternToday(at('2026-10-19T03:15:00'))).toBe('2026-10-19');
    expect(easternToday(at('2026-10-19T03:30:00'))).toBe('2026-10-19');
    expect(puzzleDayEt(at('2026-10-19T03:15:00').getTime())).toBe('2026-10-19');
  });

  it('and is Eastern whatever zone the machine is in: 8 p.m. Eastern is not tomorrow', () => {
    expect(easternToday(new Date('2026-10-19T00:00:00Z'))).toBe('2026-10-18');
  });
});
