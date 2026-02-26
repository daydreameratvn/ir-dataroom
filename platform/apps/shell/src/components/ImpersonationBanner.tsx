import { useAuth } from '@papaya/auth';
import { Button } from '@papaya/shared-ui';
import { Eye, X } from 'lucide-react';

export default function ImpersonationBanner() {
  const { isImpersonating, user, endImpersonation } = useAuth();

  if (!isImpersonating) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between bg-amber-500 px-4 py-2 text-sm font-medium text-white shadow-md">
      <div className="flex items-center gap-2">
        <Eye className="h-4 w-4" />
        <span>
          Viewing as <strong>{user?.name}</strong> ({user?.email})
        </span>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={endImpersonation}
        className="text-white hover:bg-amber-600 hover:text-white"
      >
        <X className="mr-1 h-3 w-3" /> Exit
      </Button>
    </div>
  );
}
