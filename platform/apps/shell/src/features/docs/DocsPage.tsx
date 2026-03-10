import { Routes, Route, Link } from 'react-router-dom';
import { BookOpen } from 'lucide-react';
import DocsIndex from './DocsIndex';
import DocViewer from './DocViewer';
import '@papaya/shared-ui/globals.css';

export default function DocsPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      {/* Public header */}
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <Link to="/docs" className="flex items-center gap-2.5 font-semibold tracking-tight">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <BookOpen className="h-4 w-4" />
            </div>
            <span>Papaya Docs</span>
          </Link>
          <a
            href="https://papaya.asia"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            papaya.asia
          </a>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">
        <Routes>
          <Route index element={<DocsIndex />} />
          <Route path=":slug" element={<DocViewer />} />
        </Routes>
      </main>

      {/* Footer */}
      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4 text-xs text-muted-foreground">
          <span>Papaya</span>
          <span>Built for partners</span>
        </div>
      </footer>
    </div>
  );
}
