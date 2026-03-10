import { describe, it, expect, vi, beforeEach } from "vitest";

const mockQuery = vi.fn();

vi.mock("../../shared/graphql-client.ts", () => ({
  getClient: () => ({ query: mockQuery }),
}));

vi.mock("@papaya/graphql/sdk", () => ({
  graphql: (source: string) => source,
}));

import { lastBankInfoTool } from "./last-bank-info.ts";

describe("lastBankInfoTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("definition", () => {
    it("should have correct name", () => {
      expect(lastBankInfoTool.name).toBe("lastBankInfo");
    });
  });

  describe("execute", () => {
    it("should return found=false when no beneficiary records exist", async () => {
      mockQuery.mockResolvedValue({
        data: { claim_case_beneficiaries: [] },
      });

      const result = await lastBankInfoTool.execute("tool-1", {
        insuredCertificateIds: ["cert-1"],
      });

      const parsed = JSON.parse(result.content[0]!.text);
      expect(parsed.found).toBe(false);
      expect(result.details).toEqual({ found: false });
    });

    it("should return bank info from the most recent beneficiary", async () => {
      mockQuery.mockResolvedValue({
        data: {
          claim_case_beneficiaries: [
            {
              id: "ben-1",
              bank_account_number: "123456789",
              bank_name: "Vietcombank",
              bank_id: "bank-uuid",
              bank_branch: "HCM",
              bank_city: "Ho Chi Minh",
              beneficiary_name: "NGUYEN VAN A",
              bank: {
                id: "bank-uuid",
                en_name: "Vietcombank",
                short_name: "VCB",
              },
            },
          ],
        },
      });

      const result = await lastBankInfoTool.execute("tool-1", {
        insuredCertificateIds: ["cert-1", "cert-2"],
      });

      const parsed = JSON.parse(result.content[0]!.text);
      expect(parsed.found).toBe(true);
      expect(parsed.bankId).toBe("bank-uuid");
      expect(parsed.bankName).toBe("Vietcombank");
      expect(parsed.accountNumber).toBe("123456789");
      expect(parsed.accountName).toBe("NGUYEN VAN A");
      expect(result.details).toEqual({ found: true });
    });

    it("should pass certificate IDs to the where clause", async () => {
      mockQuery.mockResolvedValue({
        data: { claim_case_beneficiaries: [] },
      });

      await lastBankInfoTool.execute("tool-1", {
        insuredCertificateIds: ["cert-a", "cert-b"],
      });

      const vars = mockQuery.mock.calls[0]![0].variables;
      expect(vars.certIds).toEqual(["cert-a", "cert-b"]);
    });
  });
});
