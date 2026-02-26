import { lazy } from 'react';
import type { RouteObject } from 'react-router-dom';
import App from './App';
import RemoteLoader from './components/RemoteLoader';
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

// Remote apps
const SampleEntry = lazy(() => import('sample/entry'));

export const routes: RouteObject[] = [
  // Public routes (outside protected layout)
  {
    path: '/login',
    element: <LoginPage />,
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

      // Remote apps
      {
        path: 'sample/*',
        element: (
          <RemoteLoader name="Sample Remote">
            <SampleEntry basePath="/sample" />
          </RemoteLoader>
        ),
      },
    ],
  },
];
