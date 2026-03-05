export const STATUS_LABELS: Record<string, string> = {
  submitted: 'Đã nộp',
  pending_review: 'Chờ thẩm định',
  under_review: 'Đang thẩm định',
  ai_processing: 'Đang xử lý',
  adjudicated: 'Đã thẩm định',
  approved: 'Đã duyệt',
  partially_approved: 'Duyệt một phần',
  denied: 'Từ chối',
  appealed: 'Khiếu nại',
  settled: 'Đã thanh toán',
  closed: 'Đã đóng',
  additional_docs_required: 'Yêu cầu nộp bổ sung',
};

export const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  submitted: { bg: 'bg-blue-100', text: 'text-blue-800' },
  pending_review: { bg: 'bg-yellow-100', text: 'text-yellow-800' },
  under_review: { bg: 'bg-orange-100', text: 'text-orange-800' },
  ai_processing: { bg: 'bg-purple-100', text: 'text-purple-800' },
  adjudicated: { bg: 'bg-indigo-100', text: 'text-indigo-800' },
  approved: { bg: 'bg-green-100', text: 'text-green-800' },
  partially_approved: { bg: 'bg-lime-100', text: 'text-lime-800' },
  denied: { bg: 'bg-red-100', text: 'text-red-800' },
  appealed: { bg: 'bg-amber-100', text: 'text-amber-800' },
  settled: { bg: 'bg-emerald-100', text: 'text-emerald-800' },
  closed: { bg: 'bg-gray-100', text: 'text-gray-800' },
  additional_docs_required: { bg: 'bg-orange-100', text: 'text-orange-800' },
};

export const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  medical_report: 'Báo cáo y tế',
  invoice: 'Hóa đơn',
  receipt: 'Biên lai',
  id_card: 'CMND/CCCD',
  prescription: 'Đơn thuốc',
  discharge_summary: 'Giấy ra viện',
  claim_form: 'Đơn yêu cầu bồi thường',
  other: 'Tài liệu khác',
};
