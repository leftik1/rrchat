import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { Check, Copy, ExternalLink } from 'lucide-react';

interface MarkdownContentProps {
  content: string;
}

const CodeBlock: React.FC<{ language?: string; value: string }> = ({ language, value }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  return (
    <div className="code-block">
      <div className="code-header">
        <span>{language || 'text'}</span>
        <button
          onClick={handleCopy}
          aria-label="Copy code"
          style={{
            background: 'none',
            border: 'none',
            padding: '2px 4px',
            gap: '4px',
            display: 'inline-flex',
            alignItems: 'center',
            color: 'var(--text-muted)',
            cursor: 'pointer',
          }}
        >
          {copied ? <Check size={13} strokeWidth={1.75} color="var(--text-2)" /> : <Copy size={13} strokeWidth={1.75} />}
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{copied ? 'copied' : 'copy'}</span>
        </button>
      </div>
      <pre className="code-content">
        <code>{value}</code>
      </pre>
    </div>
  );
};

export const MarkdownContent: React.FC<MarkdownContentProps> = ({ content }) => {
  return (
    <div className="prose">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          code({ node, inline, className, children, ...props }: any) {
            const match = /language-(\w+)/.exec(className || '');
            const value = String(children).replace(/\n$/, '');
            if (!inline && (match || value.includes('\n'))) {
              return <CodeBlock language={match ? match[1] : ''} value={value} />;
            }
            return (
              <code className={className} {...props}>
                {children}
              </code>
            );
          },
          a({ href, children, ...props }: any) {
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  color: 'var(--text)',
                  textDecoration: 'underline',
                  textUnderlineOffset: '3px',
                }}
                {...props}
              >
                {children}
              </a>
            );
          },
          img({ src, alt }: any) {
            const isLocalOrData =
              src &&
              (src.startsWith('data:') ||
                src.startsWith('blob:') ||
                src.startsWith('/api/') ||
                src.startsWith(window.location.origin));
            if (!isLocalOrData) {
              return (
                <a
                  href={src}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="press"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 12px',
                    backgroundColor: 'var(--surface-2)',
                    border: '1px solid var(--border-dim)',
                    borderRadius: 'var(--r-s)',
                    fontSize: '12px',
                    color: 'var(--text-muted)',
                    textDecoration: 'none',
                    margin: '6px 0',
                    fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
                  }}
                >
                  <ExternalLink size={13} strokeWidth={1.75} />
                  <span>Open link ({alt || 'external image'})</span>
                </a>
              );
            }
            return (
              <img
                src={src}
                alt={alt || ''}
                style={{ maxWidth: '100%', borderRadius: 'var(--r-m)' }}
              />
            );
          },
          table({ children }) {
            return (
              <div className="table-wrapper">
                <table>{children}</table>
              </div>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};
