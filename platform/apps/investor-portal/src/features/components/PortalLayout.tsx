import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@papaya/shared-ui';
import { FolderOpen, Sparkles } from 'lucide-react';
import { listRounds } from '@/lib/api';

export default function PortalLayout() {
  const location = useLocation();

  const { data: rounds } = useQuery({
    queryKey: ['rounds'],
    queryFn: listRounds,
  });

  // Only show the first active round (there's only 1 active at a time)
  const activeRound = rounds?.[0];

  const navItems = [
    {
      to: '/assistant',
      label: 'Smart AI Assistance',
      icon: Sparkles,
    },
    ...(activeRound
      ? [
          {
            to: `/rounds/${activeRound.slug}/documents`,
            label: `${activeRound.name} - Data Room`,
            icon: FolderOpen,
          },
        ]
      : []),
  ];

  // Check if we're inside a round route (for Data Room active state)
  const isInRound = location.pathname.startsWith('/rounds/');

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1">
      {/* Sidebar — desktop */}
      <aside className="hidden w-60 shrink-0 border-r md:block">
        <nav className="sticky top-[calc(3.5rem+2px)] p-4">
          <p className="mb-3 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Investor Relations
          </p>
          <ul className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              // Data Room items match any /rounds/* path
              const isActive =
                item.to === '/assistant'
                  ? location.pathname === '/assistant'
                  : isInRound && item.to.startsWith('/rounds/');

              return (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    className={cn(
                      'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                      isActive
                        ? 'border-l-2 border-primary bg-papaya-lightest text-primary'
                        : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                    )}
                  >
                    <Icon className="size-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </nav>
      </aside>

      {/* Mobile tab bar */}
      <div className="fixed bottom-0 left-0 right-0 z-40 border-t bg-background md:hidden">
        <nav className="flex">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              item.to === '/assistant'
                ? location.pathname === '/assistant'
                : isInRound && item.to.startsWith('/rounds/');

            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={cn(
                  'flex flex-1 flex-col items-center gap-1 py-2 text-[10px] font-medium transition-colors',
                  isActive
                    ? 'text-primary'
                    : 'text-muted-foreground',
                )}
              >
                <Icon className="size-5" />
                <span className="truncate px-1">
                  {item.to === '/assistant' ? 'AI Assistant' : 'Data Room'}
                </span>
              </NavLink>
            );
          })}
        </nav>
      </div>

      {/* Content */}
      <main className="min-w-0 flex-1 pb-16 md:pb-0">
        <Outlet />
      </main>
    </div>
  );
}
