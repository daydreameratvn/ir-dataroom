import { FileText } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function EmptyState() {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col items-center px-4 py-16 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">
        <FileText className="h-8 w-8 text-gray-400" />
      </div>
      <h3 className="mb-1 text-base font-semibold text-gray-900">
        Chưa có yêu cầu bồi thường
      </h3>
      <p className="mb-6 text-sm text-gray-500">
        Bạn có thể nộp yêu cầu bồi thường mới bằng cách nhấn nút bên dưới
      </p>
      <button
        onClick={() => navigate('/submit')}
        className="rounded-lg bg-[#E30613] px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#B8050F]"
      >
        Nộp yêu cầu bồi thường
      </button>
    </div>
  );
}
