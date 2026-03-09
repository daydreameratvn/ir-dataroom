import { describe, it, expect, vi, beforeEach } from "vitest";
import type { DocumentForensicsResult } from "../document-forensics/types.ts";

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockGqlQuery = vi.fn();
vi.mock("../shared/graphql-client.ts", () => ({
  gqlQuery: (...args: any[]) => mockGqlQuery(...args),
}));

const mockMergeExtractedData = vi.fn().mockResolvedValue(undefined);
const mockParseExtractedData = vi.fn();
const mockGetExtractedField = vi.fn();
vi.mock("../portal-extraction/tools/claims.ts", () => ({
  mergeExtractedData: (...args: any[]) => mockMergeExtractedData(...args),
  parseExtractedData: (...args: any[]) => mockParseExtractedData(...args),
  getExtractedField: (...args: any[]) => mockGetExtractedField(...args),
}));

const mockCallForensicsApi = vi.fn();
vi.mock("./tools/image-forensics.ts", () => ({
  callForensicsApi: (...args: any[]) => mockCallForensicsApi(...args),
}));

const mockS3Send = vi.fn();
vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: class MockS3Client {
    send = mockS3Send;
  },
  GetObjectCommand: class MockGetObjectCommand {
    constructor(public params: any) {}
  },
}));

import { createPortalAgent } from "./agent.ts";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeForensicsResult(overrides: Partial<DocumentForensicsResult> = {}): DocumentForensicsResult {
  return {
    success: true,
    method: "advanced_document_forensics",
    ocr_engine: "easyocr",
    device: "cpu",
    verdict: "NORMAL",
    overall_score: 0.15,
    risk_level: "low",
    trufor: { global_score: 0.15, detection_score: 0.1 },
    image: { path: "/tmp/test.jpg", width: 800, height: 600 },
    ocr_analysis: { total_fields: 3, field_types_found: ["patient_name", "amount", "date"] },
    highest_risk_field: null,
    fields: [],
    visualization_path: null,
    heatmap_b64: null,
    notes: [],
    ...overrides,
  };
}

function mockS3Download(content: string = "fake-image-bytes") {
  mockS3Send.mockResolvedValue({
    Body: {
      transformToByteArray: () => Promise.resolve(Buffer.from(content)),
    },
    ContentType: "image/jpeg",
  });
}

function setupClaimWithDocuments(
  classifiedDocs: any[] = [{ type: "Bill", pageNumbers: [1], summary: "Hospital bill" }],
  claimDocs: any[] = [{ id: "doc1", documentType: "Bill", fileName: "bill.jpg", fileUrl: "https://s3.amazonaws.com/bucket/bill.jpg" }],
) {
  mockGqlQuery.mockResolvedValue({
    claimsById: {
      id: "claim-123",
      claimNumber: "CLM-001",
      aiSummary: "{}",
      claimDocuments: claimDocs,
    },
  });
  mockParseExtractedData.mockReturnValue({ extraction: { classifiedDocuments: classifiedDocs } });
  mockGetExtractedField.mockReturnValue(classifiedDocs);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("portal-image-forensics agent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should call forensics API for each image document and save results", async () => {
    setupClaimWithDocuments();
    mockS3Download();
    mockCallForensicsApi.mockResolvedValue(makeForensicsResult());

    const agent = await createPortalAgent("claim-123");
    const events: any[] = [];
    agent.subscribe((e: any) => events.push(e));

    await agent.prompt("Process claim claim-123");
    await agent.waitForIdle();

    // Verify forensics API was called
    expect(mockCallForensicsApi).toHaveBeenCalledTimes(1);
    expect(mockCallForensicsApi).toHaveBeenCalledWith(
      expect.any(String), // base64 image
      "TH", // default market
    );

    // Verify results were saved
    expect(mockMergeExtractedData).toHaveBeenCalledWith(
      "claim-123",
      expect.objectContaining({
        overallVerdict: "AUTHENTIC",
        documentFindings: expect.arrayContaining([
          expect.objectContaining({
            documentType: "Bill",
            verdict: "AUTHENTIC",
          }),
        ]),
      }),
      "imageForensics",
    );
  });

  it("should map NORMAL verdict to AUTHENTIC", async () => {
    setupClaimWithDocuments();
    mockS3Download();
    mockCallForensicsApi.mockResolvedValue(makeForensicsResult({ verdict: "NORMAL" }));

    const agent = await createPortalAgent("claim-123");
    await agent.prompt("Process");
    await agent.waitForIdle();

    const savedResult = mockMergeExtractedData.mock.calls[0][1];
    expect(savedResult.overallVerdict).toBe("AUTHENTIC");
    expect(savedResult.documentFindings[0].verdict).toBe("AUTHENTIC");
  });

  it("should map SUSPICIOUS verdict correctly", async () => {
    setupClaimWithDocuments();
    mockS3Download();
    mockCallForensicsApi.mockResolvedValue(makeForensicsResult({
      verdict: "SUSPICIOUS",
      overall_score: 0.65,
      fields: [
        {
          type: "amount",
          risk_weight: 0.8,
          text: "50,000 THB",
          confidence: 0.9,
          bbox: { x: 10, y: 20, width: 100, height: 30 },
          scores: { anomaly: 0.7, heatmap_mean: 0.4, heatmap_max: 0.8 },
        },
      ],
    }));

    const agent = await createPortalAgent("claim-123");
    await agent.prompt("Process");
    await agent.waitForIdle();

    const savedResult = mockMergeExtractedData.mock.calls[0][1];
    expect(savedResult.overallVerdict).toBe("SUSPICIOUS");
    expect(savedResult.documentFindings[0].anomalies.length).toBeGreaterThan(0);
    expect(savedResult.documentFindings[0].anomalies[0].severity).toBe("HIGH");
  });

  it("should map TAMPERED verdict correctly", async () => {
    setupClaimWithDocuments();
    mockS3Download();
    mockCallForensicsApi.mockResolvedValue(makeForensicsResult({ verdict: "TAMPERED", overall_score: 0.9 }));

    const agent = await createPortalAgent("claim-123");
    await agent.prompt("Process");
    await agent.waitForIdle();

    const savedResult = mockMergeExtractedData.mock.calls[0][1];
    expect(savedResult.overallVerdict).toBe("TAMPERED");
    expect(savedResult.confidenceScore).toBe(10); // (1 - 0.9) * 100
  });

  it("should compute confidence as inverted overall_score", async () => {
    setupClaimWithDocuments();
    mockS3Download();
    mockCallForensicsApi.mockResolvedValue(makeForensicsResult({ overall_score: 0.3 }));

    const agent = await createPortalAgent("claim-123");
    await agent.prompt("Process");
    await agent.waitForIdle();

    const savedResult = mockMergeExtractedData.mock.calls[0][1];
    expect(savedResult.confidenceScore).toBe(70); // (1 - 0.3) * 100
  });

  it("should skip non-image documents", async () => {
    setupClaimWithDocuments(
      [{ type: "Bill", pageNumbers: [1], summary: "Hospital bill" }],
      [{ id: "doc1", documentType: "Bill", fileName: "bill.pdf", fileUrl: "https://s3.amazonaws.com/bucket/bill.pdf" }],
    );

    const agent = await createPortalAgent("claim-123");
    await agent.prompt("Process");
    await agent.waitForIdle();

    // Should not call forensics API for PDFs
    expect(mockCallForensicsApi).not.toHaveBeenCalled();

    // Should still save a result (empty findings)
    expect(mockMergeExtractedData).toHaveBeenCalledWith(
      "claim-123",
      expect.objectContaining({
        overallVerdict: "AUTHENTIC",
        totalDocumentsAnalyzed: 0,
      }),
      "imageForensics",
    );
  });

  it("should handle claim not found", async () => {
    mockGqlQuery.mockResolvedValue({ claimsById: null });

    const agent = await createPortalAgent("bad-claim");

    await agent.prompt("Process");
    await expect(agent.waitForIdle()).rejects.toThrow("not found");

    // Should save fallback result on error
    expect(mockMergeExtractedData).toHaveBeenCalledWith(
      "bad-claim",
      expect.objectContaining({
        overallVerdict: "AUTHENTIC",
        confidenceScore: 0,
        summary: expect.stringContaining("failed"),
      }),
      "imageForensics",
    );
  });

  it("should handle forensics API error gracefully and continue with other documents", async () => {
    setupClaimWithDocuments(
      [
        { type: "Bill", pageNumbers: [1], summary: "Bill" },
        { type: "Receipt", pageNumbers: [2], summary: "Receipt" },
      ],
      [
        { id: "doc1", documentType: "Bill", fileName: "bill.jpg", fileUrl: "https://s3.amazonaws.com/bucket/bill.jpg" },
        { id: "doc2", documentType: "Receipt", fileName: "receipt.jpg", fileUrl: "https://s3.amazonaws.com/bucket/receipt.jpg" },
      ],
    );
    mockS3Download();

    // First call fails, second succeeds
    mockCallForensicsApi
      .mockRejectedValueOnce(new Error("Service unavailable"))
      .mockResolvedValueOnce(makeForensicsResult());

    const agent = await createPortalAgent("claim-123");
    await agent.prompt("Process");
    await agent.waitForIdle();

    expect(mockCallForensicsApi).toHaveBeenCalledTimes(2);

    const savedResult = mockMergeExtractedData.mock.calls[0][1];
    expect(savedResult.totalDocumentsAnalyzed).toBe(1); // Only 1 succeeded
    expect(savedResult.documentFindings).toHaveLength(1);
    expect(savedResult.documentFindings[0].documentType).toBe("Receipt");
  });

  it("should emit correct events for pipeline status tracking", async () => {
    setupClaimWithDocuments();
    mockS3Download();
    mockCallForensicsApi.mockResolvedValue(makeForensicsResult());

    const agent = await createPortalAgent("claim-123");
    const events: any[] = [];
    agent.subscribe((e: any) => events.push(e));

    await agent.prompt("Process");
    await agent.waitForIdle();

    const eventTypes = events.map(e => e.type);
    expect(eventTypes).toContain("agent_start");
    expect(eventTypes).toContain("tool_execution_start");
    expect(eventTypes).toContain("tool_execution_end");
    expect(eventTypes).toContain("agent_end");

    // Verify toolName is emitted (used by pipeline orchestrator)
    const toolStartEvents = events.filter(e => e.type === "tool_execution_start");
    expect(toolStartEvents.some(e => e.toolName === "fetch_documents_for_analysis")).toBe(true);
    expect(toolStartEvents.some(e => e.toolName === "save_image_forensics_result")).toBe(true);
  });

  it("should include heatmap in report markdown", async () => {
    setupClaimWithDocuments();
    mockS3Download();
    mockCallForensicsApi.mockResolvedValue(makeForensicsResult({
      heatmap_b64: "base64EncodedHeatmapData",
    }));

    const agent = await createPortalAgent("claim-123");
    await agent.prompt("Process");
    await agent.waitForIdle();

    const savedResult = mockMergeExtractedData.mock.calls[0][1];
    expect(savedResult.reportMarkdown).toContain("base64EncodedHeatmapData");
    expect(savedResult.reportMarkdown).toContain("data:image/jpeg;base64,");
  });

  it("should extract anomalies from fields with high anomaly scores", async () => {
    setupClaimWithDocuments();
    mockS3Download();
    mockCallForensicsApi.mockResolvedValue(makeForensicsResult({
      verdict: "SUSPICIOUS",
      fields: [
        {
          type: "amount",
          risk_weight: 0.8,
          text: "50,000",
          confidence: 0.95,
          bbox: { x: 100, y: 200, width: 150, height: 30 },
          scores: { anomaly: 0.8, heatmap_mean: 0.5, heatmap_max: 0.9 },
        },
        {
          type: "date",
          risk_weight: 0.3,
          text: "2024-01-15",
          confidence: 0.99,
          bbox: null,
          scores: { anomaly: 0.1, heatmap_mean: 0.05, heatmap_max: 0.1 },
        },
      ],
    }));

    const agent = await createPortalAgent("claim-123");
    await agent.prompt("Process");
    await agent.waitForIdle();

    const savedResult = mockMergeExtractedData.mock.calls[0][1];
    const finding = savedResult.documentFindings[0];

    // Only the amount field (anomaly 0.8 >= 0.3) should be an anomaly
    expect(finding.anomalies).toHaveLength(1);
    expect(finding.anomalies[0].type).toBe("amount");
    expect(finding.anomalies[0].severity).toBe("HIGH"); // 0.8 >= 0.7
  });
});
