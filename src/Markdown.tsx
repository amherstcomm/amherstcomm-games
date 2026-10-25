// Text an organiser writes for others to read -- a giveaway's terms --
// rendered from Markdown.
//
// A small set of it: paragraphs, headings, bold and italic, lists, links and
// quotes. Raw HTML is never rendered (react-markdown leaves it as text), and
// a link to anything but the web or email is dropped, so pasted terms cannot
// put anything on the page but formatting. Anything outside the set keeps its
// words and loses its markup.
//
// Loaded on its own, when a page has something to show with it: the parser is
// most of its weight, and most pages never need it.
import ReactMarkdown, { defaultUrlTransform, type Components } from 'react-markdown';

const ALLOWED = ['p', 'strong', 'em', 'ul', 'ol', 'li', 'a', 'h1', 'h2', 'h3', 'h4', 'blockquote', 'br', 'hr'];

const heading = 'text-sm font-semibold text-slate-200';

const COMPONENTS: Components = {
  p: ({ children }) => <p>{children}</p>,
  h1: ({ children }) => <p className={heading}>{children}</p>,
  h2: ({ children }) => <p className={heading}>{children}</p>,
  h3: ({ children }) => <p className={heading}>{children}</p>,
  h4: ({ children }) => <p className={heading}>{children}</p>,
  strong: ({ children }) => <strong className="font-semibold text-slate-200">{children}</strong>,
  ul: ({ children }) => <ul className="list-disc pl-5 space-y-1">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal pl-5 space-y-1">{children}</ol>,
  blockquote: ({ children }) => <blockquote className="border-l-2 border-white/20 pl-3 text-slate-400">{children}</blockquote>,
  hr: () => <hr className="border-white/10" />,
  a: ({ href, children }) => (
    <a href={href} className="text-accent underline" target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ),
};

/** The web and email only; anything else is no link at all. */
function safeUrl(url: string): string {
  const out = defaultUrlTransform(url);
  return /^(https?:|mailto:)/i.test(out) ? out : '';
}

export default function Markdown({ text, className = '' }: { text: string; className?: string }) {
  return (
    <div className={`space-y-2 break-words ${className}`}>
      <ReactMarkdown allowedElements={ALLOWED} unwrapDisallowed components={COMPONENTS} urlTransform={safeUrl}>
        {text}
      </ReactMarkdown>
    </div>
  );
}
