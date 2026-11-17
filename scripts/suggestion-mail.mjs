// What a suggestion box email says: to a reader, that something is in their
// box; to a named sender, that a reader answered. An anonymous sender is never
// emailed -- there is no address to email, which is the point.
//
// Plain text only: everything here was typed by somebody.

const oneLine = (s) => String(s ?? '').replace(/[\r\n]+/g, ' ').trim();

export function composeSuggestion(m, { site }) {
  const link = `${site.replace(/\/+$/, '')}/suggestions`;
  const hello = m.name ? `Hi ${oneLine(m.name)},` : 'Hi,';
  const box = oneLine(m.box) || 'your suggestion box';
  const body = String(m.body ?? '').trim();

  if (m.kind === 'new') {
    const who = m.from ? oneLine(m.from) : null;
    const what = m.follow_up ? 'wrote back about a suggestion' : 'left a suggestion';
    return {
      to: m.to,
      subject: m.follow_up ? `More on a suggestion in ${box}` : `A new suggestion in ${box}`,
      text: [
        hello,
        '',
        `${who ?? 'Somebody, anonymously,'} ${what} in ${box}:`,
        '',
        body,
        '',
        `Answer it here: ${link}`,
      ].join('\n'),
    };
  }

  if (m.kind === 'reply') {
    const by = m.by ? oneLine(m.by) : 'The reader';
    return {
      to: m.to,
      subject: `${by} answered your suggestion`,
      text: [
        hello,
        '',
        `${by} answered the suggestion you left in ${box}${m.public ? ', on the "You said, we did" board for everybody to see (without your name)' : ''}:`,
        '',
        body,
        '',
        `Read it, or write back: ${link}`,
      ].join('\n'),
    };
  }

  throw new Error(`no words for a suggestion email of kind ${m.kind}`);
}
