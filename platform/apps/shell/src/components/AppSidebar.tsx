import { useState } from 'react';
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
  ChevronRight,
  PanelLeftClose,
  PanelLeft,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  cn,
  Button,
  ScrollArea,
  Separator,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Avatar,
  AvatarFallback,
} from '@papaya/shared-ui';
import type { NavItem, NavGroup } from '@papaya/shared-types';
import { useTenant } from '@/providers/TenantProvider';
import { useAuth } from '@/providers/AuthProvider';
import { navigationGroups } from '@/config/navigation';

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
};

export interface AppSidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export default function AppSidebar({ collapsed, onToggle }: AppSidebarProps) {
  const { t } = useTranslation();
  const location = useLocation();
  const { tenant } = useTenant();
  const { user } = useAuth();
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set(['claims', 'policies']));

  function toggleExpanded(id: string) {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function isActive(path: string | undefined) {
    if (!path) return false;
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  }

  function isGroupActive(item: NavItem): boolean {
    if (item.path && isActive(item.path)) return true;
    return item.children?.some((child) => isActive(child.path)) ?? false;
  }

  function shouldShowItem(item: NavItem): boolean {
    if (item.requiredFeature) {
      const featureKey = item.requiredFeature as keyof typeof tenant.features;
      if (!tenant.features[featureKey]) return false;
    }
    return true;
  }

  function renderNavItem(item: NavItem) {
    if (!shouldShowItem(item)) return null;
    const Icon = item.icon ? iconMap[item.icon] : undefined;
    const hasChildren = item.children && item.children.length > 0;
    const active = isGroupActive(item);
    const expanded = expandedItems.has(item.id);

    if (hasChildren) {
      return (
        <Collapsible key={item.id} open={expanded} onOpenChange={() => toggleExpanded(item.id)}>
          <CollapsibleTrigger asChild>
            <button
              className={cn(
                'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-accent',
                active && 'text-foreground',
                !active && 'text-muted-foreground',
                collapsed && 'justify-center px-2'
              )}
            >
              {Icon && <Icon className="h-4 w-4 flex-shrink-0" />}
              {!collapsed && (
                <>
                  <span className="flex-1 text-left">{t(item.labelKey)}</span>
                  <ChevronRight className={cn('h-3.5 w-3.5 transition-transform', expanded && 'rotate-90')} />
                </>
              )}
            </button>
          </CollapsibleTrigger>
          {!collapsed && (
            <CollapsibleContent>
              <div className="ml-4 mt-1 space-y-0.5 border-l pl-3">
                {item.children!.map((child) => {
                  if (!shouldShowItem(child)) return null;
                  const childActive = isActive(child.path);
                  return (
                    <Link
                      key={child.id}
                      to={child.path ?? '#'}
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
            </CollapsibleContent>
          )}
        </Collapsible>
      );
    }

    return (
      <Link
        key={item.id}
        to={item.path ?? '#'}
        className={cn(
          'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-accent',
          active ? 'bg-accent text-foreground' : 'text-muted-foreground',
          collapsed && 'justify-center px-2'
        )}
      >
        {Icon && <Icon className="h-4 w-4 flex-shrink-0" />}
        {!collapsed && <span>{t(item.labelKey)}</span>}
      </Link>
    );
  }

  function renderGroup(group: NavGroup) {
    const visibleItems = group.items.filter(shouldShowItem);
    if (visibleItems.length === 0) return null;

    return (
      <div key={group.id} className="space-y-1">
        {!collapsed && (
          <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
            {t(group.labelKey)}
          </p>
        )}
        {visibleItems.map(renderNavItem)}
      </div>
    );
  }

  const initials = user?.name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) ?? '?';

  return (
    <aside
      className={cn(
        'flex h-screen flex-col border-r bg-background transition-all duration-200',
        collapsed ? 'w-16' : 'w-64'
      )}
    >
      {/* Header */}
      <div className={cn('flex h-14 items-center border-b px-3', collapsed ? 'justify-center' : 'justify-between')}>
        {!collapsed && (
          <div className="flex items-center gap-2 overflow-hidden">
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-sm">
              P
            </div>
            <span className="truncate text-sm font-semibold">{tenant.name}</span>
          </div>
        )}
        <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0" onClick={onToggle}>
          {collapsed ? <PanelLeft className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </Button>
      </div>

      {/* Navigation */}
      <ScrollArea className="flex-1 px-2 py-3">
        <div className="space-y-4">
          {navigationGroups.map(renderGroup)}
        </div>

        <Separator className="my-3" />

        {/* AI Agents Link */}
        <Link
          to="/ai-agents"
          className={cn(
            'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-accent',
            isActive('/ai-agents') ? 'bg-accent text-foreground' : 'text-muted-foreground',
            collapsed && 'justify-center px-2'
          )}
        >
          <Bot className="h-4 w-4 flex-shrink-0" />
          {!collapsed && <span>{t('nav.aiAgents')}</span>}
        </Link>
      </ScrollArea>

      {/* Footer - User */}
      <div className={cn('border-t p-3', collapsed && 'flex justify-center')}>
        {collapsed ? (
          <Avatar className="h-8 w-8">
            <AvatarFallback className="text-xs">{initials}</AvatarFallback>
          </Avatar>
        ) : (
          <div className="flex items-center gap-3">
            <Avatar className="h-8 w-8 flex-shrink-0">
              <AvatarFallback className="text-xs">{initials}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{user?.name}</p>
              <p className="truncate text-xs text-muted-foreground">{user?.title}</p>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
