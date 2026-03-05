import type { RouteObject } from 'react-router-dom';
import App from './App';
import LoginPage from './features/auth/LoginPage';
import AuthGuard from './features/auth/AuthGuard';
import ClaimListPage from './features/claims/ClaimListPage';
import ClaimDetailPage from './features/claims/ClaimDetailPage';
import ClaimHistoryPage from './features/claims/ClaimHistoryPage';
import SubmissionFlow from './features/submission/SubmissionFlow';
import AdditionalDocsPage from './features/additional-docs/AdditionalDocsPage';

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <App />,
    children: [
      {
        path: 'login',
        element: <LoginPage />,
      },
      {
        element: <AuthGuard />,
        children: [
          {
            index: true,
            element: <ClaimListPage />,
          },
          {
            path: 'claims/:id',
            element: <ClaimDetailPage />,
          },
          {
            path: 'claims/:id/history',
            element: <ClaimHistoryPage />,
          },
          {
            path: 'claims/:id/additional-docs',
            element: <AdditionalDocsPage />,
          },
          {
            path: 'submit',
            element: <SubmissionFlow />,
          },
        ],
      },
    ],
  },
];
