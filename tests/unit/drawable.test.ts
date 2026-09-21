// What may reach an <img src> on a contest page.
//
// Two things do, and only two: a `blob:` URL the browser minted for a file
// somebody just picked, and an `https:` link storage signed. The reason to
// assert it rather than leave it to the call sites is that `image_path` is
// written by the client -- it goes to the database and comes back inside a
// signed link -- so "the only strings here are ours" is a claim about a round
// trip, not about a local variable.
import { describe, expect, it } from 'vitest';
import { drawable } from '@/contests';

describe('the links a contest page will draw', () => {
  it('draws a signed storage link', () => {
    const url =
      'https://supabase.example.net/storage/v1/object/sign/contest-entries/abc/1.jpg?token=x';
    expect(drawable(url)).toBe(url);
  });

  it('draws the blob URL for a file just picked', () => {
    expect(drawable('blob:https://games.example.net/8f2a-11ee')).toBe(
      'blob:https://games.example.net/8f2a-11ee'
    );
  });

  it('draws nothing for a missing link', () => {
    expect(drawable(null)).toBeUndefined();
    expect(drawable(undefined)).toBeUndefined();
    expect(drawable('')).toBeUndefined();
  });

  // None of these can be produced by the code as it stands. That is the point:
  // the guard is here so that a later change which *could* produce one does
  // not quietly become the first place a scheme reaches an attribute.
  it('draws nothing for a scheme it did not mint', () => {
    for (const url of [
      'javascript:alert(1)',
      'JavaScript:alert(1)',
      'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
      'vbscript:msgbox(1)',
      ' javascript:alert(1)',
      'http://example.net/plain.jpg',
    ]) {
      expect(drawable(url), url).toBeUndefined();
    }
  });
});
