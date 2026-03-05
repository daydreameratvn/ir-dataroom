import { useSubmissionStore } from '../SubmissionFlow';

interface PaymentInfoStepProps {
  onNext: () => void;
  onBack: () => void;
}

export default function PaymentInfoStep({ onNext, onBack }: PaymentInfoStepProps) {
  const { paymentInfo, setPaymentInfo } = useSubmissionStore();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onNext();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 py-4">
      <div>
        <h2 className="text-base font-semibold text-gray-900">
          Thông tin thanh toán
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          Thông tin tài khoản nhận bồi thường
        </p>
      </div>

      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Tên ngân hàng <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={paymentInfo.bankName}
            onChange={(e) => setPaymentInfo({ bankName: e.target.value })}
            required
            placeholder="VD: Techcombank, Vietcombank..."
            className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm outline-none focus:border-[#E30613] focus:ring-2 focus:ring-[#E30613]/20"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Số tài khoản <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={paymentInfo.accountNumber}
            onChange={(e) => setPaymentInfo({ accountNumber: e.target.value })}
            required
            placeholder="Nhập số tài khoản"
            className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm outline-none focus:border-[#E30613] focus:ring-2 focus:ring-[#E30613]/20"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Chủ tài khoản <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={paymentInfo.accountHolder}
            onChange={(e) => setPaymentInfo({ accountHolder: e.target.value })}
            required
            placeholder="Nhập tên chủ tài khoản"
            className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm outline-none focus:border-[#E30613] focus:ring-2 focus:ring-[#E30613]/20"
          />
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
