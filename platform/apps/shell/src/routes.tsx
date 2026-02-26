import { lazy } from 'react';
import type { RouteObject } from 'react-router-dom';
import App from './App';
import { ProtectedRoute, LoginPage } from '@papaya/auth';

// Feature pages
const DashboardPage = lazy(() => import('./features/dashboard/DashboardPage'));
const ClaimsPage = lazy(() => import('./features/claims/ClaimsPage'));
const PoliciesPage = lazy(() => import('./features/policies/PoliciesPage'));
const UnderwritingPage = lazy(() => import('./features/underwriting/UnderwritingPage'));
const FWAPage = lazy(() => import('./features/fwa/FWAPage'));
const ProvidersPage = lazy(() => import('./features/providers/ProvidersPage'));
const ReportingPage = lazy(() => import('./features/reporting/ReportingPage'));
const AdminPage = lazy(() => import('./features/admin/AdminPage'));
const AIAgentsPage = lazy(() => import('./features/ai-agents/AIAgentsPage'));
const FatimaPage = lazy(() => import('./features/fatima/FatimaPage'));
const DronePage = lazy(() => import('./features/drone/DronePage'));
const DesignSystemPage = lazy(() => import('./features/design-system/DesignSystemPage'));
const StatusPage = lazy(() => import('./features/status/StatusPage'));
const StatusPagePublic = lazy(() => import('./features/status/StatusPagePublic'));

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
    path: '/status',
    element: <StatusPagePublic />,
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

      // Design System Reference
      {
        path: 'design-system',
        element: <DesignSystemPage />,
      },

      // System Status (authenticated view)
      {
        path: 'system-status',
        element: <StatusPage />,
      },
    ],
  },
];
