import { Link } from 'react-router-dom';
import { LogIn } from 'lucide-react';
import { Button } from '@papaya/shared-ui';
import StatusPageContent from './StatusPageContent';

export default function StatusPagePublic() {
  return (
    <div className="min-h-screen bg-background font-[Plus_Jakarta_Sans,system-ui,sans-serif]">
      {/* ── Header ── */}
      <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-papaya text-white font-bold text-xs">
              O
            </div>
            <span className="text-sm font-semibold text-foreground">Oasis</span>
            <span className="text-xs text-muted-foreground">/</span>
            <span className="text-sm text-muted-foreground">System Status</span>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link to="/login">
              <LogIn className="h-3.5 w-3.5" />
              Sign in
            </Link>
          </Button>
        </div>
      </header>

      {/* ── Content ── */}
      <main className="mx-auto max-w-4xl px-6 py-8">
        <StatusPageContent />
      </main>
    </div>
  );
}
