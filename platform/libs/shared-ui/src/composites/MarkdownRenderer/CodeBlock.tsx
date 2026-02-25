import { useEffect, useState } from 'react';
import { codeToHtml } from 'shiki';

interface CodeBlockProps {
  className?: string;
  children: React.ReactNode;
}

export default function CodeBlock({ className, children }: CodeBlockProps) {
  const [html, setHtml] = useState<string>('');
  const language = className?.replace('language-', '') || 'text';
  const code = String(children).trim();

  useEffect(() => {
    let cancelled = false;
    codeToHtml(code, {
      lang: language,
      theme: 'github-dark-default',
    }).then((result) => {
      if (!cancelled) setHtml(result);
    });
    return () => {
      cancelled = true;
    };
  }, [code, language]);

  if (!html) {
    return (
      <pre className="rounded-lg bg-zinc-900 p-4 overflow-x-auto">
        <code className="text-sm font-mono text-zinc-100">{code}</code>
      </pre>
    );
  }

  return (
    <div
      className="rounded-lg overflow-x-auto text-sm [&>pre]:p-4 [&>pre]:overflow-x-auto"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
