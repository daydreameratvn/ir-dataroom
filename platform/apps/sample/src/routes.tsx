import type { RouteObject } from 'react-router-dom';
import App from './App';

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <App />,
    children: [
      {
        index: true,
        element: <div className="p-4 text-muted-foreground">Sample Remote App</div>,
      },
    ],
  },
];
