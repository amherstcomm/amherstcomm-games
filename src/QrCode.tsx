// A QR code, as inline SVG.
//
// Drawn rather than fetched. An <img> pointing at a QR service would be a
// request off the VM for something this site can compute, on a page whose whole
// point is that it works on an internal network — and it would be a third party
// learning which sessions are running and when.
//
// Error correction is M rather than L. The thing this has to survive is a
// projector and a phone camera at the back of a room, and the cost is a
// slightly denser grid rather than a bigger one for the lengths involved.
//
// It is not a decorative element: if it does not scan, nobody gets in. The unit
// test decodes the rendered matrix with an independent decoder and asserts the
// URL comes back, rather than asserting that some squares were drawn.
import qrcode from 'qrcode-generator';

/** The quiet zone. Four modules is what the spec asks for, and the common way
 *  to end up with a code that will not scan is to leave it out — a reader needs
 *  the margin to find the finder patterns against the background. */
const QUIET = 4;

/** One path for every dark module, as a single `d`. One element rather than
 *  hundreds of rects, because the presenter's screen redraws this on every
 *  doorbell. */
export function qrPath(text: string): { d: string; size: number } {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const count = qr.getModuleCount();
  let d = '';
  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      if (qr.isDark(row, col)) d += `M${col + QUIET} ${row + QUIET}h1v1h-1z`;
    }
  }
  return { d, size: count + QUIET * 2 };
}

export default function QrCode({
  text,
  className,
  label,
}: {
  text: string;
  className?: string;
  label: string;
}) {
  const { d, size } = qrPath(text);
  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      className={className}
      role="img"
      aria-label={label}
      // The quiet zone has to be light whatever the page behind it is: a reader
      // looking for the margin against a navy background finds no code at all.
      // This is the one place a literal colour is right — it is not a theme
      // choice, it is part of the symbol.
      style={{ background: '#fff' }}
      shapeRendering="crispEdges"
    >
      <path d={d} fill="#000" />
    </svg>
  );
}
