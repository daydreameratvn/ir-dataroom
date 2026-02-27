import { useState } from 'react';
import { Play, ArrowLeft } from 'lucide-react';
import { Button, Card, CardContent, Input } from '@papaya/shared-ui';
import useAgentStream from '../hooks/useAgentStream';
import { startComplianceCheck } from '../api';
import ChatMessages from './ChatMessages';

export default function ComplianceTab() {
  const [claimCode, setClaimCode] = useState('');
  const [isStarting, setIsStarting] = useState(false);
  const [activeClaimCode, setActiveClaimCode] = useState<string | null>(null);
  const { messages, status, error, startStream, reset } = useAgentStream();

  async function handleStart() {
    if (!claimCode.trim()) return;

    setIsStarting(true);
    setActiveClaimCode(claimCode.trim());

    try {
      const response = await startComplianceCheck(claimCode.trim());
      startStream(response);
    } catch (err) {
      // Error is set by the hook
    } finally {
      setIsStarting(false);
    }
  }

  function handleBack() {
    reset();
    setActiveClaimCode(null);
    setClaimCode('');
  }

  // Chat mode: streaming compliance results
  if (activeClaimCode) {
    return (
      <div className="flex h-[600px] flex-col">
        {/* Header */}
        <div className="flex items-center gap-3 border-b px-4 py-3">
          <Button variant="ghost" size="sm" onClick={handleBack} className="gap-1.5">
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          <span className="text-sm font-medium">
            Compliance Check: <span className="font-mono">{activeClaimCode}</span>
          </span>
          {status === 'streaming' && (
            <span className="text-xs text-blue-600">Running...</span>
          )}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-hidden">
          <ChatMessages
            messages={messages}
            onApprove={() => {}}
            onDeny={() => {}}
          />
        </div>

        {error && (
          <div className="border-t border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
            {error}
          </div>
        )}
      </div>
    );
  }

  // Landing mode: claim code input
  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-end gap-4">
            <div className="flex-1 space-y-1.5">
              <label className="text-sm font-medium">Claim Code</label>
              <Input
                placeholder="Enter claim code..."
                value={claimCode}
                onChange={(e) => setClaimCode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleStart();
                }}
              />
            </div>
            <Button
              onClick={handleStart}
              disabled={!claimCode.trim() || isStarting}
              className="gap-2"
            >
              <Play className="h-4 w-4" />
              {isStarting ? 'Starting...' : 'Run Compliance Check'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
        Enter a claim code to check document compliance. The agent will verify
        all required documents have been submitted and are valid.
      </div>
    </div>
  );
}
