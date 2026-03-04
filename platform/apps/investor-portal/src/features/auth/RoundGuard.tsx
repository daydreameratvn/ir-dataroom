import { Navigate, Outlet, useParams, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getRound } from '@/lib/api';
import { Loader2 } from 'lucide-react';

export default function RoundGuard() {
  const { slug } = useParams<{ slug: string }>();
  const location = useLocation();

  const { data, isLoading, error } = useQuery({
    queryKey: ['round', slug],
    queryFn: () => getRound(slug!),
    enabled: !!slug,
    staleTime: 0,
    refetchOnMount: 'always',
  });

  if (isLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data) {
    return <Navigate to="/" replace />;
  }

  // If NDA is required but not accepted, redirect to NDA page
  // (unless they're already on the NDA page)
  if (
    data.ndaRequired &&
    !data.ndaAccepted &&
    !location.pathname.endsWith('/nda')
  ) {
    return <Navigate to={`/rounds/${slug}/nda`} replace />;
  }

  return <Outlet />;
}
