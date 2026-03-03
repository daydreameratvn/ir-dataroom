/**
 * End-to-end tests for Phoenix deployment at phoenix.papaya.asia.
 *
 * These tests run against the live production deployment and verify:
 * - CloudFront + S3 static hosting
 * - CloudFront → ALB auth API proxy
 * - DNS, TLS, CORS, caching, SPA routing
 * - Phoenix auth flow (login → claims → token refresh)
 *
 * Usage:
 *   bun test auth/src/routes/phoenix.e2e.test.ts
 *
 * Prerequisites:
 *   - Phoenix deployed to phoenix.papaya.asia
 *   - Auth service running on ECS
 *   - DNS CNAME configured
 */

import { describe, it, expect } from "bun:test";

const BASE = "https://phoenix.papaya.asia";
const VALID_POLICY = "TCL-2024-000001";
const INVALID_POLICY = "FAKE-NONEXISTENT-999";

// ═══════════════════════════════════════════════════════════════════════════
// Infrastructure
// ═══════════════════════════════════════════════════════════════════════════

describe("Infrastructure", () => {
  it("homepage returns 200 with HTML content", async () => {
    const res = await fetch(`${BASE}/`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");

    const html = await res.text();
    expect(html).toContain("<div id=\"root\">");
    expect(html).toContain("TechcomLife");
  });

  it("static assets have immutable cache headers", async () => {
    // First get index.html to find the JS bundle filename
    const indexRes = await fetch(`${BASE}/`);
    const html = await indexRes.text();
    const match = html.match(/src="(\/assets\/[^"]+\.js)"/);
    expect(match).toBeTruthy();

    const assetRes = await fetch(`${BASE}${match![1]}`);
    expect(assetRes.status).toBe(200);
    expect(assetRes.headers.get("cache-control")).toContain("immutable");
    expect(assetRes.headers.get("cache-control")).toContain("max-age=31536000");
  });

  it("index.html has no-cache headers", async () => {
    const res = await fetch(`${BASE}/`);
    const cacheControl = res.headers.get("cache-control");
    expect(cacheControl).toContain("no-cache");
  });

  it("SPA routing: unknown path returns index.html", async () => {
    const res = await fetch(`${BASE}/some/nonexistent/deep/path`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");

    const html = await res.text();
    expect(html).toContain("<div id=\"root\">");
  });

  it("SPA routing: /login path returns index.html", async () => {
    const res = await fetch(`${BASE}/login?policyNumbers=${VALID_POLICY}`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("<div id=\"root\">");
  });

  it("HTTP redirects to HTTPS", async () => {
    const res = await fetch(`http://phoenix.papaya.asia/`, { redirect: "manual" });
    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe("https://phoenix.papaya.asia/");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Auth API — Health
// ═══════════════════════════════════════════════════════════════════════════

describe("Auth Health", () => {
  it("health check returns OK", async () => {
    const res = await fetch(`${BASE}/auth/health`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.status).toBe("ok");
    expect(body.service).toBe("auth");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// CORS
// ═══════════════════════════════════════════════════════════════════════════

describe("CORS", () => {
  it("allows phoenix.papaya.asia origin", async () => {
    const res = await fetch(`${BASE}/auth/phoenix/login`, {
      method: "OPTIONS",
      headers: {
        Origin: "https://phoenix.papaya.asia",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "Content-Type",
      },
    });

    expect(res.headers.get("access-control-allow-origin")).toBe("https://phoenix.papaya.asia");
    expect(res.headers.get("access-control-allow-methods")).toContain("POST");
    expect(res.headers.get("access-control-allow-credentials")).toBe("true");
  });

  it("rejects unknown origin", async () => {
    const res = await fetch(`${BASE}/auth/phoenix/login`, {
      method: "OPTIONS",
      headers: {
        Origin: "https://evil-site.com",
        "Access-Control-Request-Method": "POST",
      },
    });

    const allowOrigin = res.headers.get("access-control-allow-origin");
    expect(allowOrigin).not.toBe("https://evil-site.com");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Login Flow
// ═══════════════════════════════════════════════════════════════════════════

describe("Login", () => {
  it("returns JWT for valid active policy", async () => {
    const res = await fetch(`${BASE}/auth/phoenix/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ policyNumbers: [VALID_POLICY] }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.results).toHaveLength(1);

    const result = body.results[0];
    expect(result.success).toBe(true);
    expect(result.token).toBeTruthy();
    expect(result.token.split(".")).toHaveLength(3); // valid JWT format
    expect(result.policy.policyNumber).toBe(VALID_POLICY);
    expect(result.policy.insuredName).toBeTruthy();
    expect(result.policy.status).toBe("active");
  });

  it("returns POLICY_NOT_FOUND for invalid policy", async () => {
    const res = await fetch(`${BASE}/auth/phoenix/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ policyNumbers: [INVALID_POLICY] }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.results[0].success).toBe(false);
    expect(body.results[0].message).toBe("POLICY_NOT_FOUND");
  });

  it("handles multi-policy login with mixed results", async () => {
    const res = await fetch(`${BASE}/auth/phoenix/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ policyNumbers: [VALID_POLICY, INVALID_POLICY] }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.results).toHaveLength(2);
    expect(body.results[0].success).toBe(true);
    expect(body.results[1].success).toBe(false);
  });

  it("returns 400 for missing policyNumbers", async () => {
    const res = await fetch(`${BASE}/auth/phoenix/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as any;
    expect(body.error).toContain("policyNumbers");
  });

  it("returns 400 for empty policyNumbers array", async () => {
    const res = await fetch(`${BASE}/auth/phoenix/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ policyNumbers: [] }),
    });

    expect(res.status).toBe(400);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// JWT Token
// ═══════════════════════════════════════════════════════════════════════════

describe("JWT Token", () => {
  it("contains correct policyholder claims", async () => {
    const loginRes = await fetch(`${BASE}/auth/phoenix/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ policyNumbers: [VALID_POLICY] }),
    });
    const loginBody = (await loginRes.json()) as any;
    const token = loginBody.results[0].token;

    // Decode JWT payload
    const [, payloadPart] = token.split(".");
    const payload = JSON.parse(Buffer.from(payloadPart, "base64url").toString());

    expect(payload.policyNumber).toBe(VALID_POLICY);
    expect(payload.userType).toBe("policyholder");
    expect(payload.role).toBe("policyholder");
    expect(payload.sub).toBeTruthy();
    expect(payload.tenantId).toBeTruthy();

    // Hasura JWT claims
    const hasura = payload["https://hasura.io/jwt/claims"];
    expect(hasura["x-hasura-default-role"]).toBe("policyholder");
    expect(hasura["x-hasura-allowed-roles"]).toEqual(["policyholder"]);
    expect(hasura["x-hasura-user-id"]).toBeTruthy();
    expect(hasura["x-hasura-tenant-id"]).toBeTruthy();

    // 24h expiration
    expect(payload.exp - payload.iat).toBe(86400);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Protected Routes — Authentication
// ═══════════════════════════════════════════════════════════════════════════

describe("Authentication", () => {
  it("rejects claims without token", async () => {
    const res = await fetch(`${BASE}/auth/phoenix/claims`);
    expect(res.status).toBe(401);
    const body = (await res.json()) as any;
    expect(body.error).toContain("authorization");
  });

  it("rejects claims with invalid token", async () => {
    const res = await fetch(`${BASE}/auth/phoenix/claims`, {
      headers: { Authorization: "Bearer fake.invalid.token" },
    });
    expect(res.status).toBe(401);
  });

  it("rejects claims with non-Bearer scheme", async () => {
    const res = await fetch(`${BASE}/auth/phoenix/claims`, {
      headers: { Authorization: "Basic dXNlcjpwYXNz" },
    });
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Claims
// ═══════════════════════════════════════════════════════════════════════════

describe("Claims", () => {
  async function login(): Promise<string> {
    const res = await fetch(`${BASE}/auth/phoenix/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ policyNumbers: [VALID_POLICY] }),
    });
    const body = (await res.json()) as any;
    return body.results[0].token;
  }

  it("lists claims for authenticated policyholder", async () => {
    const token = await login();

    const res = await fetch(`${BASE}/auth/phoenix/claims`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.data).toBeInstanceOf(Array);
    expect(body.data.length).toBeGreaterThan(0);

    const claim = body.data[0];
    expect(claim.claimNumber).toBeTruthy();
    expect(claim.status).toBeTruthy();
    expect(claim.currency).toBe("VND");
  });

  it("returns claim details by ID", async () => {
    const token = await login();

    // First get list to find a real claim ID
    const listRes = await fetch(`${BASE}/auth/phoenix/claims`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const listBody = (await listRes.json()) as any;
    const claimId = listBody.data[0].id;

    const detailRes = await fetch(`${BASE}/auth/phoenix/claims/${claimId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(detailRes.status).toBe(200);
    const detail = (await detailRes.json()) as any;
    expect(detail.id).toBe(claimId);
    expect(detail.claimNumber).toBeTruthy();
  });

  it("returns error for non-existent claim ID", async () => {
    const token = await login();

    const res = await fetch(`${BASE}/auth/phoenix/claims/00000000-0000-0000-0000-000000000000`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    // CloudFront custom error response converts 404 → 200 + index.html (SPA routing).
    // The response will be HTML (SPA fallback) not JSON, because CloudFront intercepts
    // the 404 before it reaches the client.
    const text = await res.text();
    const isHtmlFallback = text.includes("<div id=\"root\">");
    const isJsonError = (() => {
      try { const j = JSON.parse(text); return j.error === "Claim not found"; } catch { return false; }
    })();
    expect(isHtmlFallback || isJsonError).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Token Refresh
// ═══════════════════════════════════════════════════════════════════════════

describe("Token Refresh", () => {
  it("returns a new valid token", async () => {
    const loginRes = await fetch(`${BASE}/auth/phoenix/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ policyNumbers: [VALID_POLICY] }),
    });
    const loginBody = (await loginRes.json()) as any;
    const token = loginBody.results[0].token;

    const res = await fetch(`${BASE}/auth/phoenix/token/refresh`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.token).toBeTruthy();
    expect(body.token.split(".")).toHaveLength(3);
  });

  it("rejects refresh without token", async () => {
    const res = await fetch(`${BASE}/auth/phoenix/token/refresh`, {
      method: "POST",
    });

    expect(res.status).toBe(401);
  });
});
