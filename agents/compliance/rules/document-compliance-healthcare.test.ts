import { describe, it, expect } from "vitest";
import { DOCUMENT_COMPLIANCE_RULES } from "./document-compliance-healthcare.ts";

describe("DOCUMENT_COMPLIANCE_RULES", () => {
  it("should export a non-empty string", () => {
    expect(typeof DOCUMENT_COMPLIANCE_RULES).toBe("string");
    expect(DOCUMENT_COMPLIANCE_RULES.length).toBeGreaterThan(0);
  });

  it("should contain all 7 parts", () => {
    expect(DOCUMENT_COMPLIANCE_RULES).toContain("PHẦN 1:");
    expect(DOCUMENT_COMPLIANCE_RULES).toContain("PHẦN 2:");
    expect(DOCUMENT_COMPLIANCE_RULES).toContain("PHẦN 3:");
    expect(DOCUMENT_COMPLIANCE_RULES).toContain("PHẦN 4:");
    expect(DOCUMENT_COMPLIANCE_RULES).toContain("PHẦN 5:");
    expect(DOCUMENT_COMPLIANCE_RULES).toContain("PHẦN 6:");
    expect(DOCUMENT_COMPLIANCE_RULES).toContain("PHẦN 7:");
  });

  it("should contain all document abbreviation codes", () => {
    const codes = [
      "GYC", "HĐ GTGT", "BKCT", "DTHUOC", "BCYTE", "PCĐ", "KQXN",
      "GTTHAN", "BB TTTN", "HDBL", "BCYTRV", "GRV", "GCNPT",
      "XQRANG", "PĐTNK", "GCSINH", "SKTHAI",
    ];
    for (const code of codes) {
      expect(DOCUMENT_COMPLIANCE_RULES).toContain(code);
    }
  });

  it("should contain all case type identifiers", () => {
    const caseTypes = [
      "Ngoại trú", "Nội trú", "Nha khoa",
      "Thai sản", "Tai nạn ngoại trú", "Tai nạn nội trú",
    ];
    for (const caseType of caseTypes) {
      expect(DOCUMENT_COMPLIANCE_RULES).toContain(caseType);
    }
  });
});
