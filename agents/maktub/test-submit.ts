/**
 * Integration test: Submit a claim via the Maktub agent.
 *
 * Usage:
 *   AWS_PROFILE=banyan AWS_REGION=ap-southeast-1 \
 *   APPLE_GRAPHQL_ENDPOINT=... APPLE_ADMIN_SECRET=... \
 *   HASURA_GRAPHQL_ENDPOINT=... HASURA_ADMIN_TOKEN=... \
 *   bun run agents/maktub/test-submit.ts
 */
import { createClaimSubmissionAgent } from "./agent.ts";
import { getClient } from "../shared/graphql-client.ts";
import { graphql } from "@papaya/graphql/sdk";
import type { DocumentInfo } from "./tools/index.ts";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Query the most recent OTP for any of the given recipients from identity_otps.
 */
async function queryLatestOtp(recipients: string[]): Promise<{ otp: string; recipient: string; created_at: string } | null> {
  const entries: { otp: string; recipient: string; created_at: string }[] = [];
  for (const recipient of recipients) {
    const { data } = await getClient().query({
      query: graphql(`
        query GetLatestOtp($recipient: String!) {
          identity_otps(
            where: { recipient: { _eq: $recipient } }
            order_by: { created_at: desc }
            limit: 1
          ) {
            otp
            recipient
            created_at
          }
        }
      `),
      variables: { recipient },
      fetchPolicy: "no-cache",
    });
    const entry = (data as any)?.identity_otps?.[0];
    if (entry) entries.push(entry);
  }
  entries.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return entries[0] ?? null;
}

/**
 * Verify that documents were uploaded for a claim case.
 */
async function verifyClaimDocuments(claimCaseId: string): Promise<{ count: number; documents: any[] }> {
  const { data } = await getClient().query({
    query: graphql(`
      query VerifyClaimDocuments($claimCaseId: uuid!) {
        claim_documents(
          where: { claim_case_id: { _eq: $claimCaseId }, deleted_at: { _is_null: true } }
          order_by: { created_at: desc }
        ) {
          id
          type
          source
          created_at
          file { id url mime_type }
        }
      }
    `),
    variables: { claimCaseId },
    fetchPolicy: "no-cache",
  });
  const docs = (data as any)?.claim_documents ?? [];
  return { count: docs.length, documents: docs };
}

// ─── Test Documents (simulating S3-uploaded files) ───────────────────────────

const CDN_BASE = "https://care.cdn.services.papaya.asia/docs/test-phcn";
const S3_BUCKET = "papaya-sweetpotato-healthcare-prod";

const testDocuments: DocumentInfo[] = [
  {
    fileUrl: `${CDN_BASE}/business-registration.jpg`,
    fileName: "giay-dkkd.jpg",
    fileType: "image/jpeg",
    documentType: "OtherPaper",
    bucket: S3_BUCKET,
    key: "docs/test-phcn/business-registration.jpg",
  },
  {
    fileUrl: `${CDN_BASE}/treatment-plan.jpg`,
    fileName: "huong-dieu-tri.jpg",
    fileType: "image/jpeg",
    documentType: "PrescriptionPaper",
    bucket: S3_BUCKET,
    key: "docs/test-phcn/treatment-plan.jpg",
  },
  {
    fileUrl: `${CDN_BASE}/symptoms-diagnosis.jpg`,
    fileName: "trieu-chung-chan-doan.jpg",
    fileType: "image/jpeg",
    documentType: "MedicalReport",
    bucket: S3_BUCKET,
    key: "docs/test-phcn/symptoms-diagnosis.jpg",
  },
  {
    fileUrl: `${CDN_BASE}/treatment-progress.jpg`,
    fileName: "bang-theo-doi-lieu-trinh.jpg",
    fileType: "image/jpeg",
    documentType: "MedicalRecord",
    bucket: S3_BUCKET,
    key: "docs/test-phcn/treatment-progress.jpg",
  },
  {
    fileUrl: `${CDN_BASE}/outpatient-record.jpg`,
    fileName: "benh-an-ngoai-tru.jpg",
    fileType: "image/jpeg",
    documentType: "MedicalRecord",
    bucket: S3_BUCKET,
    key: "docs/test-phcn/outpatient-record.jpg",
  },
  {
    fileUrl: `${CDN_BASE}/vat-invoice.jpg`,
    fileName: "hoa-don-vat.jpg",
    fileType: "image/jpeg",
    documentType: "InvoicePaper",
    bucket: S3_BUCKET,
    key: "docs/test-phcn/vat-invoice.jpg",
  },
  {
    fileUrl: `${CDN_BASE}/detailed-statement.jpg`,
    fileName: "bang-ke-chi-tiet.jpg",
    fileType: "image/jpeg",
    documentType: "InvoicePaper",
    bucket: S3_BUCKET,
    key: "docs/test-phcn/detailed-statement.jpg",
  },
];

// ─── Document Analysis (extracted from photos) ──────────────────────────────

const documentAnalysis = `
## Page 0: Giấy Chứng Nhận Đăng Ký Địa Điểm Kinh Doanh (Business Registration)

SỞ KẾ HOẠCH VÀ ĐẦU TƯ TP.HCM — PHÒNG ĐĂNG KÝ KINH DOANH
Mã số địa điểm kinh doanh: 00003
Đăng ký lần đầu: 08/12/2020, Thay đổi lần 1: 25/11/2021

Tên: ĐỊA ĐIỂM KINH DOANH CÔNG TY TNHH MỸ PHẨM VỀ ĐẸP Á CHÂU — PHÒNG KHÁM PHỤC HỒI CHỨC NĂNG SÀI GÒN
Tên viết tắt: PHÒNG KHÁM PHỤC HỒI CHỨC NĂNG SÀI GÒN
Địa chỉ: 47 Trần Nhật Duật, Phường Tân Định, Quận 1, TP.HCM
Người đứng đầu: NGUYỄN THỊ HƯƠNG (CMND: 025629979, sinh 14/03/1983)
Doanh nghiệp chủ quản: CÔNG TY TNHH MỸ PHẨM VỀ ĐẸP Á CHÂU, MST: 0314981321
Địa chỉ trụ sở: 208 Nguyễn Hữu Cảnh, Phường 22, Quận Bình Thạnh, TP.HCM

## Page 1: Hướng Điều Trị (Treatment Plan) — page 2 of medical record

IV. HƯỚNG ĐIỀU TRỊ:
☑ 1. Trị liệu cơ bản
☑ 2. Giãn cơ
☑ 3. Chạy máy cơ
☐ 4. Máy kéo cột sống
☐ 5. Gối thảo dược
☑ 6. Cao phục hồi
☐ 7. Chườm silicat
☐ 8. Siêu âm trị liệu
☐ 9. Chiếu đèn hồng ngoại

Chỉ định: Trị liệu cổ vai gáy cơ bản 8 buổi
Ngày: 13/11/2024
Bác sĩ khám và điều trị: BS.TS NGUYỄN NGỌC BÌNH
Phòng Khám Phục Hồi Chức Năng Sài Gòn — M.S.Đ.Đ.K.D: 0314981321-00003

## Page 2: Triệu Chứng & Chẩn Đoán (Symptoms & Diagnosis) — page 2 of medical record

II.1. TRIỆU CHỨNG:
1.1. Cảm giác: Đau ☑, Tê ☑
1.2. Mức độ đau: Âm ỉ ☑
1.3. Tần suất đau: Thỉnh thoảng ☑
1.4. Vị trí đau: Bệnh nhân đau mỏi cột sống cổ và 2 vai. Bệnh nhân ngồi làm việc cảm giác tê 2 cánh tay.

II.2. CẬN LÂM SÀNG:
MRI ☐ — Kết quả: Không
X-Quang ☐

III. CHẨN ĐOÁN:
CSTL: Không
CSC: Lệch C2 C3 C4 sang Phải. Hẹp biên độ cột sống cổ. Căng rút cơ dọc cột sống cổ và 2 vai.

## Page 3: Bảng Theo Dõi Liệu Trình (Treatment Progress Sheet)

PHÒNG KHÁM PHỤC HỒI CHỨC NĂNG SÀI GÒN (M.S.Đ.Đ.K.D: 0314981321-00003)
Bệnh nhân: Nguyễn Ngọc Đoan Phương
Số điện thoại: 0988391039
Mã số bệnh án: 1039

| Ngày       | Hướng trị liệu                                                                      |
|------------|--------------------------------------------------------------------------------------|
| 13/11/2024 | Trị liệu cổ vai gáy cơ bản, giãn cơ, chạy máy cơ, đắp cao phục hồi, chườm gối thảo dược. KTV: Võ Hải Đào |
| 15/11/2024 | (same) KTV: Võ Hải Đào |
| 17/11/2024 | (same) KTV: Võ Hải Đào |
| 19/11/2024 | (same) KTV: Võ Hải Đào |
| 21/11/2024 | (same) KTV: Võ Hải Đào |
| 23/11/2024 | (same) KTV: Võ Hải Đào |
| 25/11/2024 | (same) KTV: Võ Hải Đào |
| 27/11/2024 | (same) KTV: Võ Hải Đào |

Total: 8 sessions

## Page 4: Bệnh Án Ngoại Trú (Outpatient Medical Record) — page 1

PHÒNG KHÁM CƠ XƯƠNG KHỚP HCM
Phòng Khám Phục Hồi Chức Năng Sài Gòn (M.S.Đ.Đ.K.D: 0314981321-00003)
Mã bệnh án: 1039

I. PHẦN HÀNH CHÍNH:
I.1. Họ và tên: Nguyễn Ngọc Đoan Phương — Năm sinh: 1984
I.2. Nghề nghiệp: Nhân viên văn phòng
I.3. Địa chỉ: 176/28 Nguyễn Thái Học, Tân Đông Hiệp, Dĩ An, Bình Dương
I.4. Số điện thoại: 0988391039
I.5. Đến khám bệnh ngày: 13/11/2024
I.6. Lý do tới khám: Đau cổ vai gáy, tê tay

II. PHẦN CHUYÊN MÔN:
1.1. Quá trình bệnh lý: Mới đau mấy ngày, có dùng thuốc nhưng không đỡ
1.3. Toàn thân: Mạch 80 lần/phút, Nhiệt 36.5, Huyết áp 120/80 mmHg, Nhịp thở 20 lần/phút

## Page 5: Hóa Đơn Giá Trị Gia Tăng (VAT Invoice)

Ký hiệu: 1C24TAC  Số: 126
Ngày: 27/11/2024
Mã CQT: 00E26B618A9C1C44149260FF81B2FC14F3

Tên đơn vị bán hàng (Seller): CÔNG TY TNHH MỸ PHẨM VỀ ĐẸP Á CHÂU
Mã số thuế: 0314981321
Địa chỉ: 208 Nguyễn Hữu Cảnh, Phường 22, Quận Bình Thạnh, TP.HCM

Họ tên người mua hàng (Buyer): Nguyễn Ngọc Đoan Phương
Địa chỉ: 176/28 Nguyễn Thái Học, Tân Đông Hiệp, Dĩ An, Bình Dương
Đồng tiền thanh toán: VNĐ

| STT | Tên hàng hóa, dịch vụ      | Đvt   | Số lượng | Đơn giá  | Thành tiền  |
|-----|-----------------------------|-------|----------|----------|-------------|
| 1   | Trị liệu cổ vai gáy cơ bản | Buổi  | 8        | 500,000  | 4,000,000   |

Cộng tiền hàng: 4,000,000
Thuế suất GTGT: KCT (Không chịu thuế)
Tổng cộng tiền thanh toán: 4,000,000

Số tiền viết bằng chữ: Bốn triệu đồng chẵn.
Ký bởi: CÔNG TY TNHH MỸ PHẨM VỀ ĐẸP Á CHÂU, ngày 27/11/2024

## Page 6: Bảng Kê Chi Tiết (Detailed Statement)

PHÒNG KHÁM PHỤC HỒI CHỨC NĂNG SÀI GÒN (M.S.Đ.Đ.K.D: 0314981321-00003)
Ngày: 27/11/2024
Kèm theo Hóa Đơn số 126, Ngày 27/11/2024
Mã CQT: 00E26B618A9C1C44149260FF81B2FC14F3, Ký hiệu: 1C24TAC
Bên Bán: CÔNG TY TNHH MỸ PHẨM VỀ ĐẸP Á CHÂU, MST: 0314981321
Bên Mua: Nguyễn Ngọc Đoan Phương, 176/28 Nguyễn Thái Học, Tân Đông Hiệp, Dĩ An, Bình Dương

| STT | Tên hàng hóa dịch vụ       | Đơn vị tính | SL | Đơn giá  | Thành tiền  |
|-----|-----------------------------|-------------|-----|----------|-------------|
| 1   | Dịch vụ thăm khám           |             |     |          |             |
| 2   | Giãn cơ                     | buổi        | 8   | 50,000   | 400,000     |
| 3   | Chạy máy cơ                 | buổi        | 8   | 50,000   | 400,000     |
| 4   | Trị liệu cổ vai gáy cơ bản | buổi        | 8   | 300,000  | 2,400,000   |
| 5   | Chườm gối thảo dược         | buổi        | 8   | 50,000   | 400,000     |
| 6   | Đắp cao phục hồi            | buổi        | 8   | 50,000   | 400,000     |
| 9   | Chườm silicat                |             |     |          | —           |
| 7   | Chiếu đèn hồng ngoại        |             |     |          | —           |
| 8   | Siêu âm trị liệu            |             |     |          | —           |

Tổng: 8 buổi × 500,000 = 4,000,000
Cộng tiền hàng: 4,000,000
Thuế suất GTGT: —
Tổng cộng tiền thanh toán: 4,000,000
Số tiền bằng chữ: Bốn triệu đồng chẵn
Ký: Nguyễn Thị Thanh Lan
`;

// ─── Run ─────────────────────────────────────────────────────────────────────

console.log("═".repeat(80));
console.log("MAKTUB — Claim Submission Agent — Integration Test");
console.log("═".repeat(80));
console.log("\nPatient: NGUYỄN NGỌC ĐOAN PHƯƠNG");
console.log("Diagnosis: Lệch C2 C3 C4 sang Phải, Hẹp biên độ cột sống cổ");
console.log("Amount: 4,000,000 VND");
console.log("Provider: Phòng Khám Phục Hồi Chức Năng Sài Gòn");
console.log(`Documents: ${testDocuments.length} files`);
console.log("Date: 13/11/2024 — 27/11/2024\n");

const agent = await createClaimSubmissionAgent({
  documentAnalysis,
  documents: testDocuments,
  pageCount: 7,
});

// Track tool executions for verification
let submittedClaimId: string | null = null;
let otpSent = false;
const testStartedAt = new Date().toISOString();
let totalInputTokens = 0;
let totalOutputTokens = 0;
let totalCacheReadTokens = 0;
let totalCacheWriteTokens = 0;
let llmCallCount = 0;

const RECIPIENTS = ["phuong.nguyennd2@homecredit.vn", "0988391039"];

// Subscribe to events for visibility
agent.subscribe((event: any) => {
  if (event.type === "tool_execution_start") {
    console.log(`\n🔧 [${event.toolName}] calling...`);
  }
  if (event.type === "tool_execution_end") {
    const text = event.result?.content?.[0]?.text;
    if (text) {
      const preview = text.length > 300 ? text.slice(0, 300) + "..." : text;
      console.log(`   ← ${preview}`);
    }
    if (event.toolName === "sendOtp") {
      otpSent = true;
    }
    if (event.toolName === "submitClaim" && text) {
      try {
        const parsed = JSON.parse(text);
        if (parsed.claimId) submittedClaimId = parsed.claimId;
      } catch {}
    }
  }
  if (event.type === "message_end" && event.message?.role === "assistant" && event.message?.usage) {
    const u = event.message.usage;
    totalInputTokens += u.input;
    totalOutputTokens += u.output;
    totalCacheReadTokens += u.cacheRead;
    totalCacheWriteTokens += u.cacheWrite;
    llmCallCount++;
    console.log(`\n📊 [LLM call #${llmCallCount}] input=${u.input} output=${u.output} cache_read=${u.cacheRead} cache_write=${u.cacheWrite}`);
  }
  if (event.type === "error" || event.type === "message_error") {
    console.error(`\n❌ [${event.type}]`, JSON.stringify(event).slice(0, 500));
  }
  if (event.type === "message_update") {
    const evt = event.assistantMessageEvent;
    if (evt?.type === "text_delta") {
      process.stdout.write(evt.delta);
    }
  }
});

/**
 * Query a fresh OTP (created after testStartedAt) with retries.
 * Waits for the OTP to appear in the database after sendOtp is called.
 */
async function waitForFreshOtp(maxRetries = 5, delayMs = 2000): Promise<{ otp: string; recipient: string; created_at: string }> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    await new Promise((r) => setTimeout(r, delayMs));
    const latest = await queryLatestOtp(RECIPIENTS);
    if (latest && latest.created_at > testStartedAt) {
      return latest;
    }
    console.log(`   OTP attempt ${attempt}/${maxRetries}: ${latest ? `found stale OTP (created ${latest.created_at}, need > ${testStartedAt})` : "no OTP found"}`);
  }
  throw new Error(`No fresh OTP found after ${maxRetries} attempts for [${RECIPIENTS.join(", ")}]`);
}

// Turn 1: Analyze documents, find insured, send OTP
console.log("\n── Turn 1: Analyze & Send OTP ──────────────────────────────────────────────\n");
await agent.prompt(
  "Analyze the provided medical documents and submit insurance claims for each identified claim group."
);

// If agent didn't send OTP in Turn 1, nudge it
if (!otpSent) {
  console.log("\n\n── Turn 2: Nudge agent to send OTP ────────────────────────────────────────\n");
  await agent.prompt(
    "Please proceed with sending the OTP to the insured person so we can submit the claim."
  );
}

if (!otpSent) {
  console.error("FAIL: Agent never called sendOtp after 2 turns.");
  process.exit(1);
}

// Query the fresh OTP from the database
console.log("\n\n── Querying OTP from database ──────────────────────────────────────────────\n");
const freshOtp = await waitForFreshOtp();
console.log(`OTP found: ${freshOtp.otp} (for ${freshOtp.recipient}, created ${freshOtp.created_at})`);

// Provide OTP to agent so it can submit the claim and upload documents
console.log("\n── Submit with OTP ─────────────────────────────────────────────────────────\n");
await agent.prompt(`The OTP code is: ${freshOtp.otp}`);

// ─── Verify Documents ────────────────────────────────────────────────────────
console.log("\n\n── Verifying Documents ─────────────────────────────────────────────────────\n");

if (!submittedClaimId) {
  console.error("FAIL: No claim was submitted — cannot verify documents.");
  process.exit(1);
}

const verification = await verifyClaimDocuments(submittedClaimId);
console.log(`Claim ID: ${submittedClaimId}`);
console.log(`Documents found: ${verification.count} / ${testDocuments.length} expected`);

for (const doc of verification.documents) {
  console.log(`  - [${doc.type}] ${doc.file?.url ?? "no file"} (source: ${doc.source})`);
}

if (verification.count === testDocuments.length) {
  console.log("\nPASS: All documents uploaded successfully.");
} else {
  console.error(`\nFAIL: Expected ${testDocuments.length} documents, found ${verification.count}.`);
  process.exit(1);
}

// ─── Token Usage Summary ──────────────────────────────────────────────────────
console.log("\n" + "═".repeat(80));
console.log("TOKEN USAGE SUMMARY");
console.log("═".repeat(80));
console.log(`LLM calls:        ${llmCallCount}`);
console.log(`Input tokens:     ${totalInputTokens.toLocaleString()}`);
console.log(`Output tokens:    ${totalOutputTokens.toLocaleString()}`);
console.log(`Cache read:       ${totalCacheReadTokens.toLocaleString()}`);
console.log(`Cache write:      ${totalCacheWriteTokens.toLocaleString()}`);
console.log(`Total tokens:     ${(totalInputTokens + totalOutputTokens + totalCacheReadTokens + totalCacheWriteTokens).toLocaleString()}`);

// Cost calculation (Gemini 3.1 Flash Lite pricing: $0.50/M input, $3/M output, $0.05/M cache read)
const inputCost = (0.50 / 1_000_000) * totalInputTokens;
const outputCost = (3.0 / 1_000_000) * totalOutputTokens;
const cacheReadCost = (0.05 / 1_000_000) * totalCacheReadTokens;
const totalCost = inputCost + outputCost + cacheReadCost;
const USD_TO_VND = 26_200;
console.log(`\nEstimated cost (USD):`);
console.log(`  Input:          $${inputCost.toFixed(4)}`);
console.log(`  Output:         $${outputCost.toFixed(4)}`);
console.log(`  Cache read:     $${cacheReadCost.toFixed(4)}`);
console.log(`  Total:          $${totalCost.toFixed(4)}`);
console.log(`\nEstimated cost (VND @ ${USD_TO_VND.toLocaleString()} VND/USD):`);
console.log(`  Total:          ${Math.round(totalCost * USD_TO_VND).toLocaleString()} VND`);
console.log("═".repeat(80));
console.log("DONE");
console.log("═".repeat(80));
