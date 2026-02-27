import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useInvestorAuth } from '@/providers/InvestorAuthProvider';

export default function AuthGuard() {
  const { isAuthenticated } = useInvestorAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <Outlet />;
}
