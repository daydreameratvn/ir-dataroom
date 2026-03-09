import { describe, it, expect, vi, beforeEach } from "vitest";

const mockQuery = vi.fn();

vi.mock("../../shared/graphql-client.ts", () => ({
  getClient: () => ({ query: mockQuery }),
}));

vi.mock("@papaya/graphql/sdk", () => ({
  graphql: (source: string) => source,
}));

import { findInsuredTool } from "./find-insured.ts";

describe("findInsuredTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("definition", () => {
    it("should have correct name and description", () => {
      expect(findInsuredTool.name).toBe("findInsured");
      expect(findInsuredTool.description).toContain("insured persons");
    });

    it("should define name, phone, and paper_id parameters", () => {
      const schema = findInsuredTool.parameters as any;
      expect(schema.properties.name).toBeDefined();
      expect(schema.properties.phone).toBeDefined();
      expect(schema.properties.paper_id).toBeDefined();
    });
  });

  describe("execute", () => {
    it("should return error when no search parameters provided", async () => {
      const result = await findInsuredTool.execute("tool-1", {});

      expect(result.isError).toBe(true);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it("should search by name using _ilike", async () => {
      mockQuery.mockResolvedValue({
        data: { insured_persons: [{ id: "p1", name: "Nguyen Van A" }] },
      });

      const result = await findInsuredTool.execute("tool-1", { name: "Nguyen" });

      expect(mockQuery).toHaveBeenCalledTimes(1);
      const vars = mockQuery.mock.calls[0]![0].variables;
      expect(vars.where._or).toEqual([{ name: { _ilike: "%Nguyen%" } }]);
      expect(vars.where.deleted_at).toEqual({ _is_null: true });
    });

    it("should search by phone using _eq", async () => {
      mockQuery.mockResolvedValue({
        data: { insured_persons: [{ id: "p1", phone: "0901234567" }] },
      });

      await findInsuredTool.execute("tool-1", { phone: "0901234567" });

      const vars = mockQuery.mock.calls[0]![0].variables;
      expect(vars.where._or).toEqual([{ phone: { _eq: "0901234567" } }]);
    });

    it("should search by paper_id using _eq", async () => {
      mockQuery.mockResolvedValue({
        data: { insured_persons: [{ id: "p1", paper_id: "079123456789" }] },
      });

      await findInsuredTool.execute("tool-1", { paper_id: "079123456789" });

      const vars = mockQuery.mock.calls[0]![0].variables;
      expect(vars.where._or).toEqual([{ paper_id: { _eq: "079123456789" } }]);
    });

    it("should combine multiple search criteria with _or", async () => {
      mockQuery.mockResolvedValue({
        data: { insured_persons: [] },
      });

      await findInsuredTool.execute("tool-1", {
        name: "Nguyen",
        phone: "0901234567",
      });

      const vars = mockQuery.mock.calls[0]![0].variables;
      expect(vars.where._or).toHaveLength(2);
      expect(vars.where._or[0]).toEqual({ name: { _ilike: "%Nguyen%" } });
      expect(vars.where._or[1]).toEqual({ phone: { _eq: "0901234567" } });
    });

    it("should return match count in details", async () => {
      mockQuery.mockResolvedValue({
        data: { insured_persons: [{ id: "p1" }, { id: "p2" }] },
      });

      const result = await findInsuredTool.execute("tool-1", { name: "Nguyen" });

      expect(result.details).toEqual({ matchCount: 2 });
    });
  });
});
