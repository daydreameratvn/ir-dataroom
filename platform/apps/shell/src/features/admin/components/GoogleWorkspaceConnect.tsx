import { useState } from 'react';
import {
  Button,
  Card,
} from '@papaya/shared-ui';
import { ExternalLink, X, Shield, Loader2 } from 'lucide-react';
import { createProvider, getGoogleConnectUrl } from '../directory-api';

interface GoogleWorkspaceConnectProps {
  onClose: () => void;
  onConnected: () => void;
}

export default function GoogleWorkspaceConnect({
  onClose,
  onConnected,
}: GoogleWorkspaceConnectProps) {
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConnect() {
    setIsConnecting(true);
    setError(null);
    try {
      const provider = await createProvider({
        providerType: 'google_workspace',
        displayName: 'Google Workspace',
      });

      const url = await getGoogleConnectUrl(provider.id);

      // Open popup for Google consent
      const popup = window.open(url, '_blank', 'width=600,height=700');

      // Poll for popup close — user returns to /admin?connected=google
      const interval = setInterval(() => {
        if (popup?.closed) {
          clearInterval(interval);
          onConnected();
          onClose();
        }
      }, 1000);

      // Safety timeout
      setTimeout(() => {
        clearInterval(interval);
        onConnected();
      }, 120_000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start connection');
    } finally {
      setIsConnecting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <Card className="w-full max-w-md p-6">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Connect Google Workspace</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 space-y-4">
          <div className="rounded-lg bg-papaya-lightest p-4">
            <div className="flex gap-3">
              <Shield className="mt-0.5 h-5 w-5 shrink-0 text-papaya" />
              <div className="text-sm">
                <p className="font-medium">Permissions Required</p>
                <p className="mt-1 text-papaya-muted">
                  This will request read-only access to your Google Workspace user
                  directory. Oasis will be able to view user names, email addresses,
                  and account status — but cannot modify your directory.
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-2 text-sm text-papaya-muted">
            <p>After connecting, you can:</p>
            <ul className="list-inside list-disc space-y-1">
              <li>Import all workspace users into Oasis</li>
              <li>Enable domain-based auto-join for new users</li>
              <li>Automatically deactivate users removed from Google</li>
            </ul>
          </div>

          {error && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={handleConnect} disabled={isConnecting}>
              {isConnecting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <ExternalLink className="mr-2 h-4 w-4" />
              )}
              Connect with Google
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
