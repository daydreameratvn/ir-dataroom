import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider, createBrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { initI18n } from '@papaya/i18n';
import { setTokenAccessor } from '@papaya/api-client';
import { AuthProvider, getAccessToken, reportError } from '@papaya/auth';
import { routes } from './routes';
import { injectRemoteRoutes } from './remotes';
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

// Inject remote app routes (only for remotes registered in vite.config.ts)
injectRemoteRoutes(routes);

const router = createBrowserRouter(routes);

function mount() {
  document.getElementById('app-skeleton')?.remove();

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
}

// Global error listeners — report uncaught errors to backend
window.addEventListener('error', (event) => {
  reportError({
    source: 'frontend_unhandled',
    message: event.message,
    stackTrace: event.error?.stack,
    url: window.location.href,
    severity: 'error',
    metadata: { filename: event.filename, lineno: event.lineno, colno: event.colno },
  });
});

window.addEventListener('unhandledrejection', (event) => {
  const err = event.reason instanceof Error ? event.reason : new Error(String(event.reason));
  reportError({
    source: 'frontend_unhandled',
    message: err.message,
    stackTrace: err.stack,
    url: window.location.href,
    severity: 'error',
    metadata: { type: 'unhandledrejection' },
  });
});

// Initialize i18n before rendering — mount even if i18n fails
initI18n().then(mount, mount);
