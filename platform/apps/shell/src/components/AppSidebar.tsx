import { useState, useEffect, useCallback } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  LayoutDashboard,
  FileText,
  Shield,
  ClipboardCheck,
  ShieldAlert,
  BarChart3,
  Building2,
  Settings,
  Bot,
  Briefcase,
  Brain,
  ScanSearch,
  Sparkles,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  cn,
  ScrollArea,
  Separator,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@papaya/shared-ui';
import type { NavItem, NavGroup } from '@papaya/shared-types';
import { useTenant } from '@/providers/TenantProvider';
import { navigationGroups } from '@/config/navigation';
import IRFlyoutContent from '@/features/ir/components/IRFlyoutContent';
import TenantBranding from './TenantBranding';

const iconMap: Record<string, LucideIcon> = {
  LayoutDashboard,
  FileText,
  Shield,
  ClipboardCheck,
  ShieldAlert,
  BarChart3,
  Building2,
  Settings,
  Bot,
  Briefcase,
  Brain,
  ScanSearch,
};

export interface AppSidebarProps {
  onOpenFatima?: () => void;
}

export default function AppSidebar({ onOpenFatima }: AppSidebarProps) {
  const { t } = useTranslation();
  const location = useLocation();
  const { tenant } = useTenant();
  const [openFlyout, setOpenFlyout] = useState<string | null>(null);

  function isActive(path: string | undefined) {
    if (!path) return false;
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  }

  function isItemActive(item: NavItem): boolean {
    if (item.path && isActive(item.path)) return true;
    return item.children?.some((child) => isActive(child.path)) ?? false;
  }

  function isNavGroupActive(group: NavGroup): boolean {
    return group.items.some(isItemActive);
  }

  function shouldShowItem(item: NavItem): boolean {
    if (item.requiredFeature) {
      const featureKey = item.requiredFeature as keyof typeof tenant.features;
      if (!tenant.features[featureKey]) return false;
    }
    return true;
  }

  const closeFlyout = useCallback(() => setOpenFlyout(null), []);

  // Close flyout on Escape
  useEffect(() => {
    if (!openFlyout) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpenFlyout(null);
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [openFlyout]);

  // Close flyout on route change
  useEffect(() => {
    setOpenFlyout(null);
  }, [location.pathname]);

  function toggleFlyout(groupId: string) {
    setOpenFlyout((prev) => (prev === groupId ? null : groupId));
  }

  // Dashboard is the only item in the 'main' group — it's a direct link in the rail
  const categoryGroups = navigationGroups.filter((g) => g.id !== 'main');
  const activeGroup = categoryGroups.find(isNavGroupActive);

  const flyoutGroup = openFlyout ? categoryGroups.find((g) => g.id === openFlyout) : null;

  return (
    <TooltipProvider delayDuration={300}>
      <div className="relative flex h-screen flex-shrink-0">
        {/* Icon Rail — always visible, 48px */}
        <aside className="flex h-screen w-12 flex-col border-r bg-background">
          {/* Tenant Logo */}
          <Link
            to="/"
            className="flex h-14 items-center justify-center border-b"
          >
            <TenantBranding size="sm" />
          </Link>

          {/* Navigation icons */}
          <nav className="flex flex-1 flex-col items-center gap-1 py-2">
            {/* Dashboard — direct link, no flyout */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  to="/"
                  className={cn(
                    'relative flex h-9 w-9 items-center justify-center rounded-lg transition-colors hover:bg-accent/50',
                    isActive('/') && location.pathname === '/' && 'bg-accent text-foreground',
                    !(isActive('/') && location.pathname === '/') && 'text-muted-foreground'
                  )}
                >
                  {isActive('/') && location.pathname === '/' && (
                    <div className="absolute left-0 top-1.5 h-6 w-0.5 rounded-r bg-papaya" />
                  )}
                  <LayoutDashboard className="h-[18px] w-[18px]" />
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={8}>
                {t('nav.dashboard')}
              </TooltipContent>
            </Tooltip>

            <Separator className="my-1 w-6" />

            {/* Category groups — open flyout on click */}
            {categoryGroups.map((group) => {
              const GroupIcon = group.groupIcon ? iconMap[group.groupIcon] : undefined;
              const groupActive = isNavGroupActive(group);
              const flyoutOpen = openFlyout === group.id;

              if (!GroupIcon) return null;

              return (
                <Tooltip key={group.id}>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => toggleFlyout(group.id)}
                      className={cn(
                        'relative flex h-9 w-9 items-center justify-center rounded-lg transition-colors hover:bg-accent/50',
                        (groupActive || flyoutOpen) && 'bg-accent text-foreground',
                        !(groupActive || flyoutOpen) && 'text-muted-foreground'
                      )}
                    >
                      {groupActive && (
                        <div className="absolute left-0 top-1.5 h-6 w-0.5 rounded-r bg-papaya" />
                      )}
                      <GroupIcon className="h-[18px] w-[18px]" />
                    </button>
                  </TooltipTrigger>
                  {!flyoutOpen && (
                    <TooltipContent side="right" sideOffset={8}>
                      {t(group.labelKey)}
                    </TooltipContent>
                  )}
                </Tooltip>
              );
            })}
          </nav>

          {/* Bottom section */}
          <div className="flex flex-col items-center gap-1 border-t py-2">
            {/* AI Agents link */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  to="/ai-agents"
                  className={cn(
                    'relative flex h-9 w-9 items-center justify-center rounded-lg transition-colors hover:bg-accent/50',
                    isActive('/ai-agents') && 'bg-accent text-foreground',
                    !isActive('/ai-agents') && 'text-muted-foreground'
                  )}
                >
                  {isActive('/ai-agents') && (
                    <div className="absolute left-0 top-1.5 h-6 w-0.5 rounded-r bg-papaya" />
                  )}
                  <Bot className="h-[18px] w-[18px]" />
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={8}>
                {t('nav.aiAgents')}
              </TooltipContent>
            </Tooltip>

            {/* Fatima button */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={onOpenFatima}
                  className="relative flex h-9 w-9 items-center justify-center rounded-lg transition-colors hover:bg-accent/50"
                >
                  <div className="flex h-6 w-6 items-center justify-center rounded-md bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-sm">
                    <Sparkles className="h-3 w-3" />
                  </div>
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={8}>
                <div className="flex items-center gap-2">
                  <span>{t('fatima.askFatima')}</span>
                  <kbd className="inline-flex h-4 items-center gap-0.5 rounded border bg-background/80 px-1 font-mono text-[10px] font-medium text-muted-foreground">
                    <span className="text-[10px]">⌘</span>J
                  </kbd>
                </div>
              </TooltipContent>
            </Tooltip>
          </div>
        </aside>

        {/* Flyout overlay — click to dismiss */}
        {openFlyout && (
          <div
            className="fixed inset-0 z-30"
            onClick={closeFlyout}
            aria-hidden="true"
          />
        )}

        {/* Flyout Panel */}
        <div
          className={cn(
            'absolute left-12 top-0 z-40 h-screen w-60 border-r bg-background shadow-lg',
            'transition-all duration-200 ease-out',
            openFlyout
              ? 'translate-x-0 opacity-100'
              : '-translate-x-2 opacity-0 pointer-events-none'
          )}
        >
          {flyoutGroup && (
            <FlyoutContent
              group={flyoutGroup}
              shouldShowItem={shouldShowItem}
              isActive={isActive}
              isItemActive={isItemActive}
              onNavigate={closeFlyout}
              t={t}
            />
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}

/* -------------------------------------------------------------------------- */
/*  Flyout Content                                                            */
/* -------------------------------------------------------------------------- */

interface FlyoutContentProps {
  group: NavGroup;
  shouldShowItem: (item: NavItem) => boolean;
  isActive: (path: string | undefined) => boolean;
  isItemActive: (item: NavItem) => boolean;
  onNavigate: () => void;
  t: (key: string) => string;
}

function FlyoutContent({ group, shouldShowItem, isActive, isItemActive, onNavigate, t }: FlyoutContentProps) {
  const visibleItems = group.items.filter(shouldShowItem);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex h-14 items-center border-b px-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          {t(group.labelKey)}
        </h2>
      </div>

      {/* Items */}
      <ScrollArea className="flex-1 px-2 py-3">
        <div className="space-y-4">
          {visibleItems.map((item) => {
            // Dynamic IR sidebar — fetch rounds and render sub-tabs
            if (item.id === 'ir') {
              return (
                <div key={item.id} className="space-y-1">
                  <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                    {t(item.labelKey)}
                  </p>
                  <IRFlyoutContent onNavigate={onNavigate} isActive={isActive} />
                </div>
              );
            }

            const hasChildren = item.children && item.children.length > 0;

            if (hasChildren) {
              return (
                <div key={item.id} className="space-y-1">
                  <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                    {t(item.labelKey)}
                  </p>
                  {item.children!.map((child) => {
                    if (!shouldShowItem(child)) return null;
                    const childActive = isActive(child.path);
                    return (
                      <Link
                        key={child.id}
                        to={child.path ?? '#'}
                        onClick={onNavigate}
                        className={cn(
                          'block rounded-md px-3 py-1.5 text-sm transition-colors hover:bg-accent',
                          childActive
                            ? 'font-medium text-foreground bg-accent'
                            : 'text-muted-foreground'
                        )}
                      >
                        {t(child.labelKey)}
                      </Link>
                    );
                  })}
                </div>
              );
            }

            // Direct link item (no children)
            const active = isItemActive(item);
            return (
              <Link
                key={item.id}
                to={item.path ?? '#'}
                onClick={onNavigate}
                className={cn(
                  'block rounded-md px-3 py-1.5 text-sm transition-colors hover:bg-accent',
                  active
                    ? 'font-medium text-foreground bg-accent'
                    : 'text-muted-foreground'
                )}
              >
                {t(item.labelKey)}
              </Link>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
