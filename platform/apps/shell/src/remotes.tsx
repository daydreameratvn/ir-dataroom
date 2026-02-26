import { lazy } from 'react';
import type { RouteObject } from 'react-router-dom';
import RemoteLoader from './components/RemoteLoader';

/**
 * Inject routes for Module Federation remotes that are currently configured.
 *
 * Remote imports MUST NOT appear statically in routes.tsx — both Vite's import
 * scanner and MF's plugin would fail when the remote isn't registered.
 *
 * The dynamic specifier (variable + @vite-ignore) ensures:
 * 1. Vite doesn't try to resolve the import at transform time
 * 2. MF handles module resolution at runtime via its shared scope
 */
export function injectRemoteRoutes(routes: RouteObject[]) {
  const protectedRoute = routes.find((r) => r.path === '/');
  if (!protectedRoute?.children) return;

  // Sample remote — only available when VITE_SAMPLE_REMOTE_URL is set
  if (import.meta.env.VITE_SAMPLE_REMOTE_URL) {
    const sampleModule = 'sample/entry';
    const SampleEntry = lazy(() => import(/* @vite-ignore */ sampleModule));
    protectedRoute.children.push({
      path: 'sample/*',
      element: (
        <RemoteLoader name="Sample Remote">
          <SampleEntry basePath="/sample" />
        </RemoteLoader>
      ),
    });
  }

  // Add more remote routes here as new remote apps are created:
  // if (import.meta.env.VITE_<REMOTE>_URL) { ... }
}
