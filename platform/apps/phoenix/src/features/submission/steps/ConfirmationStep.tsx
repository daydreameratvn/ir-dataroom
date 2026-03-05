import { CheckCircle } from 'lucide-react';
import { useSubmissionStore } from '../SubmissionFlow';

interface ConfirmationStepProps {
  onDone: () => void;
}

export default function ConfirmationStep({ onDone }: ConfirmationStepProps) {
  const { claimId } = useSubmissionStore();

  return (
    <div className="flex flex-col items-center py-12 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
        <CheckCircle className="h-10 w-10 text-green-500" />
      </div>

      <h2 className="mb-2 text-lg font-bold text-gray-900">
        Nộp yêu cầu thành công!
      </h2>

      <p className="mb-2 text-sm text-gray-500">
        Yêu cầu bồi thường của bạn đã được ghi nhận và đang được xử lý.
      </p>

      {claimId && (
        <p className="mb-6 text-xs text-gray-400">
          Mã yêu cầu: {claimId}
        </p>
      )}

      <div className="w-full max-w-xs space-y-3">
        <button
          onClick={onDone}
          className="w-full rounded-xl bg-[#E30613] py-3 text-sm font-semibold text-white transition-colors hover:bg-[#B8050F]"
        >
          Về trang chủ
        </button>
      </div>
    </div>
  );
}
