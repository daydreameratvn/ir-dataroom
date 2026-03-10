import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock S3 before importing the module
vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: class {
    constructor(_config: any) {}
  },
  PutObjectCommand: class {
    constructor(public input: any) {}
  },
}));

vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: vi.fn().mockResolvedValue("https://s3.amazonaws.com/presigned-url"),
}));

import { generateUploadUrls } from "./claim-upload-s3.ts";

describe("generateUploadUrls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should generate upload URLs for valid files", async () => {
    const result = await generateUploadUrls([
      { fileName: "receipt.jpg", fileType: "image/jpeg", documentType: "InvoicePaper" },
      { fileName: "medical-report.png", fileType: "image/png", documentType: "MedicalReport" },
    ]);

    expect(result.batchId).toMatch(/^[0-9a-f-]{36}$/);
    expect(result.uploads).toHaveLength(2);

    const first = result.uploads[0]!;
    expect(first.uploadUrl).toBe("https://s3.amazonaws.com/presigned-url");
    expect(first.fileUrl).toContain("care.cdn.services.papaya.asia");
    expect(first.fileUrl).toContain(result.batchId);
    expect(first.fileName).toBe("receipt.jpg");
    expect(first.fileType).toBe("image/jpeg");
    expect(first.documentType).toBe("InvoicePaper");
    expect(first.bucket).toBe("papaya-sweetpotato-healthcare-prod");
    expect(first.key).toContain("docs/uploads/");
  });

  it("should default documentType to OtherPaper when not specified", async () => {
    const result = await generateUploadUrls([
      { fileName: "photo.jpg", fileType: "image/jpeg" },
    ]);

    expect(result.uploads[0]!.documentType).toBe("OtherPaper");
  });

  it("should sanitize filenames", async () => {
    const result = await generateUploadUrls([
      { fileName: "hóa đơn (1).jpg", fileType: "image/jpeg" },
    ]);

    const safeName = result.uploads[0]!.fileName;
    expect(safeName).not.toContain(" ");
    expect(safeName).not.toContain("(");
    expect(safeName).toMatch(/^[a-zA-Z0-9._-]+$/);
  });

  it("should reject unsupported file types", async () => {
    await expect(
      generateUploadUrls([{ fileName: "virus.exe", fileType: "application/x-executable" }]),
    ).rejects.toThrow("Unsupported file type");
  });

  it("should reject empty files array", async () => {
    await expect(generateUploadUrls([])).rejects.toThrow("At least one file is required");
  });

  it("should reject more than 20 files", async () => {
    const files = Array.from({ length: 21 }, (_, i) => ({
      fileName: `file${i}.jpg`,
      fileType: "image/jpeg",
    }));
    await expect(generateUploadUrls(files)).rejects.toThrow("Maximum 20 files");
  });

  it("should accept PDF files", async () => {
    const result = await generateUploadUrls([
      { fileName: "document.pdf", fileType: "application/pdf" },
    ]);

    expect(result.uploads[0]!.fileType).toBe("application/pdf");
  });

  it("should generate unique keys per batch", async () => {
    const result1 = await generateUploadUrls([{ fileName: "a.jpg", fileType: "image/jpeg" }]);
    const result2 = await generateUploadUrls([{ fileName: "a.jpg", fileType: "image/jpeg" }]);

    expect(result1.batchId).not.toBe(result2.batchId);
    expect(result1.uploads[0]!.key).not.toBe(result2.uploads[0]!.key);
  });
});
