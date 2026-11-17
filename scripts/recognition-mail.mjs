// What a recognition email says: to somebody whose nomination has gone on the
// wall, and to an award winner. Pure, like auction-mail.mjs; the sending is
// scripts/send-auction-mail.mjs, which works both queues.
//
// Plain text only: the story is what a colleague typed.

const oneLine = (s) => String(s ?? '').replace(/[\r\n]+/g, ' ').trim();

export function composeRecognition(m, { site }) {
  const link = `${site.replace(/\/+$/, '')}/recognition`;
  const hello = m.name ? `Hi ${oneLine(m.name)},` : 'Hi,';
  const who = m.from ? oneLine(m.from) : 'A colleague';
  const story = String(m.story ?? '').trim();

  if (m.kind === 'posted') {
    return {
      to: m.to,
      subject: `${who} nominated you for acting like an owner`,
      text: [
        hello,
        '',
        `${who} nominated you for acting like an owner, and it's now on the recognition wall:`,
        '',
        story,
        '',
        link,
      ].join('\n'),
    };
  }

  if (m.kind === 'award') {
    const round = oneLine(m.round) || 'Acting Like an Owner';
    const note = String(m.note ?? '').trim();
    return {
      to: m.to,
      subject: `You won: ${round}`,
      text: [
        hello,
        '',
        `Congratulations: you've been picked as the winner of ${round}.`,
        ...(note ? ['', note] : []),
        '',
        'What you were nominated for:',
        story,
        '',
        link,
      ].join('\n'),
    };
  }

  throw new Error(`no words for a recognition email of kind ${m.kind}`);
}
