import { lazy } from 'react';
import type { RouteObject } from 'react-router-dom';
import App from './App';
import RemoteLoader from './components/RemoteLoader';

const SampleEntry = lazy(() => import('sample/entry'));

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <App />,
    children: [
      {
        index: true,
        element: <div className="text-muted-foreground">Select a module from the sidebar.</div>,
      },
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
