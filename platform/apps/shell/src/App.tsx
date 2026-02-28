import { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { useAuth } from '@papaya/auth';
import { cn } from '@papaya/shared-ui';
import { RefreshCw } from 'lucide-react';
import AppSidebar from './components/AppSidebar';
import TopBar from './components/TopBar';
import ImpersonationBanner from './components/ImpersonationBanner';
import CommandPalette from './features/command-palette/CommandPalette';
import FatimaPanel from './features/fatima/FatimaPanel';
import { useNewVersion } from './hooks/useNewVersion';

export default function App() {
  const [fatimaOpen, setFatimaOpen] = useState(false);
  const { isImpersonating } = useAuth();
  const hasNewVersion = useNewVersion();

  // Global ⌘J shortcut to toggle Fatima panel
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'j') {
        e.preventDefault();
        setFatimaOpen((prev) => !prev);
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <>
      {hasNewVersion && (
        <div className="fixed top-4 left-1/2 z-[100] -translate-x-1/2 animate-in fade-in slide-in-from-top-2 duration-300">
          <button
            onClick={() => window.location.reload()}
            className="flex items-center gap-2 rounded-full border border-primary/20 bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-lg transition-transform hover:scale-105 active:scale-95"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Phiên bản mới — Nhấn để cập nhật
          </button>
        </div>
      )}
      <ImpersonationBanner />
      <div className={cn('flex h-screen overflow-hidden', isImpersonating && 'pt-10')}>
        <AppSidebar onOpenFatima={() => setFatimaOpen(true)} />

        <div className="flex flex-1 flex-col overflow-hidden">
          <TopBar onOpenCommandPalette={() => {/* handled by ⌘K in CommandPalette */}} />

          <main className="flex-1 overflow-auto p-6">
            <Outlet />
          </main>
        </div>

        <CommandPalette onOpenFatima={() => setFatimaOpen(true)} />
        <FatimaPanel open={fatimaOpen} onClose={() => setFatimaOpen(false)} />
      </div>
    </>
  );
}
