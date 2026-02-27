// ── SSE Events from Agent ──

export type SSEEventType =
  | 'agent_start'
  | 'agent_end'
  | 'text_delta'
  | 'thinking_delta'
  | 'message_end'
  | 'tool_start'
  | 'tool_update'
  | 'tool_end'
  | 'approval_request'
  | 'error';

export type SSEEvent =
  | { type: 'agent_start' }
  | { type: 'agent_end' }
  | { type: 'text_delta'; delta: string }
  | { type: 'thinking_delta'; delta: string }
  | { type: 'message_end'; text: string }
  | { type: 'tool_start'; toolCallId: string; toolName: string; args: unknown }
  | { type: 'tool_update'; toolCallId: string; toolName: string; partialResult: unknown }
  | {
      type: 'tool_end';
      toolCallId: string;
      toolName: string;
      result: unknown;
      isError: boolean;
    }
  | { type: 'approval_request'; toolCallId: string; toolName: string; params: unknown }
  | { type: 'error'; message: string };

// ── Chat Message Structure ──

export type MessageRole = 'user' | 'assistant';

export type MessagePartType = 'text' | 'reasoning' | 'tool' | 'approval';

export interface TextPart {
  type: 'text';
  content: string;
}

export interface ReasoningPart {
  type: 'reasoning';
  content: string;
}

export type ToolStatus = 'running' | 'completed' | 'error';

export interface ToolPart {
  type: 'tool';
  toolCallId: string;
  toolName: string;
  args: unknown;
  result?: unknown;
  isError?: boolean;
  status: ToolStatus;
}

export type ApprovalStatus = 'pending' | 'approved' | 'denied';

export interface ApprovalPart {
  type: 'approval';
  toolCallId: string;
  toolName: string;
  params: unknown;
  status: ApprovalStatus;
}

export type MessagePart = TextPart | ReasoningPart | ToolPart | ApprovalPart;

export interface ChatMessage {
  id: string;
  role: MessageRole;
  parts: MessagePart[];
}

// ── Agent Stream Status ──

export type AgentStatus = 'idle' | 'connecting' | 'streaming' | 'error';

// ── Pending Assessment ──

export interface PendingAssessment {
  chatId: string;
  claimCode: string;
  createdAt: number;
}

// ── Scourge Job ──

export type ScourgeJobStatus = 'processing' | 'completed' | 'failed';

export interface ScourgeJob {
  id: string;
  claimCode: string;
  status: ScourgeJobStatus;
  createdAt: number;
  documentCount: number;
}

export interface ScourgeDocument {
  original: {
    id: string;
    fileUrl: string;
    mimeType: string;
  };
  modified: string | null;
  skipped?: boolean;
  reason?: string;
  replacedFields?: string[];
}

export interface ScourgeJobResult {
  claimCode: string;
  documents: ScourgeDocument[];
  replacementPII: Record<string, string | undefined>;
  status: 'completed' | 'failed';
  error?: string;
}

export interface ScourgeJobDetail {
  id: string;
  claimCode: string;
  status: ScourgeJobStatus;
  createdAt: number;
  documentCount: number;
  result: ScourgeJobResult | null;
}

// ── Scourge SSE Events ──

export type ScourgePhase =
  | 'fetching'
  | 'querying'
  | 'extracting'
  | 'editing'
  | 'completed'
  | 'failed';

export type ScourgeSSEEvent =
  | { type: 'job_started'; jobId: string }
  | {
      type: 'progress';
      phase: ScourgePhase;
      message: string;
      currentDoc?: number;
      totalDocs?: number;
      currentField?: string;
    }
  | { type: 'job_completed'; jobId: string; status: string }
  | { type: 'job_failed'; jobId: string; error: string };
