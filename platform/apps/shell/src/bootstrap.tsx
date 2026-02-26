import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider, createBrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { initI18n } from '@papaya/i18n';
import { setTokenAccessor } from '@papaya/api-client';
import { AuthProvider, getAccessToken } from '@papaya/auth';
import { routes } from './routes';
import TenantProvider from './providers/TenantProvider';
import ThemeProvider from './providers/ThemeProvider';
import '@papaya/shared-ui/globals.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      retry: 1,
    },
  },
});

// Wire up auth token to API client
setTokenAccessor(getAccessToken);

const router = createBrowserRouter(routes);

// Initialize i18n before rendering
initI18n().then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <TenantProvider>
            <AuthProvider>
              <RouterProvider router={router} />
            </AuthProvider>
          </TenantProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </StrictMode>,
  );
});
