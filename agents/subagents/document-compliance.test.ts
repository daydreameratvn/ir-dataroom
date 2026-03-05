import { describe, it, expect, vi } from "vitest";

vi.mock("../shared/tools/index.ts", () => ({
  runComplianceCheckTool: { name: "runComplianceCheck" },
  findSimilarApprovedClaimsTool: { name: "findSimilarApprovedClaims" },
  getComplianceRuleTool: { name: "getComplianceRule" },
  saveComplianceRuleTool: { name: "saveComplianceRule" },
  claimTool: { name: "claim" },
  insuredTool: { name: "insured" },
}));

import { createDocumentComplianceDefinition } from "./document-compliance.ts";

describe("createDocumentComplianceDefinition", () => {
  describe("returned definition structure", () => {
    it("should have name 'document-compliance'", () => {
      const def = createDocumentComplianceDefinition("RE-XX-123456");
      expect(def.name).toBe("document-compliance");
    });

    it("should have a non-empty description", () => {
      const def = createDocumentComplianceDefinition("RE-XX-123456");
      expect(def.description.length).toBeGreaterThan(0);
    });

    it("should use medium thinking level", () => {
      const def = createDocumentComplianceDefinition("RE-XX-123456");
      expect(def.thinking).toBe("medium");
    });

    it("should include exactly 6 tools", () => {
      const def = createDocumentComplianceDefinition("RE-XX-123456");
      expect(def.tools).toHaveLength(6);
    });
  });

  describe("system prompt", () => {
    it("should embed the claim code", () => {
      const def = createDocumentComplianceDefinition("RE-AB-999999");
      expect(def.systemPrompt).toContain("RE-AB-999999");
    });

    it("should embed different claim codes for different inputs", () => {
      const def1 = createDocumentComplianceDefinition("RE-AA-111111");
      const def2 = createDocumentComplianceDefinition("RE-BB-222222");
      expect(def1.systemPrompt).toContain("RE-AA-111111");
      expect(def1.systemPrompt).not.toContain("RE-BB-222222");
      expect(def2.systemPrompt).toContain("RE-BB-222222");
    });

    it("should include the 7-part compliance rules", () => {
      const def = createDocumentComplianceDefinition("RE-XX-000001");
      expect(def.systemPrompt).toContain("PHẦN 1:");
      expect(def.systemPrompt).toContain("PHẦN 7:");
    });

    it("should include the agent role and mission", () => {
      const def = createDocumentComplianceDefinition("RE-XX-000001");
      expect(def.systemPrompt).toContain("Role");
      expect(def.systemPrompt).toContain("Mission");
    });
  });

  describe("tools", () => {
    it.each([
      "runComplianceCheck",
      "findSimilarApprovedClaims",
      "getComplianceRule",
      "saveComplianceRule",
      "claim",
      "insured",
    ])("should include tool %s", (toolName) => {
      const def = createDocumentComplianceDefinition("RE-XX-000001");
      const names = def.tools.map((t) => t.name);
      expect(names).toContain(toolName);
    });
  });
});
