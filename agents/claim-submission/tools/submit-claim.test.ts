import { describe, it, expect, vi, beforeEach } from "vitest";

const mockMutate = vi.fn();

vi.mock("../../shared/graphql-client.ts", () => ({
  getClient: () => ({ mutate: mockMutate }),
}));

vi.mock("@papaya/graphql/sdk", () => ({
  graphql: (source: string) => source,
}));

import { submitClaimTool } from "./submit-claim.ts";

describe("submitClaimTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("definition", () => {
    it("should have correct name", () => {
      expect(submitClaimTool.name).toBe("submitClaim");
    });

    it("should mention uploadDocuments in description", () => {
      expect(submitClaimTool.description).toContain("uploadDocuments");
    });
  });

  describe("execute", () => {
    const baseParams = {
      insuredCertificateId: "cert-123",
      benefitType: "OutPatient",
      requestAmount: 150000,
      otp: "123456",
      recipient: "user@example.com",
    };

    it("should call submitClaimWithOtp mutation and return result", async () => {
      mockMutate.mockResolvedValue({
        data: {
          submitClaimWithOtp: {
            success: true,
            message: "Claim submitted",
            claimId: "claim-uuid-1",
            claim: { id: "claim-uuid-1", code: "RE-26-300001" },
          },
        },
      });

      const result = await submitClaimTool.execute("tool-1", baseParams);

      expect(mockMutate).toHaveBeenCalledTimes(1);
      const parsed = JSON.parse(result.content[0]!.text);
      expect(parsed.success).toBe(true);
      expect(parsed.claimId).toBe("claim-uuid-1");
      expect(parsed.claim.code).toBe("RE-26-300001");
    });

    it("should always set source to AGENT_CARE_APP", async () => {
      mockMutate.mockResolvedValue({
        data: { submitClaimWithOtp: { success: true, message: "ok", claimId: "c1", claim: null } },
      });

      await submitClaimTool.execute("tool-1", baseParams);

      const vars = mockMutate.mock.calls[0]![0].variables;
      expect(vars.source).toBe("AGENT_CARE_APP");
    });

    it("should round requestAmount to integer", async () => {
      mockMutate.mockResolvedValue({
        data: { submitClaimWithOtp: { success: true, message: "ok", claimId: "c1", claim: null } },
      });

      await submitClaimTool.execute("tool-1", {
        ...baseParams,
        requestAmount: 150000.75,
      });

      const vars = mockMutate.mock.calls[0]![0].variables;
      expect(vars.requestAmount).toBe(150001);
    });

    it("should pass optional fields when provided", async () => {
      mockMutate.mockResolvedValue({
        data: { submitClaimWithOtp: { success: true, message: "ok", claimId: "c1", claim: null } },
      });

      await submitClaimTool.execute("tool-1", {
        ...baseParams,
        diagnosis: "Viêm họng",
        medicalProviderId: "mp-uuid",
        bankId: "bank-uuid",
        paymentAccountName: "NGUYEN VAN A",
        paymentAccountNumber: "123456789",
      });

      const vars = mockMutate.mock.calls[0]![0].variables;
      expect(vars.diagnosis).toBe("Viêm họng");
      expect(vars.medicalProviderId).toBe("mp-uuid");
      expect(vars.bankId).toBe("bank-uuid");
      expect(vars.paymentAccountName).toBe("NGUYEN VAN A");
    });

    it("should return error result on mutation failure", async () => {
      mockMutate.mockRejectedValue(new Error("Network error"));

      const result = await submitClaimTool.execute("tool-1", baseParams);

      expect(result.isError).toBe(true);
      expect(result.content[0]!.text).toContain("Network error");
    });

    it("should include claimId and claimCode in details on success", async () => {
      mockMutate.mockResolvedValue({
        data: {
          submitClaimWithOtp: {
            success: true,
            message: "ok",
            claimId: "claim-uuid-1",
            claim: { id: "claim-uuid-1", code: "RE-26-300001" },
          },
        },
      });

      const result = await submitClaimTool.execute("tool-1", baseParams);

      expect(result.details).toEqual({
        success: true,
        claimId: "claim-uuid-1",
        claimCode: "RE-26-300001",
      });
    });
  });
});
