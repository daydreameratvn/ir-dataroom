import { useState } from 'react';
import { ArrowLeft, Play, Send } from 'lucide-react';
import { Button, Card, CardContent, Input } from '@papaya/shared-ui';
import useAgentStream from '../hooks/useAgentStream';
import { sendApproval, startAssessment } from '../api';
import ChatMessages from './ChatMessages';

interface AssessmentTabProps {
  /** Pre-selected chatId (from Pending tab) */
  initialChatId?: string;
  initialClaimCode?: string;
}

export default function AssessmentTab({
  initialChatId,
  initialClaimCode,
}: AssessmentTabProps) {
  const [claimCode, setClaimCode] = useState(initialClaimCode ?? '');
  const [chatInput, setChatInput] = useState('');
  const [isStarting, setIsStarting] = useState(false);
  const [activeClaimCode, setActiveClaimCode] = useState<string | null>(
    initialClaimCode ?? null,
  );
  const [activeChatId, setActiveChatId] = useState<string | null>(
    initialChatId ?? null,
  );

  const {
    messages,
    status,
    error,
    startStream,
    addUserMessage,
    respondToApproval,
    reset,
  } = useAgentStream();

  // Start new assessment
  async function handleStart() {
    if (!claimCode.trim()) return;

    setIsStarting(true);
    const code = claimCode.trim();
    setActiveClaimCode(code);

    try {
      addUserMessage(`Assess claim ${code}`);
      const response = await startAssessment(code);
      startStream(response);
    } catch {
      // Error set by hook
    } finally {
      setIsStarting(false);
    }
  }

  // Send follow-up message in chat
  async function handleSendMessage() {
    if (!chatInput.trim() || !activeClaimCode) return;

    const text = chatInput.trim();
    setChatInput('');
    addUserMessage(text);

    try {
      const response = await startAssessment(activeClaimCode, text, activeChatId ?? undefined);
      startStream(response);
    } catch {
      // Error set by hook
    }
  }

  // Handle approval response
  async function handleApprove(toolCallId: string) {
    if (!activeChatId) return;

    respondToApproval(toolCallId, true);

    // Find the tool name from messages
    let toolName = '';
    for (const msg of messages) {
      for (const part of msg.parts) {
        if (part.type === 'approval' && part.toolCallId === toolCallId) {
          toolName = part.toolName;
        }
      }
    }

    try {
      const response = await sendApproval(activeChatId, toolCallId, toolName, true);
      startStream(response);
    } catch {
      // Error
    }
  }

  async function handleDeny(toolCallId: string) {
    if (!activeChatId) return;

    respondToApproval(toolCallId, false);

    let toolName = '';
    for (const msg of messages) {
      for (const part of msg.parts) {
        if (part.type === 'approval' && part.toolCallId === toolCallId) {
          toolName = part.toolName;
        }
      }
    }

    try {
      const response = await sendApproval(activeChatId, toolCallId, toolName, false);
      startStream(response);
    } catch {
      // Error
    }
  }

  function handleBack() {
    reset();
    setActiveClaimCode(null);
    setActiveChatId(null);
    setClaimCode('');
    setChatInput('');
  }

  // Chat mode: full conversation view
  if (activeClaimCode && messages.length > 0) {
    return (
      <div className="flex h-[600px] flex-col">
        {/* Header */}
        <div className="flex items-center gap-3 border-b px-4 py-3">
          <Button variant="ghost" size="sm" onClick={handleBack} className="gap-1.5">
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          <span className="text-sm font-medium">
            Assessment: <span className="font-mono">{activeClaimCode}</span>
          </span>
          {status === 'streaming' && (
            <span className="text-xs text-blue-600">Agent working...</span>
          )}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-hidden">
          <ChatMessages
            messages={messages}
            onApprove={handleApprove}
            onDeny={handleDeny}
          />
        </div>

        {/* Error banner */}
        {error && (
          <div className="border-t border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Input bar */}
        <div className="border-t px-4 py-3">
          <div className="flex gap-2">
            <Input
              placeholder="Send a message..."
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              disabled={status === 'streaming'}
            />
            <Button
              onClick={handleSendMessage}
              disabled={!chatInput.trim() || status === 'streaming'}
              className="gap-1.5"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
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
                placeholder="Enter claim code to assess..."
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
              {isStarting ? 'Starting...' : 'Start Assessment'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
        Enter a claim code to start a full assessment. The agent will check document
        compliance, assess benefits, create sign-off, and approve the claim — with your
        approval at each critical step.
      </div>
    </div>
  );
}
