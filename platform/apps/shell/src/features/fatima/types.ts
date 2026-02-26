export interface FatimaMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  isStreaming?: boolean;
}

export interface FatimaConversation {
  id: string;
  title: string;
  messages: FatimaMessage[];
  createdAt: number;
  updatedAt: number;
}
