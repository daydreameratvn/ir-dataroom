/**
 * Safety test: ensures portal routes never return 403/404 status codes
 * or non-JSON responses.
 *
 * CloudFront customErrorResponses historically converted 403/404 API responses
 * to 200+HTML, crashing the frontend. Even though we've removed
 * customErrorResponses and replaced them with a CloudFront Function,
 * these tests ensure defense-in-depth — if infrastructure regresses,
 * portal routes still won't use interceptable status codes.
 *
 * Requires the auth server to be running on localhost:4000.
 * Run: cd auth && bun test src/routes/ir-portal-safety.test.ts
 */
import { readFileSync } from "fs";
import { join } from "path";
import { describe, test, expect } from "bun:test";

const BASE = "http://localhost:4000/auth";

// ═══════════════════════════════════════════════════════════════════
// 1. Integration tests — portal error responses are JSON, not 403/404
// ═══════════════════════════════════════════════════════════════════

describe("Portal routes never return 403 or 404", () => {
  // -- Public endpoints (no auth required) --

  test("POST /ir/portal/otp/request — missing email → 400 JSON", async () => {
    const res = await fetch(`${BASE}/ir/portal/otp/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    expect(res.headers.get("content-type")).toContain("application/json");
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  test("POST /ir/portal/otp/request — nonexistent email → 400 JSON with friendly error", async () => {
    const res = await fetch(`${BASE}/ir/portal/otp/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "nonexistent@safety-test.com" }),
    });
    // Should return 400 (not found) or 503 if DB is down — never 403/404
    expect([400, 503]).toContain(res.status);
    expect(res.status).not.toBe(403);
    expect(res.status).not.toBe(404);
    expect(res.headers.get("content-type")).toContain("application/json");
    if (res.status === 400) {
      const body = await res.json();
      // Error should contain a contact email (not hardcoded to a specific person)
      expect(body.error).toMatch(/@papaya\.asia/);
    }
  });

  test("POST /ir/portal/otp/verify — missing fields → 400 JSON", async () => {
    const res = await fetch(`${BASE}/ir/portal/otp/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    expect(res.headers.get("content-type")).toContain("application/json");
    const body = await res.json();
    expect(body.error).toContain("required");
  });

  test("POST /ir/portal/otp/verify — bad code → not 403/404, is JSON", async () => {
    const res = await fetch(`${BASE}/ir/portal/otp/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "test@safety-test.com", code: "000000" }),
    });
    // Could be 401 (invalid OTP), 400 (investor not found), 422 (no rounds), or 503 (DB)
    expect(res.status).not.toBe(403);
    expect(res.status).not.toBe(404);
    expect(res.headers.get("content-type")).toContain("application/json");
    await res.json(); // Must parse as JSON
  });

  test("POST /ir/portal/token/refresh — no auth → 401 JSON", async () => {
    const res = await fetch(`${BASE}/ir/portal/token/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(401);
    expect(res.status).not.toBe(403);
    expect(res.status).not.toBe(404);
    expect(res.headers.get("content-type")).toContain("application/json");
  });

  // -- Protected endpoints (require investor JWT) --
  // Without a token, these should return 401 (middleware rejection), never 403/404

  const PROTECTED_ENDPOINTS: [string, string][] = [
    ["GET",  "/ir/portal/rounds"],
    ["GET",  "/ir/portal/rounds/test-slug"],
    ["POST", "/ir/portal/rounds/test-slug/nda/accept"],
    ["GET",  "/ir/portal/rounds/test-slug/documents"],
    ["GET",  "/ir/portal/rounds/test-slug/documents/fake-id/view"],
    ["GET",  "/ir/portal/rounds/test-slug/documents/fake-id/download"],
    ["POST", "/ir/portal/tracking"],
    ["GET",  "/ir/portal/rounds/test-slug/nda/download"],
  ];

  for (const [method, path] of PROTECTED_ENDPOINTS) {
    test(`${method} ${path} — no auth → 401 JSON (not 403/404)`, async () => {
      const res = await fetch(`${BASE}${path}`, {
        method,
        headers: { "Content-Type": "application/json" },
        ...(method === "POST" ? { body: JSON.stringify({}) } : {}),
      });
      expect(res.status).toBe(401);
      expect(res.status).not.toBe(403);
      expect(res.status).not.toBe(404);
      expect(res.headers.get("content-type")).toContain("application/json");
    });
  }
});

// ═══════════════════════════════════════════════════════════════════
// 2. Static analysis — source code guard against 403/404 in portal
// ═══════════════════════════════════════════════════════════════════

describe("ir.ts source code safety", () => {
  const source = readFileSync(join(__dirname, "ir.ts"), "utf-8");

  test("portal routes do not use 403 or 404 status codes", () => {
    // Extract the portal section (from first "/ir/portal/" to end of file)
    const portalStart = source.indexOf('"/ir/portal/');
    expect(portalStart).toBeGreaterThan(0); // Sanity: portal section exists

    const portalSection = source.slice(portalStart);

    // Match patterns like: , 403) or , 404)  — i.e. status code arguments
    const forbidden = portalSection.match(/,\s*(403|404)\s*\)/g);
    if (forbidden) {
      // Find line numbers for better error messages
      const lines = source.split("\n");
      const violations: string[] = [];
      for (let i = 0; i < lines.length; i++) {
        if (i >= source.slice(0, portalStart).split("\n").length - 1) {
          if (/,\s*(403|404)\s*\)/.test(lines[i])) {
            violations.push(`  Line ${i + 1}: ${lines[i].trim()}`);
          }
        }
      }
      throw new Error(
        `Found 403/404 status codes in portal routes — these are intercepted by CloudFront.\n` +
        `Use 400 (not found) or 422 (business logic denial) instead.\n\n` +
        `Violations:\n${violations.join("\n")}`
      );
    }
  });

  test("portal section exists and has expected routes", () => {
    // Sanity check: make sure we're actually scanning the right section
    expect(source).toContain("/ir/portal/otp/request");
    expect(source).toContain("/ir/portal/otp/verify");
    expect(source).toContain("/ir/portal/rounds");
    expect(source).toContain("/ir/portal/rounds/:slug/documents");
    expect(source).toContain("/ir/portal/rounds/:slug/nda/download");
  });
});
