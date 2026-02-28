import { RefreshCw } from 'lucide-react';
import { Button } from '@papaya/shared-ui';

interface NewDataBannerProps {
  message?: string;
  onRefresh: () => void;
}

export default function NewDataBanner({
  message = 'New data is available.',
  onRefresh,
}: NewDataBannerProps) {
  return (
    <div className="flex items-center justify-between rounded-md border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm text-blue-700 dark:border-blue-800 dark:bg-blue-950/50 dark:text-blue-300">
      <span>{message}</span>
      <Button variant="outline" size="sm" onClick={onRefresh} className="ml-4 gap-1.5">
        <RefreshCw className="h-3.5 w-3.5" />
        Refresh
      </Button>
    </div>
  );
}
