import { lazy } from 'react';
import type { RouteObject } from 'react-router-dom';
import App from './App';
import { ProtectedRoute, LoginPage, WorkOSLoginPage } from '@papaya/auth';
import ErrorPage from './components/ErrorPage';

/**
 * Wraps a dynamic import so that chunk-load failures (stale hashes after
 * a new deployment) trigger a single hard reload to pick up the new assets.
 * Uses sessionStorage to prevent infinite reload loops.
 */
function lazyWithReload<T extends { default: React.ComponentType }>(
  factory: () => Promise<T>,
) {
  return lazy(() =>
    factory().catch((err: unknown) => {
      const key = 'chunk-reload';
      if (!sessionStorage.getItem(key)) {
        sessionStorage.setItem(key, '1');
        window.location.reload();
        // Return a never-resolving promise so React doesn't render the error
        return new Promise<T>(() => {});
      }
      sessionStorage.removeItem(key);
      throw err;
    }),
  );
}

// Feature pages
const DashboardPage = lazyWithReload(() => import('./features/dashboard/DashboardPage'));
const ClaimsPage = lazyWithReload(() => import('./features/claims/ClaimsPage'));
const PoliciesPage = lazyWithReload(() => import('./features/policies/PoliciesPage'));
const UnderwritingPage = lazyWithReload(() => import('./features/underwriting/UnderwritingPage'));
const FWAPage = lazyWithReload(() => import('./features/portal/PortalPage'));
const ProvidersPage = lazyWithReload(() => import('./features/providers/ProvidersPage'));
const ReportingPage = lazyWithReload(() => import('./features/reporting/ReportingPage'));
const AdminPage = lazyWithReload(() => import('./features/admin/AdminPage'));
const AIAgentsPage = lazyWithReload(() => import('./features/ai-agents/AIAgentsPage'));
const FatimaPage = lazyWithReload(() => import('./features/fatima/FatimaPage'));
const DronePage = lazyWithReload(() => import('./features/drone/DronePage'));
const IRPage = lazyWithReload(() => import('./features/ir/IRPage'));
const DesignSystemPage = lazyWithReload(() => import('./features/design-system/DesignSystemPage'));
const StatusPage = lazyWithReload(() => import('./features/status/StatusPage'));
const ProfilePage = lazyWithReload(() => import('./features/profile/ProfilePage'));
const StatusPagePublic = lazyWithReload(() => import('./features/status/StatusPagePublic'));
const DocsPage = lazyWithReload(() => import('./features/docs/DocsPage'));

// Remote app routes are injected dynamically in bootstrap.tsx via remotes.tsx.
// They cannot be statically imported here because Vite and MF would fail to resolve
// the remote module when the remote app isn't running.

export const routes: RouteObject[] = [
  // Public routes (outside protected layout)
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/login-workos',
    element: <WorkOSLoginPage />,
  },
  {
    path: '/status',
    element: <StatusPagePublic />,
  },
  {
    path: '/docs/*',
    element: <DocsPage />,
  },

  // Protected routes
  {
    path: '/',
    element: (
      <ProtectedRoute>
        <App />
      </ProtectedRoute>
    ),
    children: [
      // Dashboard
      {
        index: true,
        element: <DashboardPage />,
      },

      // Claims
      {
        path: 'claims/*',
        element: <ClaimsPage />,
      },

      // Policies
      {
        path: 'policies/*',
        element: <PoliciesPage />,
      },

      // Underwriting
      {
        path: 'underwriting/*',
        element: <UnderwritingPage />,
      },

      // FWA Detection
      {
        path: 'fwa/*',
        element: <FWAPage />,
      },

      // Providers
      {
        path: 'providers/*',
        element: <ProvidersPage />,
      },

      // Reporting
      {
        path: 'reporting/*',
        element: <ReportingPage />,
      },

      // Administration
      {
        path: 'admin/*',
        element: <AdminPage />,
      },

      // AI Agents
      {
        path: 'ai-agents',
        element: <AIAgentsPage />,
      },

      // Fatima AI Assistant
      {
        path: 'fatima',
        element: <FatimaPage />,
      },

      // Drone — Automated claims adjudication
      {
        path: 'drone/*',
        element: <DronePage />,
      },


      // Investor Relations — Dataroom management
      {
        path: 'ir/*',
        element: <IRPage />,
      },

      // Design System Reference
      {
        path: 'design-system',
        element: <DesignSystemPage />,
      },

      // User Profile
      {
        path: 'profile',
        element: <ProfilePage />,
      },

      // System Status (authenticated view)
      {
        path: 'system-status',
        element: <StatusPage />,
      },

      // 404 catch-all (inside authenticated layout)
      {
        path: '*',
        element: <ErrorPage variant="not-found" />,
      },
    ],
  },
];
