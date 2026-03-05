import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import StepIndicator from './components/StepIndicator';
import IntroStep from './steps/IntroStep';
import DocumentUploadStep from './steps/DocumentUploadStep';
import DocumentSummaryStep from './steps/DocumentSummaryStep';
import PersonalInfoStep from './steps/PersonalInfoStep';
import PaymentInfoStep from './steps/PaymentInfoStep';
import OTPVerifyStep from './steps/OTPVerifyStep';
import CommitmentStep from './steps/CommitmentStep';
import ConfirmationStep from './steps/ConfirmationStep';
import { create } from 'zustand';

// ── Submission store ──

export interface UploadedDoc {
  id: string;
  fileName: string;
  fileType: string;
  documentType: string;
  file?: File;
}

interface SubmissionState {
  step: number;
  claimId: string | null;
  documents: UploadedDoc[];
  personalInfo: {
    claimantName: string;
    dateOfLoss: string;
    dateOfService: string;
    providerName: string;
    amountClaimed: string;
  };
  paymentInfo: {
    bankName: string;
    accountNumber: string;
    accountHolder: string;
  };
  otpVerified: boolean;
  committed: boolean;
  setStep: (step: number) => void;
  setClaimId: (id: string) => void;
  addDocument: (doc: UploadedDoc) => void;
  removeDocument: (id: string) => void;
  setPersonalInfo: (info: Partial<SubmissionState['personalInfo']>) => void;
  setPaymentInfo: (info: Partial<SubmissionState['paymentInfo']>) => void;
  setOtpVerified: (v: boolean) => void;
  setCommitted: (v: boolean) => void;
  reset: () => void;
}

const initialState = {
  step: 0,
  claimId: null,
  documents: [],
  personalInfo: {
    claimantName: '',
    dateOfLoss: '',
    dateOfService: '',
    providerName: '',
    amountClaimed: '',
  },
  paymentInfo: {
    bankName: '',
    accountNumber: '',
    accountHolder: '',
  },
  otpVerified: false,
  committed: false,
};

export const useSubmissionStore = create<SubmissionState>((set) => ({
  ...initialState,
  setStep: (step) => set({ step }),
  setClaimId: (claimId) => set({ claimId }),
  addDocument: (doc) =>
    set((s) => ({ documents: [...s.documents, doc] })),
  removeDocument: (id) =>
    set((s) => ({ documents: s.documents.filter((d) => d.id !== id) })),
  setPersonalInfo: (info) =>
    set((s) => ({ personalInfo: { ...s.personalInfo, ...info } })),
  setPaymentInfo: (info) =>
    set((s) => ({ paymentInfo: { ...s.paymentInfo, ...info } })),
  setOtpVerified: (otpVerified) => set({ otpVerified }),
  setCommitted: (committed) => set({ committed }),
  reset: () => set(initialState),
}));

// ── Steps ──

const STEP_LABELS = [
  'Giới thiệu',
  'Tải hồ sơ',
  'Xác nhận hồ sơ',
  'Thông tin cá nhân',
  'Thanh toán',
  'Xác thực OTP',
  'Cam kết',
  'Hoàn thành',
];

export default function SubmissionFlow() {
  const navigate = useNavigate();
  const step = useSubmissionStore((s) => s.step);
  const setStep = useSubmissionStore((s) => s.setStep);
  const reset = useSubmissionStore((s) => s.reset);
  const [_key, setKey] = useState(0);

  function handleCancel() {
    reset();
    navigate('/');
  }

  function handleNext() {
    if (step < STEP_LABELS.length - 1) {
      setStep(step + 1);
      setKey((k) => k + 1);
    }
  }

  function handleBack() {
    if (step > 0) {
      setStep(step - 1);
      setKey((k) => k + 1);
    }
  }

  const stepComponents = [
    <IntroStep key="intro" onNext={handleNext} />,
    <DocumentUploadStep key="docs" onNext={handleNext} onBack={handleBack} />,
    <DocumentSummaryStep key="summary" onNext={handleNext} onBack={handleBack} />,
    <PersonalInfoStep key="personal" onNext={handleNext} onBack={handleBack} />,
    <PaymentInfoStep key="payment" onNext={handleNext} onBack={handleBack} />,
    <OTPVerifyStep key="otp" onNext={handleNext} onBack={handleBack} />,
    <CommitmentStep key="commitment" onNext={handleNext} onBack={handleBack} />,
    <ConfirmationStep key="confirm" onDone={() => { reset(); navigate('/'); }} />,
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white px-4 py-3 shadow-sm">
        <div className="flex items-center gap-3">
          <button
            onClick={handleCancel}
            className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-gray-100"
          >
            <ArrowLeft className="h-5 w-5 text-gray-600" />
          </button>
          <h1 className="text-base font-semibold text-gray-900">
            Nộp yêu cầu bồi thường
          </h1>
        </div>
      </div>

      {/* Step indicator */}
      {step < STEP_LABELS.length - 1 && (
        <div className="px-4 py-3">
          <StepIndicator
            currentStep={step}
            totalSteps={STEP_LABELS.length}
            labels={STEP_LABELS}
          />
        </div>
      )}

      {/* Step content */}
      <div className="px-4 py-2">
        {stepComponents[step]}
      </div>
    </div>
  );
}
