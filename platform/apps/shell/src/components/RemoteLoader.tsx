import { Suspense, type ReactNode } from 'react';
import ErrorBoundary from './ErrorBoundary';

interface RemoteLoaderProps {
  name: string;
  children: ReactNode;
}

export default function RemoteLoader({ name, children }: RemoteLoaderProps) {
  return (
    <ErrorBoundary
      fallback={
        <div className="flex flex-col items-center justify-center gap-2 p-8">
          <p className="text-sm text-destructive">Failed to load {name}</p>
          <p className="text-xs text-muted-foreground">
            The remote module may be unavailable. Check that the service is running.
          </p>
        </div>
      }
    >
      <Suspense
        fallback={
          <div className="flex items-center justify-center p-8">
            <p className="text-sm text-muted-foreground">Loading {name}...</p>
          </div>
        }
      >
        {children}
      </Suspense>
    </ErrorBoundary>
  );
}
