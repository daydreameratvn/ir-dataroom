import { FileCheck, Camera, Shield } from 'lucide-react';

interface IntroStepProps {
  onNext: () => void;
}

export default function IntroStep({ onNext }: IntroStepProps) {
  return (
    <div className="space-y-6 py-4">
      <div className="text-center">
        <h2 className="text-lg font-bold text-gray-900">
          Nộp yêu cầu bồi thường
        </h2>
        <p className="mt-2 text-sm text-gray-500">
          Vui lòng chuẩn bị các hồ sơ cần thiết trước khi bắt đầu
        </p>
      </div>

      <div className="space-y-4">
        <div className="flex gap-3 rounded-xl bg-white p-4">
          <Camera className="mt-0.5 h-5 w-5 shrink-0 text-[#E30613]" />
          <div>
            <p className="text-sm font-semibold text-gray-900">
              Chụp ảnh hoặc scan hồ sơ
            </p>
            <p className="mt-1 text-xs text-gray-500">
              Hóa đơn, biên lai, giấy ra viện, đơn thuốc, CMND/CCCD
            </p>
          </div>
        </div>

        <div className="flex gap-3 rounded-xl bg-white p-4">
          <FileCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#E30613]" />
          <div>
            <p className="text-sm font-semibold text-gray-900">
              Điền thông tin yêu cầu
            </p>
            <p className="mt-1 text-xs text-gray-500">
              Thông tin cá nhân, thông tin thanh toán, số tiền yêu cầu
            </p>
          </div>
        </div>

        <div className="flex gap-3 rounded-xl bg-white p-4">
          <Shield className="mt-0.5 h-5 w-5 shrink-0 text-[#E30613]" />
          <div>
            <p className="text-sm font-semibold text-gray-900">
              Xác thực và cam kết
            </p>
            <p className="mt-1 text-xs text-gray-500">
              Xác thực OTP và cam kết thông tin chính xác
            </p>
          </div>
        </div>
      </div>

      <button
        onClick={onNext}
        className="w-full rounded-xl bg-[#E30613] py-3 text-sm font-semibold text-white transition-colors hover:bg-[#B8050F]"
      >
        Bắt đầu
      </button>
    </div>
  );
}
