// One picture from a session's question, fetched through an expiring link.
import { useEffect, useState } from 'react';
import { sessionPictureLink } from '@/sessionPictures';

export default function SessionPicture({ path, alt, className = '' }: {
  path: string;
  /** what it shows, for somebody who cannot see it */
  alt: string;
  className?: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setUrl(null);
    if (path) void sessionPictureLink(path).then((u) => alive && setUrl(u));
    return () => {
      alive = false;
    };
  }, [path]);
  if (!url) {
    return <span role="img" aria-label={alt} className={`block bg-white/5 rounded-lg ${className}`} />;
  }
  return <img src={url} alt={alt} className={`block object-cover rounded-lg ${className}`} />;
}
