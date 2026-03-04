import { describe, test, expect } from "bun:test";
import { buildS3Key } from "./ir-s3.ts";

describe("buildS3Key", () => {
  test("builds correct key format", () => {
    expect(buildS3Key("tenant-1", "round-abc", "doc-123", "report.pdf")).toBe(
      "ir/tenant-1/round-abc/doc-123/report.pdf",
    );
  });

  test("handles UUIDs", () => {
    const key = buildS3Key(
      "550e8400-e29b-41d4-a716-446655440000",
      "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
      "6ba7b811-9dad-11d1-80b4-00c04fd430c8",
      "Q1 Financial Report.xlsx",
    );
    expect(key).toBe(
      "ir/550e8400-e29b-41d4-a716-446655440000/6ba7b810-9dad-11d1-80b4-00c04fd430c8/6ba7b811-9dad-11d1-80b4-00c04fd430c8/Q1 Financial Report.xlsx",
    );
  });

  test("handles special characters in filename", () => {
    const key = buildS3Key("t1", "r1", "d1", "file (1).pdf");
    expect(key).toBe("ir/t1/r1/d1/file (1).pdf");
  });

  test("handles empty segments", () => {
    const key = buildS3Key("", "", "", "");
    expect(key).toBe("ir////");
  });
});
