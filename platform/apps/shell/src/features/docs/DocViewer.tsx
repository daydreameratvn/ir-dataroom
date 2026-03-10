import { useParams, Link } from 'react-router-dom';
import { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { ArrowLeft, BookOpen, Copy, Check, Package, ChevronRight } from 'lucide-react';
import { Badge, Button, cn, MarkdownRenderer, ScrollArea, Separator } from '@papaya/shared-ui';
import { getDoc } from './content';

interface TocItem {
  id: string;
  text: string;
  level: number;
}

function extractToc(markdown: string): TocItem[] {
  const items: TocItem[] = [];
  const lines = markdown.split('\n');
  for (const line of lines) {
    const match = line.match(/^(#{2,3})\s+(.+)/);
    if (match) {
      const level = match[1]!.length;
      const text = match[2]!
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // strip markdown links
        .replace(/`([^`]+)`/g, '$1') // strip inline code
        .replace(/\*\*([^*]+)\*\*/g, '$1') // strip bold
        .trim();
      const id = text
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-');
      items.push({ id, text, level });
    }
  }
  return items;
}

// Strip the inline TOC from markdown (the numbered list at the top)
function stripInlineToc(markdown: string): string {
  // Remove the "## Table of Contents" section
  return markdown.replace(/## Table of Contents[\s\S]*?(?=\n---\n)/, '');
}

export default function DocViewer() {
  const { slug } = useParams<{ slug: string }>();
  const doc = slug ? getDoc(slug) : undefined;
  const [activeId, setActiveId] = useState('');
  const [copied, setCopied] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  const toc = useMemo(() => (doc ? extractToc(doc.content) : []), [doc]);
  const cleanContent = useMemo(() => (doc ? stripInlineToc(doc.content) : ''), [doc]);

  // Inject heading IDs after markdown renders, then observe for active TOC
  useEffect(() => {
    if (!contentRef.current) return;

    const headings = contentRef.current.querySelectorAll('h2, h3');
    headings.forEach((h) => {
      if (!h.id) {
        h.id = (h.textContent ?? '')
          .toLowerCase()
          .replace(/[^a-z0-9\s-]/g, '')
          .replace(/\s+/g, '-');
      }
    });

    if (headings.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        }
      },
      { rootMargin: '-80px 0px -70% 0px', threshold: 0 },
    );

    headings.forEach((h) => observer.observe(h));
    return () => observer.disconnect();
  }, [cleanContent]);

  const scrollToSection = useCallback((id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setActiveId(id);
    }
  }, []);

  const copyInstall = useCallback(() => {
    if (!doc) return;
    navigator.clipboard.writeText(`bun add ${doc.packages.join(' ')}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [doc]);

  if (!doc) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20">
        <BookOpen className="h-12 w-12 text-muted-foreground/30" />
        <p className="text-muted-foreground">Documentation not found</p>
        <Link to="/docs">
          <Button variant="outline" size="sm">
            <ArrowLeft className="mr-2 h-3.5 w-3.5" />
            Back to docs
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="flex gap-8">
      {/* Sidebar TOC */}
      <aside className="hidden w-56 shrink-0 xl:block">
        <div className="sticky top-0 -mt-2 pt-2">
          {/* Back link */}
          <Link
            to="/docs"
            className="mb-4 flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3 w-3" />
            All docs
          </Link>

          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            On this page
          </p>

          <ScrollArea className="max-h-[calc(100vh-12rem)]">
            <nav className="space-y-0.5">
              {toc.map((item) => (
                <button
                  key={item.id}
                  onClick={() => scrollToSection(item.id)}
                  className={cn(
                    'block w-full truncate rounded-md px-2 py-1.5 text-left text-[13px] leading-snug transition-colors',
                    item.level === 3 && 'pl-5',
                    activeId === item.id
                      ? 'bg-primary/10 font-medium text-primary'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                  title={item.text}
                >
                  {item.text}
                </button>
              ))}
            </nav>
          </ScrollArea>
        </div>
      </aside>

      {/* Main content */}
      <div className="min-w-0 flex-1" ref={contentRef}>
        {/* Breadcrumb */}
        <div className="mb-6 flex items-center gap-1.5 text-sm text-muted-foreground">
          <Link to="/docs" className="transition-colors hover:text-foreground">
            Docs
          </Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="font-medium text-foreground">{doc.title}</span>
        </div>

        {/* Hero header */}
        <div className="mb-8 rounded-xl border bg-gradient-to-br from-primary/5 via-transparent to-transparent p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight">{doc.title}</h1>
                <Badge variant="outline" className="font-mono text-xs">
                  v{doc.version}
                </Badge>
              </div>
              <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
                {doc.description}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {doc.packages.map((pkg) => (
                  <div
                    key={pkg}
                    className="flex items-center gap-1.5 rounded-full border bg-background px-3 py-1"
                  >
                    <Package className="h-3 w-3 text-muted-foreground" />
                    <span className="font-mono text-xs">{pkg}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Quick install */}
            <button
              onClick={copyInstall}
              className="group flex items-center gap-2 rounded-lg border bg-card px-4 py-2.5 font-mono text-xs transition-colors hover:border-primary/30"
            >
              <span className="text-muted-foreground">$</span>
              <span>bun add {doc.packages.join(' ')}</span>
              {copied ? (
                <Check className="h-3.5 w-3.5 text-green-500" />
              ) : (
                <Copy className="h-3.5 w-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
              )}
            </button>
          </div>
        </div>

        <Separator className="mb-8" />

        {/* Markdown content */}
        <MarkdownRenderer content={cleanContent} size="md" className="pb-20" />
      </div>
    </div>
  );
}
