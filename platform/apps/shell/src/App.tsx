import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { useAuth } from '@papaya/auth';
import { cn } from '@papaya/shared-ui';
import AppSidebar from './components/AppSidebar';
import TopBar from './components/TopBar';
import ImpersonationBanner from './components/ImpersonationBanner';
import CommandPalette from './features/command-palette/CommandPalette';
import FatimaPanel from './features/fatima/FatimaPanel';

export default function App() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [fatimaOpen, setFatimaOpen] = useState(false);
  const { isImpersonating } = useAuth();

  return (
    <>
      <ImpersonationBanner />
      <div className={cn('flex h-screen overflow-hidden', isImpersonating && 'pt-10')}>
        <AppSidebar
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed((prev) => !prev)}
          onOpenFatima={() => setFatimaOpen(true)}
        />

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
