import { Navigate, Outlet } from 'react-router-dom';
import { usePhoenixAuth } from '@/providers/PhoenixAuthProvider';

export default function AuthGuard() {
  const { isAuthenticated } = usePhoenixAuth();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
