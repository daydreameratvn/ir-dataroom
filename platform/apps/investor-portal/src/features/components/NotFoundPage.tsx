import { useNavigate } from 'react-router-dom';
import { Button } from '@papaya/shared-ui';
import { ArrowLeft } from 'lucide-react';

export default function NotFoundPage() {
  const navigate = useNavigate();

  return (
    <div className="flex min-h-[400px] flex-col items-center justify-center gap-4 p-6">
      <p className="text-5xl font-bold text-muted-foreground/30">404</p>
      <p className="text-sm text-muted-foreground">
        The page you're looking for doesn't exist.
      </p>
      <Button variant="outline" onClick={() => navigate('/', { replace: true })}>
        <ArrowLeft className="size-4" />
        Back to Rounds
      </Button>
    </div>
  );
}
