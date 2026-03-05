import { Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  FileSearch,
  FilePlus,
  BarChart3,
  ShieldAlert,
  Scale,
  Settings,
} from 'lucide-react';
import { cn, ScrollArea, Separator } from '@papaya/shared-ui';
import { useTranslation } from '@papaya/i18n';
import { usePortalConfig } from './hooks/usePortalConfig';
import DashboardView from './components/DashboardView';
import ClaimsList from './components/ClaimsList';
import NewClaimForm from './components/NewClaimForm';
import ClaimDetail from './components/ClaimDetail';
import AnalyticsView from './components/AnalyticsView';
import FWAAnalyticsView from './components/FWAAnalyticsView';
import FWACasesList from './components/FWACasesList';
import FWACaseDetail from './components/FWACaseDetail';
import SettingsView from './components/SettingsView';

interface NavItem {
  label: string;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
  show?: boolean;
}

function PortalSidebar() {
  const { t } = useTranslation();
  const location = useLocation();
  const { config } = usePortalConfig();
  const modules = config?.modules;

  const navItems: NavItem[] = [
    { label: t('portal.dashboard.title'), path: '/portal', icon: LayoutDashboard },
    { label: t('portal.claims.title'), path: '/portal/claims', icon: FileSearch },
    { label: t('portal.newClaim.title'), path: '/portal/claims/new', icon: FilePlus },
    {
      label: t('portal.analytics.title'),
      path: '/portal/analytics',
      icon: BarChart3,
      show: !!(modules?.assessment || modules?.medical_necessity),
    },
    {
      label: t('portal.fwaAnalytics.title'),
      path: '/portal/fwa-analytics',
      icon: ShieldAlert,
      show: !!modules?.fwa,
    },
    {
      label: t('portal.fwaCases.title'),
      path: '/portal/fwa-cases',
      icon: Scale,
      show: !!modules?.fwa,
    },
    { label: t('portal.settings.title'), path: '/portal/settings', icon: Settings },
  ];

  function isActive(item: NavItem): boolean {
    const currentPath = location.pathname;
    if (item.path === '/portal') return currentPath === '/portal';
    return currentPath.startsWith(item.path);
  }

  return (
    <aside className="w-56 shrink-0 border-r bg-muted/30">
      <ScrollArea className="h-full">
        <div className="p-4">
          <h2 className="mb-1 truncate text-sm font-semibold">
            {config?.tenantName || t('portal.title')}
          </h2>
          <p className="truncate text-xs text-muted-foreground">
            {config?.market || t('portal.insurancePortal')}
          </p>
        </div>
        <Separator />
        <nav className="flex flex-col gap-1 p-2">
          {navItems
            .filter((item) => item.show !== false)
            .map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  isActive(item)
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {item.label}
              </Link>
            ))}
        </nav>
      </ScrollArea>
    </aside>
  );
}

export default function PortalPage() {
  return (
    <div className="-m-6 flex h-[calc(100vh-3.5rem)]">
      <PortalSidebar />
      <div className="min-w-0 flex-1 overflow-y-auto p-6">
        <Routes>
          <Route index element={<DashboardView />} />
          <Route path="claims" element={<ClaimsList />} />
          <Route path="claims/new" element={<NewClaimForm />} />
          <Route path="claims/:id" element={<ClaimDetail />} />
          <Route path="analytics" element={<AnalyticsView />} />
          <Route path="fwa-analytics" element={<FWAAnalyticsView />} />
          <Route path="fwa-cases" element={<FWACasesList />} />
          <Route path="fwa-cases/:id" element={<FWACaseDetail />} />
          <Route path="settings" element={<SettingsView />} />
          <Route path="*" element={<Navigate to="/portal" replace />} />
        </Routes>
      </div>
    </div>
  );
}
