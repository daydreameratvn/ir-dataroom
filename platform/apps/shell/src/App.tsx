import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import AppSidebar from './components/AppSidebar';
import TopBar from './components/TopBar';
import CommandPalette from './features/command-palette/CommandPalette';
import FatimaPanel from './features/fatima/FatimaPanel';

export default function App() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [fatimaOpen, setFatimaOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden">
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
  );
}
