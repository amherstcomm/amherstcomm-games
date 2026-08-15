import { forwardRef } from 'react';
import type { LucideProps } from 'lucide-react';

// lucide has no ladder, and the nearest neighbours are all wrong in a way that
// matters here: ArrowDownUp (what this was) says "sort", Rows3 says "table",
// AlignJustify says "text". The game is the one shape none of them draw, so it
// is drawn here — two rails and three rungs, on lucide's own grid so it sits
// with the other eight icons rather than beside them.
const LadderIcon = forwardRef<SVGSVGElement, LucideProps>(function LadderIcon(
  { size = 24, strokeWidth = 2, className, ...rest },
  ref
) {
  return (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...rest}
    >
      <path d="M7 2v20" />
      <path d="M17 2v20" />
      <path d="M7 7h10" />
      <path d="M7 12h10" />
      <path d="M7 17h10" />
    </svg>
  );
});

export default LadderIcon;
