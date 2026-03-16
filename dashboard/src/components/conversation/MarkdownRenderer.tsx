import React, { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';
import { getHighlighter } from '../../utils/shikiHighlighter';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

function CodeBlock({ className, children }: { className?: string; children?: React.ReactNode }) {
  const language = className?.replace('language-', '') ?? '';
  const code = String(children ?? '').replace(/\n$/, '');
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getHighlighter()
      .then((hl) => {
        if (cancelled) return;
        const highlighted = hl.codeToHtml(code, {
          lang: language || 'text',
          theme: 'github-dark',
        });
        setHtml(highlighted);
      })
      .catch(() => {
        // shiki not available (e.g. test env) — keep null fallback
      });
    return () => {
      cancelled = true;
    };
  }, [code, language]);

  if (html) {
    return (
      <div
        className="rounded-md overflow-auto my-2 text-sm"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }

  // Fallback while loading or if shiki unavailable
  return (
    <pre className="rounded-md bg-gray-800 p-4 overflow-auto my-2 text-sm">
      <code className={className ?? ''}>{code}</code>
    </pre>
  );
}

const components: Components = {
  code({ className, children, ...props }) {
    const isFenced = Boolean(className?.startsWith('language-'));
    if (isFenced) {
      return <CodeBlock className={className}>{children}</CodeBlock>;
    }
    // Inline code
    return (
      <code
        className="bg-gray-700 text-pink-300 px-1 py-0.5 rounded text-sm font-mono"
        {...props}
      >
        {children}
      </code>
    );
  },
  h1: ({ children }) => (
    <h1 className="text-2xl font-bold mb-3 mt-4 text-gray-100">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-xl font-semibold mb-2 mt-4 text-gray-100">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-lg font-semibold mb-2 mt-3 text-gray-100">{children}</h3>
  ),
  p: ({ children }) => <p className="mb-2 leading-relaxed text-gray-200">{children}</p>,
  ul: ({ children }) => (
    <ul className="list-disc list-inside mb-2 space-y-1 text-gray-200">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="list-decimal list-inside mb-2 space-y-1 text-gray-200">{children}</ol>
  ),
  li: ({ children }) => <li className="ml-2">{children}</li>,
  a: ({ href, children }) => (
    <a
      href={href}
      className="text-blue-400 underline hover:text-blue-300"
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
    </a>
  ),
  blockquote: ({ children }) => (
    <blockquote className="border-l-4 border-gray-500 pl-4 my-2 text-gray-400 italic">
      {children}
    </blockquote>
  ),
  table: ({ children }) => (
    <div className="overflow-x-auto my-3">
      <table className="border-collapse border border-gray-600 text-sm text-gray-200">
        {children}
      </table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border border-gray-600 px-3 py-1 bg-gray-700 font-semibold text-left">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border border-gray-600 px-3 py-1">{children}</td>
  ),
  hr: () => <hr className="border-gray-600 my-4" />,
};

export function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
  return (
    <div className={`text-gray-100 text-sm ${className ?? ''}`.trim()}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}