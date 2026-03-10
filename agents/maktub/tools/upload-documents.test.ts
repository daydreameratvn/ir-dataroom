import { describe, it, expect, vi, beforeEach } from "vitest";

const mockMutate = vi.fn();

vi.mock("../../shared/graphql-client.ts", () => ({
  getClient: () => ({ mutate: mockMutate }),
}));

vi.mock("@papaya/graphql/sdk", () => ({
  graphql: (source: string) => source,
}));

import { createUploadDocumentsTool } from "./upload-documents.ts";
import type { DocumentInfo } from "./upload-documents.ts";

describe("createUploadDocumentsTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("factory", () => {
    it("should return a tool named uploadDocuments", () => {
      const tool = createUploadDocumentsTool([]);
      expect(tool.name).toBe("uploadDocuments");
    });

    it("should include document count in description", () => {
      const tool = createUploadDocumentsTool([
        { fileUrl: "https://s3/a.pdf", fileName: "a.pdf" },
        { fileUrl: "https://s3/b.pdf", fileName: "b.pdf" },
      ]);
      expect(tool.description).toContain("2 document(s)");
    });
  });

  describe("execute with no documents", () => {
    it("should return success with count 0", async () => {
      const tool = createUploadDocumentsTool([]);

      const result = await tool.execute("tool-1", { claimCaseId: "claim-1" });

      const parsed = JSON.parse(result.content[0]!.text);
      expect(parsed.success).toBe(true);
      expect(parsed.count).toBe(0);
      expect(mockMutate).not.toHaveBeenCalled();
    });
  });

  describe("execute with documents", () => {
    const docs: DocumentInfo[] = [
      {
        fileUrl: "https://s3.amazonaws.com/bucket/doc1.pdf",
        fileName: "prescription.pdf",
        fileType: "application/pdf",
        documentType: "Prescription",
        bucket: "banyan-portal-documents",
        key: "tenant/claim/doc1.pdf",
      },
      {
        fileUrl: "https://s3.amazonaws.com/bucket/doc2.jpg",
        fileName: "invoice.jpg",
        fileType: "image/jpeg",
        documentType: "Bill",
      },
    ];

    it("should insert one claim_document per document", async () => {
      mockMutate.mockResolvedValue({
        data: {
          insert_claim_documents_one: { id: "doc-uuid", claim_case_id: "claim-1", type: "Prescription", file: { id: "f1", url: "..." } },
        },
      });

      const tool = createUploadDocumentsTool(docs);
      await tool.execute("tool-1", { claimCaseId: "claim-1" });

      expect(mockMutate).toHaveBeenCalledTimes(2);
    });

    it("should pass claim_case_id and file data in mutation variables", async () => {
      mockMutate.mockResolvedValue({
        data: { insert_claim_documents_one: { id: "doc-uuid" } },
      });

      const tool = createUploadDocumentsTool([docs[0]!]);
      await tool.execute("tool-1", { claimCaseId: "claim-1" });

      const vars = mockMutate.mock.calls[0]![0].variables;
      expect(vars.input.claim_case_id).toBe("claim-1");
      expect(vars.input.type).toBe("Prescription");
      expect(vars.input.source).toBe("AGENT_CARE_APP");
      expect(vars.input.file.data.name).toBe("prescription.pdf");
      expect(vars.input.file.data.url).toBe("https://s3.amazonaws.com/bucket/doc1.pdf");
      expect(vars.input.file.data.bucket_name_v2).toBe("banyan-portal-documents");
      expect(vars.input.file.data.bucket_object_key).toBe("tenant/claim/doc1.pdf");
      expect(vars.input.file.data.mime_type).toBe("application/pdf");
    });

    it("should default documentType to Other when not provided", async () => {
      mockMutate.mockResolvedValue({
        data: { insert_claim_documents_one: { id: "doc-uuid" } },
      });

      const tool = createUploadDocumentsTool([
        { fileUrl: "https://s3/x.pdf", fileName: "x.pdf" },
      ]);
      await tool.execute("tool-1", { claimCaseId: "claim-1" });

      const vars = mockMutate.mock.calls[0]![0].variables;
      expect(vars.input.type).toBe("OtherPaper");
    });

    it("should report success count and total", async () => {
      mockMutate
        .mockResolvedValueOnce({
          data: { insert_claim_documents_one: { id: "d1" } },
        })
        .mockResolvedValueOnce({
          data: { insert_claim_documents_one: { id: "d2" } },
        });

      const tool = createUploadDocumentsTool(docs);
      const result = await tool.execute("tool-1", { claimCaseId: "claim-1" });

      const parsed = JSON.parse(result.content[0]!.text);
      expect(parsed.success).toBe(true);
      expect(parsed.totalUploaded).toBe(2);
      expect(parsed.total).toBe(2);
    });

    it("should handle partial failures gracefully", async () => {
      mockMutate
        .mockResolvedValueOnce({
          data: { insert_claim_documents_one: { id: "d1" } },
        })
        .mockRejectedValueOnce(new Error("DB constraint violation"));

      const tool = createUploadDocumentsTool(docs);
      const result = await tool.execute("tool-1", { claimCaseId: "claim-1" });

      const parsed = JSON.parse(result.content[0]!.text);
      expect(parsed.success).toBe(false);
      expect(parsed.totalUploaded).toBe(1);
      expect(parsed.total).toBe(2);
      expect(parsed.results[1].success).toBe(false);
      expect(parsed.results[1].error).toContain("DB constraint violation");
    });
  });
});
