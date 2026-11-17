// The words of a recognition email: told when a nomination goes up, and when
// one wins, with the nominator named only if they chose to be.
import { describe, expect, it } from 'vitest';
import { composeRecognition } from '../../scripts/recognition-mail.mjs';

const base = {
  id: 1,
  to: 'bo@example.com',
  name: 'Bo Jensen',
  story: 'Bo stayed late on a Friday to get a farm customer back online after the storm.',
  from: 'Ann Lee',
  round: null,
  note: null,
};
const site = { site: 'https://games.example.com/' };

describe('recognition emails', () => {
  it('tells a nominee who nominated them and what for', () => {
    const m = composeRecognition({ ...base, kind: 'posted' }, site);
    expect(m.to).toBe('bo@example.com');
    expect(m.subject).toBe('Ann Lee nominated you for acting like an owner');
    expect(m.text).toContain('Hi Bo Jensen,');
    expect(m.text).toContain(base.story);
    expect(m.text).toContain('https://games.example.com/recognition');
  });

  it('says a colleague when the nominator kept their name back', () => {
    const m = composeRecognition({ ...base, kind: 'posted', from: null }, site);
    expect(m.subject).toBe('A colleague nominated you for acting like an owner');
    expect(m.text).not.toContain('Ann');
  });

  it('tells a winner which award, with the reviewers’ note', () => {
    const m = composeRecognition(
      { ...base, kind: 'award', round: 'Employee Ownership Month', note: 'For keeping a farm running.' },
      site
    );
    expect(m.subject).toBe('You won: Employee Ownership Month');
    expect(m.text).toContain('winner of Employee Ownership Month');
    expect(m.text).toContain('For keeping a farm running.');
    expect(m.text).toContain(base.story);
  });

  it('keeps a name with a line break in it on one line of the subject', () => {
    const m = composeRecognition({ ...base, kind: 'posted', from: 'Ann\r\nBcc: all@example.com' }, site);
    expect(m.subject).not.toMatch(/[\r\n]/);
  });

  it('refuses a kind it has no words for', () => {
    expect(() => composeRecognition({ ...base, kind: 'other' }, site)).toThrow();
  });
});
