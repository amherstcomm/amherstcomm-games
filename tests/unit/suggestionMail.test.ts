// The words of a suggestion box email: a reader told what is in their box,
// with the sender named only when they put their name to it; a named sender
// told of an answer, and where it was given.
import { describe, expect, it } from 'vitest';
import { composeSuggestion } from '../../scripts/suggestion-mail.mjs';

const site = { site: 'https://games.example.com/' };
const base = { id: 1, to: 'ray@example.com', name: 'Ray', box: "The CEO's box", body: 'A second microwave, please.' };

describe('suggestion box emails', () => {
  it('tells a reader who left it, when they said', () => {
    const m = composeSuggestion({ ...base, kind: 'new', from: 'Ann Lee', follow_up: false }, site);
    expect(m.subject).toBe("A new suggestion in The CEO's box");
    expect(m.text).toContain("Ann Lee left a suggestion in The CEO's box:");
    expect(m.text).toContain('A second microwave, please.');
    expect(m.text).toContain('https://games.example.com/suggestions');
  });

  it('and names nobody for an anonymous one', () => {
    const m = composeSuggestion({ ...base, kind: 'new', from: null, follow_up: false }, site);
    expect(m.text).toContain('Somebody, anonymously, left a suggestion');
  });

  it('says when it is the sender writing back', () => {
    const m = composeSuggestion({ ...base, kind: 'new', from: null, follow_up: true }, site);
    expect(m.subject).toBe("More on a suggestion in The CEO's box");
    expect(m.text).toContain('wrote back about a suggestion');
  });

  it('tells a named sender who answered, and whether it went on the board', () => {
    const quiet = composeSuggestion({ ...base, to: 'ann@example.com', name: 'Ann', kind: 'reply', by: 'Ray', public: false, body: 'Ordered one.' }, site);
    expect(quiet.subject).toBe('Ray answered your suggestion');
    expect(quiet.text).not.toContain('You said, we did');
    const open = composeSuggestion({ ...base, to: 'ann@example.com', name: 'Ann', kind: 'reply', by: 'Ray', public: true, body: 'Ordered one.' }, site);
    expect(open.text).toContain('"You said, we did" board');
    expect(open.text).toContain('without your name');
  });

  it('keeps a box name with a line break in it on one line of the subject', () => {
    expect(composeSuggestion({ ...base, kind: 'new', box: 'Box\r\nBcc: x@y.z' }, site).subject).not.toMatch(/[\r\n]/);
  });

  it('refuses a kind it has no words for', () => {
    expect(() => composeSuggestion({ ...base, kind: 'other' }, site)).toThrow();
  });
});
