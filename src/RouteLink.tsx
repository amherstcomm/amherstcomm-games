import type { ReactNode } from 'react';

/** A real link that happens to route in place.
 *
 *  The nav used to be buttons, which meant none of these addresses could be
 *  copied, opened in a new tab, or followed by a crawler — and a crawler
 *  landing on "/" found nothing at all to follow. An anchor gets all of that
 *  for free; the only work is handing modified clicks back to the browser so
 *  ctrl-click still opens a tab.
 */
export function RouteLink({
  to,
  onGo,
  className,
  title,
  children,
}: {
  to: string;
  onGo: () => void;
  className?: string;
  title?: string;
  children: ReactNode;
}) {
  return (
    <a
      href={to}
      title={title}
      className={className}
      onClick={(e) => {
        if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        onGo();
      }}
    >
      {children}
    </a>
  );
}

export default RouteLink;
