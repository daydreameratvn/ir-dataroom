import { useState } from 'react';
import { useSubmissionStore } from '../SubmissionFlow';
import { createClaim, requestOtp, verifyOtp, getUploadUrl } from '@/lib/api';

interface OTPVerifyStepProps {
  onNext: () => void;
  onBack: () => void;
}

export default function OTPVerifyStep({ onNext, onBack }: OTPVerifyStepProps) {
  const {
    claimId,
    setClaimId,
    personalInfo,
    documents,
    setOtpVerified,
  } = useSubmissionStore();

  const [otpCode, setOtpCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRequestOtp() {
    setIsLoading(true);
    setError(null);

    try {
      // Create the claim first if not already created
      let currentClaimId = claimId;
      if (!currentClaimId) {
        const claim = await createClaim({
          claimantName: personalInfo.claimantName,
          amountClaimed: Number(personalInfo.amountClaimed),
          currency: 'VND',
          dateOfLoss: personalInfo.dateOfLoss || undefined,
          dateOfService: personalInfo.dateOfService || undefined,
          providerName: personalInfo.providerName || undefined,
        });
        currentClaimId = claim.id;
        setClaimId(claim.id);

        // Upload documents
        for (const doc of documents) {
          if (doc.file) {
            const { uploadUrl } = await getUploadUrl(claim.id, {
              fileName: doc.fileName,
              fileType: doc.fileType,
              documentType: doc.documentType,
            });

            // Upload to S3 presigned URL
            await fetch(uploadUrl, {
              method: 'PUT',
              body: doc.file,
              headers: { 'Content-Type': doc.fileType },
            });
          }
        }
      }

      await requestOtp(currentClaimId);
      setOtpSent(true);
    } catch {
      setError('Không thể gửi mã OTP. Vui lòng thử lại.');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleVerifyOtp() {
    if (!claimId || !otpCode) return;

    setIsLoading(true);
    setError(null);

    try {
      const result = await verifyOtp(claimId, otpCode);
      if (result.verified) {
        setOtpVerified(true);
        onNext();
      } else {
        setError('Mã OTP không đúng. Vui lòng thử lại.');
      }
    } catch {
      setError('Xác thực thất bại. Vui lòng thử lại.');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="space-y-4 py-4">
      <div>
        <h2 className="text-base font-semibold text-gray-900">Xác thực OTP</h2>
        <p className="mt-1 text-sm text-gray-500">
          Mã xác thực sẽ được gửi đến email/số điện thoại đã đăng ký
        </p>
      </div>

      {!otpSent ? (
        <div className="space-y-4">
          <div className="rounded-xl bg-blue-50 p-4">
            <p className="text-xs text-blue-700">
              Nhấn nút bên dưới để nhận mã xác thực. Yêu cầu bồi thường của bạn
              sẽ được tạo và các hồ sơ sẽ được tải lên.
            </p>
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
              {error}
            </div>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onBack}
              className="flex-1 rounded-xl border border-gray-300 py-3 text-sm font-medium text-gray-700"
            >
              Quay lại
            </button>
            <button
              onClick={handleRequestOtp}
              disabled={isLoading}
              className="flex-1 rounded-xl bg-[#E30613] py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              {isLoading ? 'Đang gửi...' : 'Gửi mã OTP'}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Nhập mã OTP
            </label>
            <input
              type="text"
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value)}
              maxLength={6}
              placeholder="000000"
              className="w-full rounded-lg border border-gray-300 px-4 py-3 text-center text-2xl tracking-[0.5em] outline-none focus:border-[#E30613] focus:ring-2 focus:ring-[#E30613]/20"
              autoFocus
            />
          </div>

          <button
            onClick={handleRequestOtp}
            disabled={isLoading}
            className="text-sm text-[#E30613] underline"
          >
            Gửi lại mã OTP
          </button>

          {error && (
            <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
              {error}
            </div>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onBack}
              className="flex-1 rounded-xl border border-gray-300 py-3 text-sm font-medium text-gray-700"
            >
              Quay lại
            </button>
            <button
              onClick={handleVerifyOtp}
              disabled={isLoading || otpCode.length < 4}
              className="flex-1 rounded-xl bg-[#E30613] py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              {isLoading ? 'Đang xác thực...' : 'Xác thực'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
