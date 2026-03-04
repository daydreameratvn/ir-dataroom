import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ExternalLink, Settings } from 'lucide-react';
import { cn, Separator } from '@papaya/shared-ui';
import type { Round } from '../types';
import { listRounds } from '../api';
import { INVESTOR_PORTAL_URL } from '../config';

const SUB_TABS = [
  { label: 'Dashboard', suffix: '' },
  { label: 'Investors', suffix: '/investors' },
  { label: 'Files', suffix: '/files' },
  { label: 'Analytics', suffix: '/analytics' },
  { label: 'NDA Drafting', suffix: '/nda' },
] as const;

interface IRFlyoutContentProps {
  onNavigate: () => void;
  isActive: (path: string | undefined) => boolean;
}

export default function IRFlyoutContent({ onNavigate, isActive }: IRFlyoutContentProps) {
  const { pathname } = useLocation();
  const [rounds, setRounds] = useState<Round[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listRounds({ limit: 50 })
      .then((res) => setRounds(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-3 px-3 py-1">
        <div className="h-3 w-20 animate-pulse rounded bg-muted" />
        <div className="space-y-1.5 pl-0">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-4 w-28 animate-pulse rounded bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  if (rounds.length === 0) {
    return (
      <div className="space-y-3">
        <Link
          to="/ir"
          onClick={onNavigate}
          className={cn(
            'block rounded-md px-3 py-1.5 text-sm transition-colors hover:bg-accent',
            isActive('/ir') ? 'font-medium text-foreground bg-accent' : 'text-muted-foreground'
          )}
        >
          Overview
        </Link>
        <Separator />
        <Link
          to="/ir/settings"
          onClick={onNavigate}
          className={cn(
            'flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors hover:bg-accent',
            isActive('/ir/settings') ? 'font-medium text-foreground bg-accent' : 'text-muted-foreground'
          )}
        >
          <Settings className="h-3.5 w-3.5" />
          Settings
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {rounds.map((round) => {
        const basePath = `/ir/${round.id}`;
        return (
          <div key={round.id} className="space-y-1">
            <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
              {round.name}
            </p>
            {SUB_TABS.map((tab) => {
              const tabPath = `${basePath}${tab.suffix}`;
              const active = tab.suffix
                ? pathname.startsWith(tabPath)
                : pathname === basePath || pathname === `${basePath}/`;
              return (
                <Link
                  key={tab.suffix || 'dashboard'}
                  to={tabPath}
                  onClick={onNavigate}
                  className={cn(
                    'block rounded-md px-3 py-1.5 text-sm transition-colors hover:bg-accent',
                    active ? 'font-medium text-foreground bg-accent' : 'text-muted-foreground'
                  )}
                >
                  {tab.label}
                </Link>
              );
            })}
            <a
              href={`${INVESTOR_PORTAL_URL}/rounds/${round.slug}/documents`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent"
            >
              Investor View
              <ExternalLink className="size-3" />
            </a>
          </div>
        );
      })}

      <Separator className="mx-2" />

      <Link
        to="/ir/settings"
        onClick={onNavigate}
        className={cn(
          'flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors hover:bg-accent',
          isActive('/ir/settings') ? 'font-medium text-foreground bg-accent' : 'text-muted-foreground'
        )}
      >
        <Settings className="h-3.5 w-3.5" />
        Settings
      </Link>
    </div>
  );
}
