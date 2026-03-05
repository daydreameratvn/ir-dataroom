import { useState } from 'react';
import { Send, Bot, User } from 'lucide-react';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

interface AIChatInterfaceProps {
  claimId: string;
}

export default function AIChatInterface({ claimId: _claimId }: AIChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content:
        'Xin chào! Tôi là trợ lý AI của TechcomLife. Tôi có thể giúp bạn với các câu hỏi về hồ sơ bổ sung cần nộp.',
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  async function handleSend() {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: input.trim(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    // Placeholder AI response — will be connected to real agent later
    setTimeout(() => {
      const aiMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content:
          'Cảm ơn câu hỏi của bạn. Tính năng trợ lý AI đang được phát triển. Vui lòng liên hệ hotline 1900-xxxx để được hỗ trợ.',
      };
      setMessages((prev) => [...prev, aiMessage]);
      setIsLoading(false);
    }, 1000);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="flex flex-col rounded-xl border border-gray-200 bg-white">
      <div className="border-b border-gray-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-[#E30613]" />
          <span className="text-sm font-semibold text-gray-900">
            Hỗ trợ AI
          </span>
        </div>
      </div>

      {/* Messages */}
      <div className="max-h-64 space-y-3 overflow-y-auto px-4 py-3">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
          >
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-100">
              {msg.role === 'assistant' ? (
                <Bot className="h-3.5 w-3.5 text-[#E30613]" />
              ) : (
                <User className="h-3.5 w-3.5 text-gray-600" />
              )}
            </div>
            <div
              className={`rounded-xl px-3 py-2 text-sm ${
                msg.role === 'user'
                  ? 'bg-[#E30613] text-white'
                  : 'bg-gray-100 text-gray-900'
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-100">
              <Bot className="h-3.5 w-3.5 text-[#E30613]" />
            </div>
            <div className="rounded-xl bg-gray-100 px-3 py-2 text-sm text-gray-500">
              Đang trả lời...
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-gray-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Nhập câu hỏi..."
            className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-[#E30613] focus:ring-1 focus:ring-[#E30613]/20"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#E30613] text-white transition-colors hover:bg-[#B8050F] disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
