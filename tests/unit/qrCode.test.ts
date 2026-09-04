// The QR code, decoded.
//
// Asserting that a path was produced would prove nothing: a QR code that does
// not scan looks exactly like one that does, and the failure happens in a room
// with a projector and no way to fix it. So these render the matrix to pixels
// and read it back with jsQR — a different implementation by different people —
// and check the URL survives.
//
// That is why jsqr is a devDependency. It is the only thing in the suite that
// can tell the difference between a QR code and a picture of one.
import { describe, expect, it } from 'vitest';
import jsQR from 'jsqr';
import { qrPath } from '@/QrCode';

/** The path back to pixels: parse the `d` we emit, paint those modules black on
 *  a white field, and scale up so the decoder has something to lock onto. A
 *  reader needs several pixels per module; at 1:1 it finds nothing, which is
 *  the same thing that happens to a code printed too small. */
function pixels(text: string, scale = 6) {
  const { d, size } = qrPath(text);
  const w = size * scale;
  const data = new Uint8ClampedArray(w * w * 4).fill(255);
  for (const m of d.matchAll(/M(\d+) (\d+)h1v1h-1z/g)) {
    const col = Number(m[1]);
    const row = Number(m[2]);
    for (let y = row * scale; y < (row + 1) * scale; y++) {
      for (let x = col * scale; x < (col + 1) * scale; x++) {
        const i = (y * w + x) * 4;
        data[i] = data[i + 1] = data[i + 2] = 0;
      }
    }
  }
  return { data, width: w };
}

const read = (text: string) => {
  const { data, width } = pixels(text);
  return jsQR(data, width, width)?.data;
};

describe('the QR code scans', () => {
  it('round-trips a join link', () => {
    const url = 'https://games.amherstcomm.net/join/K4TP';
    expect(read(url)).toBe(url);
  });

  it('round-trips whatever host the deployment actually has', () => {
    // ORIGIN is a build-time value, so the code on the screen is not the one
    // this test was written against
    for (const url of [
      'https://games.amherstcomm.net/join/ABCD',
      'http://localhost:4173/join/ZZ29',
      'https://a-rather-longer-internal-hostname.example.internal/join/9XYW',
    ]) {
      expect(read(url), url).toBe(url);
    }
  });

  it('leaves a quiet zone, without which readers find nothing', () => {
    // The classic way to ship an unscannable code. Checked structurally as well
    // as by decoding, because a decoder handed a bare matrix in isolation can
    // sometimes still manage it while a phone pointed at a screen cannot.
    const { d, size } = qrPath('https://games.amherstcomm.net/join/K4TP');
    const cols = [...d.matchAll(/M(\d+) (\d+)h/g)].map((m) => Number(m[1]));
    const rows = [...d.matchAll(/M(\d+) (\d+)h/g)].map((m) => Number(m[2]));
    expect(Math.min(...cols), 'left margin').toBeGreaterThanOrEqual(4);
    expect(Math.min(...rows), 'top margin').toBeGreaterThanOrEqual(4);
    expect(size - Math.max(...cols), 'right margin').toBeGreaterThanOrEqual(5);
    expect(size - Math.max(...rows), 'bottom margin').toBeGreaterThanOrEqual(5);
  });

  it('grows the grid for a longer address instead of losing data', () => {
    const short = qrPath('https://x.co/join/ABCD').size;
    const long = qrPath(`https://x.co/join/${'A'.repeat(200)}`).size;
    expect(long).toBeGreaterThan(short);
  });
});
