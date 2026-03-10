import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { getWorkOSLoginUrl } from './auth-client';

interface LocationState {
  from?: { pathname: string };
}

/**
 * Hidden login page that immediately redirects to WorkOS AuthKit.
 * Accessible at /login-workos for testing before production rollout.
 */
export default function WorkOSLoginPage() {
  const location = useLocation();
  const tenantId = '00000000-0000-0000-0000-000000000001';
  const returnUrl = (location.state as LocationState)?.from?.pathname || '/';

  useEffect(() => {
    window.location.href = getWorkOSLoginUrl(tenantId, returnUrl);
  }, [returnUrl]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-white">
      <p className="text-sm text-gray-400">Redirecting...</p>
    </div>
  );
}
