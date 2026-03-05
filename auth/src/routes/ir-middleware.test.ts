/**
 * Integration test: verifies all IR admin endpoints are protected by auth middleware.
 *
 * If a new admin route is added without middleware, it will return 500 (crash)
 * instead of 401. This test catches that immediately.
 *
 * Requires the auth server to be running on localhost:4000.
 * Run: cd auth && bun test src/routes/ir-middleware.test.ts
 */
import { describe, test, expect } from "bun:test";

const BASE = "http://localhost:4000/auth";

// Every admin IR endpoint that should require authentication.
// Add new endpoints here as they are created.
const ADMIN_ENDPOINTS: [string, string][] = [
  ["GET", "/ir/rounds"],
  ["GET", "/ir/stats"],
  ["GET", "/ir/recent-activity"],
  ["GET", "/ir/investors"],
];

describe("IR admin routes require authentication", () => {
  for (const [method, path] of ADMIN_ENDPOINTS) {
    test(`${method} ${path} → 401 without auth (not 500)`, async () => {
      const res = await fetch(`${BASE}${path}`, {
        method,
        headers: { "Content-Type": "application/json" },
      });
      // Must be 401 (auth required), never 500 (crash from missing middleware)
      expect(res.status).toBe(401);
    });
  }

  test("unknown admin route → 401 (catch-all middleware)", async () => {
    const res = await fetch(`${BASE}/ir/does-not-exist-xyz`, {
      headers: { "Content-Type": "application/json" },
    });
    // The catch-all middleware should reject this before it even reaches a 404
    // It should return 401 because the wildcard middleware fires on /ir/*
    expect(res.status).toBe(401);
  });
});

describe("IR portal public routes remain accessible", () => {
  test("POST /ir/portal/otp/request → not 401", async () => {
    const res = await fetch(`${BASE}/ir/portal/otp/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "test@example.com" }),
    });
    // Should be 200 or 400, but NOT 401 (public endpoint)
    expect(res.status).not.toBe(401);
  });
});
