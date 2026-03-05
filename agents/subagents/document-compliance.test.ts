import { describe, it, expect, vi } from "vitest";

// Mock shared tools to avoid loading real tool implementations
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
  it("should return a valid SubAgentDefinition", () => {
    const def = createDocumentComplianceDefinition("RE-XX-123456");

    expect(def.name).toBe("document-compliance");
    expect(def.description).toBeTruthy();
    expect(def.thinking).toBe("medium");
    expect(def.tools).toHaveLength(6);
    expect(def.systemPrompt).toBeTruthy();
  });

  it("should embed the claim code in the system prompt", () => {
    const claimCode = "RE-AB-999999";
    const def = createDocumentComplianceDefinition(claimCode);

    expect(def.systemPrompt).toContain(claimCode);
  });

  it("should include the compliance rules in the system prompt", () => {
    const def = createDocumentComplianceDefinition("RE-XX-000001");

    expect(def.systemPrompt).toContain("PHẦN 1:");
    expect(def.systemPrompt).toContain("PHẦN 7:");
  });

  it("should include all required tools", () => {
    const def = createDocumentComplianceDefinition("RE-XX-000001");
    const toolNames = def.tools.map((t) => t.name);

    expect(toolNames).toContain("runComplianceCheck");
    expect(toolNames).toContain("findSimilarApprovedClaims");
    expect(toolNames).toContain("getComplianceRule");
    expect(toolNames).toContain("saveComplianceRule");
    expect(toolNames).toContain("claim");
    expect(toolNames).toContain("insured");
  });
});
