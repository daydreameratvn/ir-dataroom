import { describe, it, expect } from "vitest";
import { DOCUMENT_COMPLIANCE_RULES } from "./document-compliance-healthcare.ts";

describe("DOCUMENT_COMPLIANCE_RULES", () => {
  describe("structure", () => {
    it("should export a non-empty string", () => {
      expect(typeof DOCUMENT_COMPLIANCE_RULES).toBe("string");
      expect(DOCUMENT_COMPLIANCE_RULES.length).toBeGreaterThan(0);
    });

    it("should contain all 7 parts of the compliance ruleset", () => {
      for (let i = 1; i <= 7; i++) {
        expect(DOCUMENT_COMPLIANCE_RULES).toContain(`PHẦN ${i}:`);
      }
    });
  });

  describe("document codes", () => {
    it.each([
      "GYC", "HĐ GTGT", "BKCT", "DTHUOC", "BCYTE", "PCĐ", "KQXN",
      "GTTHAN", "BB TTTN", "HDBL", "BCYTRV", "GRV", "GCNPT",
      "XQRANG", "PĐTNK", "GCSINH", "SKTHAI",
    ])("should contain document code %s", (code) => {
      expect(DOCUMENT_COMPLIANCE_RULES).toContain(code);
    });
  });

  describe("case types", () => {
    it.each([
      "Ngoại trú", "Nội trú", "Nha khoa",
      "Thai sản", "Tai nạn ngoại trú", "Tai nạn nội trú",
    ])("should contain case type %s", (caseType) => {
      expect(DOCUMENT_COMPLIANCE_RULES).toContain(caseType);
    });
  });

  describe("required sections", () => {
    it("should contain the document matrix (Phần 3)", () => {
      expect(DOCUMENT_COMPLIANCE_RULES).toContain("MA TRẬN CHỨNG TỪ BẮT BUỘC");
    });

    it("should contain per-document validation rules (Phần 4)", () => {
      expect(DOCUMENT_COMPLIANCE_RULES).toContain("QUY TẮC KIỂM TRA CHI TIẾT");
    });

    it("should contain cross-document consistency checks (Phần 5)", () => {
      expect(DOCUMENT_COMPLIANCE_RULES).toContain("KIỂM TRA CHÉO");
    });

    it("should contain supplementary request templates (Phần 6)", () => {
      expect(DOCUMENT_COMPLIANCE_RULES).toContain("YÊU CẦU BỔ SUNG");
    });

    it("should contain the workflow logic (Phần 7)", () => {
      expect(DOCUMENT_COMPLIANCE_RULES).toContain("LOGIC XỬ LÝ");
    });
  });
});
