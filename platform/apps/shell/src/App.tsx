import { Outlet } from 'react-router-dom';

export default function App() {
  return (
    <div className="flex min-h-screen">
      {/* Sidebar placeholder */}
      <aside className="w-64 border-r bg-background p-4">
        <h1 className="text-lg font-bold">Papaya</h1>
        <nav className="mt-6 space-y-2">
          <a href="/" className="block rounded px-2 py-1 text-sm hover:bg-muted">
            Dashboard
          </a>
          <a href="/sample" className="block rounded px-2 py-1 text-sm hover:bg-muted">
            Sample Remote
          </a>
        </nav>
      </aside>

      {/* Main content */}
      <main className="flex-1 p-6">
        <Outlet />
      </main>
    </div>
  );
}
