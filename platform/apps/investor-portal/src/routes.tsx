import { Navigate, type RouteObject } from 'react-router-dom';
import App from './App';
import LoginPage from './features/auth/LoginPage';
import OTPVerifyPage from './features/auth/OTPVerifyPage';
import InvestorLayout from './features/components/InvestorLayout';
import RoundSelectPage from './features/rounds/RoundSelectPage';
import DataroomPage from './features/dataroom/DataroomPage';
import DocumentViewer from './features/dataroom/DocumentViewer';
import NDAPage from './features/nda/NDAPage';
import AuthGuard from './features/auth/AuthGuard';
import RoundGuard from './features/auth/RoundGuard';

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <App />,
    children: [
      // Public auth routes
      {
        path: 'login',
        element: <LoginPage />,
      },
      {
        path: 'verify',
        element: <OTPVerifyPage />,
      },

      // Protected routes
      {
        element: <AuthGuard />,
        children: [
          {
            element: <InvestorLayout />,
            children: [
              {
                index: true,
                element: <RoundSelectPage />,
              },
              {
                path: 'rounds/:slug',
                element: <RoundGuard />,
                children: [
                  {
                    index: true,
                    element: <Navigate to="documents" replace />,
                  },
                  {
                    path: 'nda',
                    element: <NDAPage />,
                  },
                  {
                    path: 'documents',
                    element: <DataroomPage />,
                  },
                  {
                    path: 'documents/:id',
                    element: <DocumentViewer />,
                  },
                ],
              },
              // Catch-all: redirect unknown paths to round selection
              {
                path: '*',
                element: <Navigate to="/" replace />,
              },
            ],
          },
        ],
      },
    ],
  },
];
