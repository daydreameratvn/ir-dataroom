import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';
import CodeBlock from './CodeBlock';

interface MarkdownRendererProps {
  content: string;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  enableMath?: boolean;
  /** Optional override for rendering code blocks. Return null to fall back to default CodeBlock. */
  renderCodeBlock?: (language: string, code: string) => ReactNode | null;
}

const sanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    code: [...(defaultSchema.attributes?.['code'] ?? []), 'className'],
  },
};

export default function MarkdownRenderer({
  content,
  className,
  size = 'md',
  enableMath = false,
  renderCodeBlock,
}: MarkdownRendererProps) {
  const remarkPlugins = [remarkGfm, ...(enableMath ? [remarkMath] : [])];
  const rehypePlugins = [
    [rehypeSanitize, sanitizeSchema],
    ...(enableMath ? [rehypeKatex] : []),
  ] as Parameters<typeof ReactMarkdown>[0]['rehypePlugins'];

  const proseSize = {
    sm: 'prose-sm',
    md: 'prose-base',
    lg: 'prose-lg',
  }[size];

  return (
    <div
      className={cn(
        'prose prose-zinc dark:prose-invert max-w-none',
        proseSize,
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins}
        components={{
          table: ({ children }) => (
            <div className="my-4 w-full overflow-x-auto rounded-md border">
              <table className="w-full">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border-b bg-muted/50 px-4 py-2 text-left text-sm font-medium">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border-b px-4 py-2 text-sm">{children}</td>
          ),
          code: ({ className: codeClassName, children, ...props }) => {
            const isInline = !codeClassName;
            if (isInline) {
              return (
                <code
                  className="rounded bg-muted px-1.5 py-0.5 text-sm font-mono"
                  {...props}
                >
                  {children}
                </code>
              );
            }
            if (renderCodeBlock) {
              const lang = codeClassName?.replace('language-', '') || 'text';
              const code = String(children).trim();
              const custom = renderCodeBlock(lang, code);
              if (custom) return <>{custom}</>;
            }
            return (
              <CodeBlock className={codeClassName}>{children}</CodeBlock>
            );
          },
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline underline-offset-4"
            >
              {children}
            </a>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
