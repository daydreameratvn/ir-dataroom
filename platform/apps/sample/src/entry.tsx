import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { routes } from './routes';

interface EntryProps {
  basePath?: string;
}

export default function Entry({ basePath = '/' }: EntryProps) {
  const router = createMemoryRouter(routes, {
    initialEntries: [basePath],
  });
  return <RouterProvider router={router} />;
}
