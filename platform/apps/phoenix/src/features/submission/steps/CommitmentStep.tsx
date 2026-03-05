import { useState } from 'react';
import { useSubmissionStore } from '../SubmissionFlow';

interface CommitmentStepProps {
  onNext: () => void;
  onBack: () => void;
}

export default function CommitmentStep({ onNext, onBack }: CommitmentStepProps) {
  const { setCommitted } = useSubmissionStore();
  const [agreed, setAgreed] = useState(false);

  function handleSubmit() {
    setCommitted(true);
    onNext();
  }

  return (
    <div className="space-y-4 py-4">
      <div>
        <h2 className="text-base font-semibold text-gray-900">Cam kết</h2>
        <p className="mt-1 text-sm text-gray-500">
          Vui lòng đọc và xác nhận cam kết
        </p>
      </div>

      <div className="rounded-xl bg-white p-4">
        <div className="prose prose-sm max-w-none text-gray-700">
          <p>
            Tôi xin cam kết rằng tất cả thông tin và hồ sơ tôi cung cấp trong
            yêu cầu bồi thường này là chính xác, trung thực và đầy đủ.
          </p>
          <p>
            Tôi hiểu rằng việc cung cấp thông tin sai lệch hoặc gian lận có thể
            dẫn đến việc từ chối yêu cầu bồi thường và các hậu quả pháp lý theo
            quy định của pháp luật.
          </p>
          <p>
            Tôi đồng ý cho TechcomLife và đối tác xử lý thông tin cá nhân của tôi
            phục vụ cho mục đích giải quyết yêu cầu bồi thường.
          </p>
        </div>
      </div>

      <label className="flex items-start gap-3 rounded-xl bg-white p-4">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-gray-300 text-[#E30613] focus:ring-[#E30613]"
        />
        <span className="text-sm text-gray-700">
          Tôi đã đọc, hiểu và đồng ý với các cam kết trên
        </span>
      </label>

      <div className="flex gap-3 pt-4">
        <button
          type="button"
          onClick={onBack}
          className="flex-1 rounded-xl border border-gray-300 py-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
        >
          Quay lại
        </button>
        <button
          onClick={handleSubmit}
          disabled={!agreed}
          className="flex-1 rounded-xl bg-[#E30613] py-3 text-sm font-semibold text-white transition-colors hover:bg-[#B8050F] disabled:opacity-50"
        >
          Nộp yêu cầu
        </button>
      </div>
    </div>
  );
}
