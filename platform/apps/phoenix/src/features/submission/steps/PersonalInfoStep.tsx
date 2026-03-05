import { useSubmissionStore } from '../SubmissionFlow';
import { usePhoenixAuth } from '@/providers/PhoenixAuthProvider';

interface PersonalInfoStepProps {
  onNext: () => void;
  onBack: () => void;
}

export default function PersonalInfoStep({ onNext, onBack }: PersonalInfoStepProps) {
  const { personalInfo, setPersonalInfo } = useSubmissionStore();
  const { activePolicy } = usePhoenixAuth();

  // Pre-fill claimant name from policy if empty
  if (!personalInfo.claimantName && activePolicy?.insuredName) {
    setPersonalInfo({ claimantName: activePolicy.insuredName });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onNext();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 py-4">
      <div>
        <h2 className="text-base font-semibold text-gray-900">Thông tin cá nhân</h2>
        <p className="mt-1 text-sm text-gray-500">
          Điền thông tin về yêu cầu bồi thường
        </p>
      </div>

      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Họ và tên người yêu cầu <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={personalInfo.claimantName}
            onChange={(e) => setPersonalInfo({ claimantName: e.target.value })}
            required
            className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm outline-none focus:border-[#E30613] focus:ring-2 focus:ring-[#E30613]/20"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Số tiền yêu cầu (VND) <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            value={personalInfo.amountClaimed}
            onChange={(e) => setPersonalInfo({ amountClaimed: e.target.value })}
            required
            min="0"
            placeholder="0"
            className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm outline-none focus:border-[#E30613] focus:ring-2 focus:ring-[#E30613]/20"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Cơ sở y tế
          </label>
          <input
            type="text"
            value={personalInfo.providerName}
            onChange={(e) => setPersonalInfo({ providerName: e.target.value })}
            placeholder="Tên bệnh viện / phòng khám"
            className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm outline-none focus:border-[#E30613] focus:ring-2 focus:ring-[#E30613]/20"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Ngày xảy ra sự kiện
            </label>
            <input
              type="date"
              value={personalInfo.dateOfLoss}
              onChange={(e) => setPersonalInfo({ dateOfLoss: e.target.value })}
              className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm outline-none focus:border-[#E30613] focus:ring-2 focus:ring-[#E30613]/20"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Ngày khám/điều trị
            </label>
            <input
              type="date"
              value={personalInfo.dateOfService}
              onChange={(e) => setPersonalInfo({ dateOfService: e.target.value })}
              className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm outline-none focus:border-[#E30613] focus:ring-2 focus:ring-[#E30613]/20"
            />
          </div>
        </div>
      </div>

      <div className="flex gap-3 pt-4">
        <button
          type="button"
          onClick={onBack}
          className="flex-1 rounded-xl border border-gray-300 py-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
        >
          Quay lại
        </button>
        <button
          type="submit"
          className="flex-1 rounded-xl bg-[#E30613] py-3 text-sm font-semibold text-white transition-colors hover:bg-[#B8050F]"
        >
          Tiếp tục
        </button>
      </div>
    </form>
  );
}
